/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { chromium, devices, expect } from "@playwright/test";
import { mkdtemp, mkdir, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
async function hitbox(locator, attempt = 0) {
  try {
  await locator.waitFor({state:"visible"});
  await expect(locator).toBeEnabled();
  await locator.scrollIntoViewIfNeeded();
  // Layout can settle after scrollIntoView or a preceding full-page screenshot.
  await locator.evaluate(element => new Promise(resolve => {
    let previous = "", stable = 0, frames = 0;
    const check = () => {
      const rect = element.getBoundingClientRect();
      const current = `${rect.x},${rect.y},${rect.width},${rect.height}`;
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable >= 2 || ++frames >= 120) resolve(null); else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }));
  const box = await locator.boundingBox();
  assert(box,"The gesture target must be rendered before sending pointer input");
  return box;
  } catch (error) {
    if (attempt < 2 && /not attached|detached/.test(String(error))) return hitbox(locator, attempt + 1);
    throw error;
  }
}
const root = resolve(import.meta.dirname, "..");
const evidenceDir = resolve(root, process.env.ASTRA_EVIDENCE_DIR ?? "progress/screenshots");
await mkdir(evidenceDir, { recursive: true });
const binaries = join(root,"target",process.env.ASTRA_TEST_PROFILE === "release" ? "release" : "debug");
const temp = await realpath(
  await mkdtemp(join(await realpath("/tmp"), "lp-browser-")),
);
const state = join(temp, "state"),
  folder = join(temp, "Field notes");
await mkdir(state, { mode: 0o700 });
await mkdir(folder, { mode: 0o700 });
const socket = join(state, "projectd.sock");
const cli = (...args) => {
  let output;
  try {
    output = execFileSync(join(binaries,"projectctl"),["--socket",socket,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  } catch (error) {
    // Registration returns an accepted job; the test explicitly checks its state.
    if(error.status !== 9) throw error;
    output = error.stdout;
  }
  const envelope = JSON.parse(output);
  assert.equal(envelope.api_version,"1");
  assert.equal(envelope.ok,true);
  return envelope.data;
};
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(temp, "key.pem"),
    "-out",
    join(temp, "cert.pem"),
    "-subj",
    "/CN=localhost",
    "-days",
    "1",
  ],
  { stdio: "ignore" },
);
const reserve = http.createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const proxy = https.createServer(
  {
    key: await readFile(join(temp, "key.pem")),
    cert: await readFile(join(temp, "cert.pem")),
  },
  (incoming, outgoing) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    request.on("error", () => {
      outgoing.writeHead(503);
      outgoing.end();
    });
    incoming.pipe(request);
    outgoing.on("close", () => request.destroy());
  },
);
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const origin = `https://localhost:${proxy.address().port}`;
const daemon = spawn(
  join(binaries, "projectd"),
  ["--data-dir", state, "--public-origin", origin, "--port", String(port)],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let daemonLog = "";
daemon.stderr.on("data", (data) => (daemonLog += data));
let browser;
try {
  let ready = false,
    lastFailure;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      cli("hello");
      ready = true;
      break;
    } catch (error) {
      lastFailure = error.stderr?.toString() ?? error.message;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert(ready, daemonLog + lastFailure);
  const plan = cli("registration-plan", folder, "--name", "Field notes");
  cli("register", plan.plan_id);
  browser = await chromium.launch({ headless: true, executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.stack); });
  await page.goto(origin);
  await page.getByRole("button", { name: "Request access" }).click();
  await page.getByText("Compare this challenge on the host machine:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page.getByRole("button", { name: "I approved this browser" }).click();
  await page
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();
  let pickerRequests = 0;
  await page.route("**/api/v1/native-folder-selections", route => {
    pickerRequests++;
    const input = route.request().postDataJSON();
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({selection_id:input.selection_id,state:"cancelled",plan:null,error:null})});
  });
  await page.getByRole("button",{name:"Projects",exact:true}).click();
  await page.getByRole("button",{name:"Add project",exact:false}).click();
  await page.getByRole("button",{name:"Choose folder…",exact:true}).click();
  await page.getByText("Folder selection cancelled. No project files were changed.",{exact:true}).waitFor();
  assert.equal(pickerRequests,1);
  await page.getByRole("button",{name:"Close add project",exact:true}).click();
  await page.unroute("**/api/v1/native-folder-selections");
  const nativeFolder = join(temp,"Native selection fixture");
  await mkdir(nativeFolder);
  const nativePlan = cli("registration-plan",nativeFolder,"--name","Native-selected project");
  await page.route("**/api/v1/native-folder-selections",route => {
    const input = route.request().postDataJSON();
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({selection_id:input.selection_id,state:"selected",plan:nativePlan,error:null})});
  });
  await page.getByRole("button",{name:"Add project",exact:false}).click();
  await page.getByRole("button",{name:"Choose folder…",exact:true}).click();
  await page.getByText(nativeFolder,{exact:true}).waitFor();
  await assert.rejects(readFile(join(nativeFolder,".project/project.md")),{code:"ENOENT"});
  await page.getByRole("dialog").getByRole("button",{name:"Add project",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.match(await readFile(join(nativeFolder,".project/project.md"),"utf8"),/Native-selected project/);
  await page.unroute("**/api/v1/native-folder-selections");
  const pickRoot = join(temp, "Selectable folders");
  const selectedFolder = join(pickRoot, "Chosen project");
  await mkdir(selectedFolder, {recursive:true});
  cli("add-root", pickRoot, "--label", "Test projects");
  await page.getByRole("button",{name:"Projects",exact:true}).click();
  await page.getByRole("button",{name:"Add project",exact:false}).click();
  await page.getByText("Remote host without a desktop?",{exact:true}).click();
  await page.getByRole("button",{name:"Browse approved folders",exact:true}).click();
  await page.getByRole("button",{name:"Open folder: Chosen project",exact:true}).click();
  await page.getByLabel("Project name",{exact:true}).fill("Chosen in browser");
  await page.getByRole("button",{name:"Choose this folder",exact:true}).click();
  await page.getByText("Selected folder",{exact:true}).waitFor();
  await assert.rejects(readFile(join(selectedFolder,".project/project.md")),{code:"ENOENT"});
  await page.getByRole("button",{name:"Add selected project",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("projects").items.some(item => item.title === "Chosen in browser"),true);
  assert.match(await readFile(join(selectedFolder,".project/project.md"),"utf8"),/Chosen in browser/);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption(plan.project_id);
  await page.getByRole("button", { name: "Add card", exact: false }).click();
  await page.getByLabel("Title", { exact: true }).fill("Ship the field guide");
  await page.getByLabel("Start", { exact: true }).fill("2026-09-07");
  await page.getByLabel("End", { exact: true }).fill("2026-09-12");
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-15");
  await page
    .getByLabel(/^Description/)
    .fill('A real browser write.\n\n<script>alert("untrusted")</script>');
  await page.getByRole("button", { name: "Preview Markdown", exact: true }).click();
  assert.equal(await page.locator(".markdown script, .markdown img").count(), 0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  await page.getByText("Connected to host", { exact: false }).waitFor();
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({
    path: join(evidenceDir, "desktop-board.png"),
    fullPage: true,
  });
  const cards = cli("get", `/api/v1/projects/${plan.project_id}/cards`).items;
  assert.equal(cards.length, 1);
  const path = `/api/v1/projects/${plan.project_id}/cards/${cards[0].id}`;
  const resource = cli("get", path);
  assert.equal(resource.metadata.title, "Ship the field guide");
  assert.equal(resource.metadata.schedule.end, "2026-09-12");
  const second = await browser.newContext({
    ignoreHTTPSErrors: true,
    ...devices["iPhone 13"],
    storageState: await context.storageState(),
  });
  const mobile = await second.newPage();
  await mobile.goto(origin);
  await mobile
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();
  await mobile.getByRole("button", { name: "Board", exact: true }).click();
  await mobile.getByRole("heading", { name: "Ship the field guide" }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Ship the revised guide");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await mobile
    .getByLabel("Title", { exact: true })
    .fill("Keep my mobile draft");
  await mobile.getByRole("button", { name: "Save changes" }).click();
  await mobile
    .getByText("Current saved version · your draft stays above")
    .waitFor();
  assert.equal(
    await mobile.getByLabel("Title", { exact: true }).inputValue(),
    "Keep my mobile draft",
  );
  assert.equal(cli("get", path).metadata.title, "Ship the revised guide");
  await mobile.screenshot({
    path: join(evidenceDir, "mobile-conflict.png"),
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Close editor" }).click();
  await mobile.getByRole("button", { name: "Discard draft", exact: true }).click();

  await page.getByRole("heading", { name: "Ship the revised guide" }).click();
  await page.getByText("Change history", { exact: true }).click();
  await page.getByRole("button", { name: "First history page", exact: true }).click();
  await page
    .locator("button:enabled")
    .filter({ hasText: /^Undo this change$/ })
    .first()
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(cli("get", path).metadata.title, "Ship the field guide");
  await page.getByRole("heading", { name: "Ship the field guide" }).click();
  await page.getByRole("button", { name: "Pin to focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove from focus", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    cli("get", "/api/v1/workspace/focus").items[0].card_id,
    cards[0].id,
  );
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  for (const view of ["Calendar", "Timeline", "List", "Updates", "Projects"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
  }

  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await page.getByRole("button", { name: "Add update", exact: false }).click();
  await page.getByLabel("Summary", { exact: true }).fill("Browser report");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Browser report", exact: true }).click();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark unread", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("Unread only").check();
  await page.getByRole("heading", { name: "Browser report", exact: true }).waitFor({ state: "hidden" });
  const reports = cli("get", `/api/v1/views/list?type=update&project_id=${plan.project_id}`).items;
  assert.equal(reports[0].read, true);
  assert.equal(cli("get", `/api/v1/projects/${plan.project_id}/updates/${reports[0].id}`).read, true);
  await page.getByLabel("Unread only").uncheck();

  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByLabel("Timezone", { exact: true }).fill("UTC");
  await page.getByLabel("Default view", { exact: true }).selectOption("list");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // Saving preferences retains the current explicit route. A clean entry uses the default.
  await expect(page.getByRole("button", { name: "Updates", exact: true })).toHaveAttribute("aria-current", "page");
  assert.equal(cli("get", "/api/v1/workspace/preferences").timezone, "UTC");
  assert.equal(cli("get", "/api/v1/workspace/preferences").preferences.default_view, "list");
  await page.goto(origin);
  await page.getByRole("heading", { name: "List.", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "List.", exact: true }).waitFor();
  const cardFile = join(folder, ".project", "cards", `${cards[0].id}.md`);
  const source = await readFile(cardFile, "utf8");
  await writeFile(cardFile, source.replace("Ship the field guide", "External editor update"));
  await page.getByText("External editor update", { exact: true }).waitFor({timeout: 10000});
  assert.equal(cli("get", path).metadata.title, "External editor update");
  await page.getByLabel("Project", { exact: true }).selectOption(plan.project_id);
  await page.getByRole("button", {name:"Timeline",exact:true}).click();
  await page.getByLabel("Month",{exact:true}).fill("2026-09");
  const moveHandle = page.getByRole("button",{name:"Move plan: External editor update",exact:true});
  await moveHandle.waitFor();
  const beforeGesture = cli("get",path);
  for (const cancellation of ["escape","pointercancel","orientationchange","second-pointer"]) {
    const bounds=await hitbox(moveHandle);
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+48,bounds.y+bounds.height/2,{steps:4});
    if(cancellation==="escape") await page.keyboard.press("Escape");
    else if(cancellation==="pointercancel") await moveHandle.dispatchEvent("pointercancel",{pointerId:1});
    else if(cancellation==="orientationchange") await page.evaluate(()=>window.dispatchEvent(new Event("orientationchange")));
    else await page.evaluate(()=>window.dispatchEvent(new PointerEvent("pointerdown",{pointerId:99,isPrimary:false})));
    await page.mouse.up();
    assert.equal(await page.getByRole("dialog").count(),0);
    assert.equal(cli("get",path).version,beforeGesture.version);
  }
  const concurrentGesture = join(temp,"during-gesture.json");
  const held = await hitbox(moveHandle);
  await page.mouse.move(held.x+held.width/2,held.y+held.height/2);await page.mouse.down();
  await page.mouse.move(held.x+held.width/2+48,held.y+held.height/2,{steps:4});
  await writeFile(concurrentGesture,JSON.stringify({set:{title:"During held gesture"}}));
  cli("command","PATCH",path,"--json-file",concurrentGesture,"--if-version",cli("get",path).version);
  await page.waitForTimeout(700);
  assert.equal(await moveHandle.count(),1,"Incoming SSE must not replace the held gesture baseline");
  await page.mouse.up();
  await page.getByRole("button",{name:"Save planned dates",exact:true}).click();
  await page.getByText("Current saved schedule:",{exact:false}).waitFor();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  let busyReads = 0;
  await page.route("**/api/v1/views/gantt?*", async route => {
    if (busyReads++ === 0) await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({api_version:"1",error:{code:"SERVER_BUSY",message:"Synthetic bounded worker saturation"}})});
    else await route.continue();
  });
  await writeFile(concurrentGesture,JSON.stringify({set:{title:"External editor update"}}));
  cli("command","PATCH",path,"--json-file",concurrentGesture,"--if-version",cli("get",path).version);
  await moveHandle.waitFor();
  assert(busyReads >= 2);
  await page.unroute("**/api/v1/views/gantt?*");
  const bounds=await hitbox(moveHandle);
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width/2+48,bounds.y+bounds.height/2,{steps:4});
  await page.mouse.up();
  await page.getByRole("dialog",{name:"Change planned dates"}).waitFor();
  assert.equal(await page.getByLabel("Planned start",{exact:true}).inputValue(),"2026-09-08");
  assert.equal(await page.getByLabel("Planned end",{exact:true}).inputValue(),"2026-09-13");
  await page.getByRole("button",{name:"Save planned dates",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.deepEqual(cli("get",path).metadata.due,beforeGesture.metadata.due);
  assert.equal(cli("get",path).metadata.schedule.start,"2026-09-08");
  await page.screenshot({path:join(evidenceDir, "desktop-timeline.png"),fullPage:true});

  const resize = page.getByRole("button",{name:"Resize end: External editor update",exact:true});
  const resizeBounds=await hitbox(resize);
  await page.mouse.move(resizeBounds.x+resizeBounds.width/2,resizeBounds.y+resizeBounds.height/2);
  await page.mouse.down();await page.mouse.move(resizeBounds.x+resizeBounds.width/2+48,resizeBounds.y+resizeBounds.height/2,{steps:4});await page.mouse.up();
  assert.equal(await page.getByLabel("Planned start",{exact:true}).inputValue(),"2026-09-08");
  assert.equal(await page.getByLabel("Planned end",{exact:true}).inputValue(),"2026-09-14");
  const conflictingPatch=join(temp,"date-conflict.json");
  await writeFile(conflictingPatch,JSON.stringify({set:{title:"Competing timeline edit"}}));
  cli("command","PATCH",path,"--json-file",conflictingPatch,"--if-version",cli("get",path).version);
  await page.getByRole("button",{name:"Save planned dates",exact:true}).click();
  await page.getByText("Current saved schedule:",{exact:false}).waitFor();
  assert.equal(await page.getByLabel("Planned end",{exact:true}).inputValue(),"2026-09-14");
  assert.equal(cli("get",path).metadata.schedule.end,"2026-09-13");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();

  try { await page.getByRole("button",{name:"Move plan: Competing timeline edit",exact:true}).click(); } catch (error) { console.error(await page.locator("body").innerText(), errors, daemonLog); throw error; }
  await page.getByLabel("Planned end",{exact:true}).fill("2026-09-14");
  await page.route(`**${path}`,async route=>{
    if(route.request().method()==="PATCH") await route.fulfill({status:202,contentType:"application/json",body:JSON.stringify({state:"prepared"})});
    else await route.continue();
  });
  await page.getByRole("button",{name:"Save planned dates",exact:true}).click();
  await page.getByText("Command is prepared.",{exact:false}).waitFor({timeout:2000});
  assert.equal(cli("get",path).metadata.schedule.end,"2026-09-13");
  await page.unroute(`**${path}`);
  await page.getByRole("button",{name:"Retry same command",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("get",path).metadata.schedule.end,"2026-09-14");

  const agentContext = cli("--project", folder, "context", "--max-bytes", "4096", "--json");
  assert(Buffer.byteLength(JSON.stringify(agentContext)) <= 4096);
  const typedCard = cli("--project", folder, "card", "create", "--title", "Typed CLI task");
  const typedId = typedCard.result.resource.metadata.id;
  assert.equal(cli("--project", folder, "card", "get", typedId).metadata.title, "Typed CLI task");
  const patchFile = join(temp, "patch.json");
  await writeFile(patchFile, JSON.stringify({set:{status:"active"}}));
  cli("--project", folder, "card", "set", typedId, "--patch-file", patchFile, "--if-version", typedCard.result.resource.version);
  assert.equal(cli("--project", folder, "card", "get", typedId).metadata.status, "active");
  await page.getByRole("button",{name:"Board",exact:true}).click();
  await expect(page.locator(".astra-board .date-scroll")).toHaveCount(1);
  const activeColumn = page.locator(".astra-column-active");
  await activeColumn.getByRole("button", {name:"Collapse column", exact:true}).click();
  await expect(page.locator(`[data-board-card="${typedId}"]`)).toHaveCount(0);
  await activeColumn.getByRole("button", {name:"Expand column", exact:true}).click();
  const footerAdd = page.getByRole("button", {name:"Add card in review",exact:true});
  await hitbox(footerAdd);
  await footerAdd.focus();
  await expect(footerAdd).toBeFocused();
  await page.keyboard.press("Enter");
  const quickTitle = page.getByLabel("New card title in review",{exact:true});
  await expect(quickTitle).toBeFocused();
  await quickTitle.fill("Column-created card");
  await quickTitle.press("Enter");
  await expect.poll(() => cli("--project",folder,"card","list","--status","review").items.length).toBe(1);
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("--project",folder,"card","list","--status","review").items[0].title,"Column-created card");
  await expect(page.locator("[data-board-card] select, [data-board-card] .handle, [data-board-card] details")).toHaveCount(0);
  await page.locator(`[data-board-card="${typedId}"] .title`).click();
  await page.getByLabel("Status",{exact:true}).selectOption("planned");
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("--project",folder,"card","get",typedId).metadata.status,"planned");
  const boardHandle=page.locator(`[data-board-card="${typedId}"] .title`);
  const boardTarget=page.locator(`[data-board-card="${cards[0].id}"] .title`);
  // Regression: dragging a card title should move the card, not open its editor.
  const sourceTitle = page.locator(`[data-board-card="${typedId}"] .title`);
  const sourceBounds=await hitbox(sourceTitle),targetBounds=await hitbox(boardTarget);
  await page.mouse.move(sourceBounds.x+sourceBounds.width/2,sourceBounds.y+sourceBounds.height/2);await page.mouse.down();
  await page.mouse.move(targetBounds.x+targetBounds.width/2,targetBounds.y+10,{steps:6});
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await expect(page.locator("[data-board-drop-indicator]")).toBeVisible();
  await page.screenshot({path:join(evidenceDir, "board-drag-preview.png"),fullPage:true});
  await page.mouse.up();
  await expect.poll(() => cli("--project",folder,"card","list","--status","planned").items[0].id).toBe(typedId);
  await page.getByRole("dialog").waitFor({state:"hidden"});
  const ordered=cli("--project",folder,"card","list","--status","planned").items;
  assert.equal(ordered[0].id,typedId);
  await page.screenshot({path:join(evidenceDir, "desktop-board.png"),fullPage:true});
  await expect(boardHandle).toBeEnabled();
  await expect(page.locator('[data-board-status="planned"]').first()).toHaveAttribute("data-board-card", typedId);
  await boardHandle.press("Alt+ArrowDown");
  try {
    await expect.poll(() => cli("--project",folder,"card","list","--status","planned").items.at(-1).id).toBe(typedId);
  } catch (error) {
    console.error("Keyboard reorder state", ordered, cli("--project",folder,"card","list","--status","planned").items, errors, await page.locator("body").innerText());
    throw error;
  }
  await page.getByRole("dialog").waitFor({state:"hidden"});

  // Drag between statuses, retaining the exact command when a response is uncertain.
  const typedPath = `/api/v1/projects/${plan.project_id}/cards/${typedId}`;
  const attempts = [];
  await page.route(`**${typedPath}`, async route => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.continue();
    attempts.push({body:request.postData(),id:request.headers()["x-request-id"],epoch:request.headers()["x-command-epoch"],version:request.headers()["if-match"]});
    if (attempts.length === 1) return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"SERVER_BUSY"}})});
    return route.continue();
  });
  const targetColumn = page.locator(".astra-column-active [data-kanban-column-cards]");
  await hitbox(targetColumn);
  const statusSource = await hitbox(boardHandle);
  const emptyColumn = await targetColumn.boundingBox();
  await page.mouse.move(statusSource.x+30,statusSource.y+20); await page.mouse.down();
  await page.mouse.move(statusSource.x+40,statusSource.y+20,{steps:2});
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await page.mouse.move(emptyColumn.x+60,emptyColumn.y+60,{steps:6});
  await expect(page.locator("[data-board-drop-indicator]")).toBeVisible();
  await page.mouse.up();
  await page.getByRole("button",{name:"Retry same command",exact:true}).waitFor();
  assert.equal(cli("get",typedPath).metadata.status,"planned");
  await page.getByRole("button",{name:"Retry same command",exact:true}).click();
  await expect.poll(() => cli("get",typedPath).metadata.status).toBe("active");
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(attempts.length,2); assert.deepEqual(attempts[0],attempts[1]);
  await page.unroute(`**${typedPath}`);
  const returnSource = await hitbox(boardHandle), returnTarget = await hitbox(boardTarget);
  await page.mouse.move(returnSource.x+30,returnSource.y+20); await page.mouse.down();
  await page.mouse.move(returnTarget.x+60,returnTarget.y+returnTarget.height+15,{steps:6}); await page.mouse.up();
  await expect.poll(() => cli("get",typedPath).metadata.status).toBe("planned");
  await page.getByRole("dialog").waitFor({state:"hidden"});

  // A live refresh must not replace the version captured by a held board gesture.
  const heldSource = await hitbox(boardHandle), heldTarget = await hitbox(boardTarget);
  await page.mouse.move(heldSource.x + heldSource.width/2, heldSource.y + heldSource.height/2);
  await page.mouse.down();
  await page.mouse.move(heldSource.x + heldSource.width/2 + 8, heldSource.y + heldSource.height/2, {steps:2});
  const heldVersion = cli("--project", folder, "card", "get", typedId).version;
  await writeFile(patchFile, JSON.stringify({set:{priority:"high"}}));
  cli("--project", folder, "card", "set", typedId, "--patch-file", patchFile, "--if-version", heldVersion);
  await expect.poll(() => page.locator("[data-dragging]").count()).toBe(1);
  await page.waitForTimeout(300);
  await page.mouse.move(heldTarget.x + heldTarget.width/2, heldTarget.y + 10, {steps:6});
  await page.mouse.up();
  await page.getByText("The card or its neighbors changed.", {exact:false}).waitFor();
  await expect(page.getByRole("button", {name:"Confirm move", exact:true})).toBeDisabled();
  await page.getByRole("button", {name:"Cancel", exact:true}).click();
  assert.equal(cli("--project",folder,"card","list","--status","planned").items.at(-1).id,typedId);
  assert.equal(cli("--project",folder,"card","get",typedId).metadata.priority,"high");

  // Counts and legal placements refer to server pages, not SVAR's loaded array.
  const pageFixture = join(temp,"board-page.json");
  for (let index = 0; index < 50; index++) {
    await writeFile(pageFixture, JSON.stringify({title:`Review page ${index}`,status:"review"}));
    cli("command","POST",`/api/v1/projects/${plan.project_id}/cards`,"--json-file",pageFixture);
  }
  const reviewColumn = page.locator(".astra-column-review");
  await expect(reviewColumn.getByRole("heading", {name:"review · 51",exact:true})).toBeVisible();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(50);
  await expect(reviewColumn.locator(".column-footer")).toHaveCount(1);
  await page.locator(`[data-board-card="${typedId}"] .title`).click();
  await expect(page.getByLabel("Title",{exact:true})).toHaveValue("Typed CLI task");
  await page.getByRole("button",{name:"Close editor",exact:true}).click();
  const scrollColumn = reviewColumn.locator("[data-kanban-column-cards]");
  const scrollBox = await scrollColumn.boundingBox();
  const dragBox = await hitbox(boardHandle);
  const dragVersion = cli("--project",folder,"card","get",typedId).version;
  await page.mouse.move(dragBox.x + 20, dragBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(scrollBox.x + scrollBox.width/2,scrollBox.y + scrollBox.height - 12,{steps:8});
  await expect.poll(() => scrollColumn.evaluate(node => node.scrollTop)).toBeGreaterThan(30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-board-drag-preview]")).toHaveCount(0);
  const stoppedScroll = await scrollColumn.evaluate(node => node.scrollTop);
  await page.waitForTimeout(100);
  assert.equal(await scrollColumn.evaluate(node => node.scrollTop),stoppedScroll);
  assert.equal(cli("--project",folder,"card","get",typedId).version,dragVersion);
  await scrollColumn.evaluate(node => node.scrollTop = 0);
  await page.getByRole("button",{name:"Next 50 in review",exact:true}).click();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(1);
  // The preceding card is unknown on page two, so dropping before its first card is illegal.
  const hiddenPredecessorTarget = await hitbox(reviewColumn.locator("[data-board-card] .title"));
  const boundarySource = await hitbox(boardHandle);
  await page.mouse.move(boundarySource.x + 20,boundarySource.y + 15);
  await page.mouse.down();
  await page.mouse.move(hiddenPredecessorTarget.x + 30,hiddenPredecessorTarget.y + 5,{steps:6});
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await expect(page.locator("[data-board-drop-indicator]")).toBeHidden();
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(cli("--project",folder,"card","get",typedId).version,dragVersion);
  await page.getByRole("button",{name:"First page in review",exact:true}).click();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(50);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.scrollTo(0,0); });
  await page.screenshot({path:join(evidenceDir, "desktop-board-dark.png"),fullPage:true});
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:join(evidenceDir, "mobile-board.png"),fullPage:true});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({width:1440,height:1000});

  // Touch starts with a hold; an immediate swipe must remain normal scrolling.
  await mobile.getByRole("button",{name:"Board",exact:true}).click();
  await mobile.getByLabel("Project",{exact:true}).selectOption(plan.project_id);
  const mobileSource = mobile.locator(`[data-board-card="${typedId}"] .title`);
  const mobileTarget = mobile.locator(`[data-board-card="${cards[0].id}"] .title`);
  const touchSource = await hitbox(mobileSource), touchTarget = await hitbox(mobileTarget);
  const cdp = await second.newCDPSession(mobile);
  const touchPoint = (x,y) => [{x,y,id:1,radiusX:3,radiusY:3}];
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:touchPoint(touchSource.x+30,touchSource.y+20)});
  await expect(mobile.locator("[data-board-drag-preview]")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touchPoint(touchTarget.x+30,touchTarget.y+5)});
  await expect(mobile.locator("[data-board-drop-indicator]")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(() => cli("--project",folder,"card","list","--status","planned").items[0].id).toBe(typedId);
  await mobile.getByRole("dialog").waitFor({state:"hidden"});
  const mobileReview = mobile.locator(".astra-column-review [data-kanban-column-cards]");
  await mobileReview.scrollIntoViewIfNeeded();
  await mobileReview.evaluate(node => node.scrollTop = 0);
  const swipeBox = await mobileReview.boundingBox();
  const swipeX = swipeBox.x + swipeBox.width/2, swipeY = Math.min(swipeBox.y + swipeBox.height - 20, (await mobile.evaluate(() => innerHeight)) - 20);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:touchPoint(swipeX,swipeY)});
  for (let step = 1; step <= 4; step++) await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:touchPoint(swipeX,swipeY-step*25)});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(() => mobileReview.evaluate(node => node.scrollTop)).toBeGreaterThan(10);
  await expect(mobile.locator("[data-board-drag-preview]")).toHaveCount(0);
  await cdp.detach();

  // Quick creation keeps its title and command identity when the result is uncertain.
  const quickAttempts = [];
  await page.route(`**/api/v1/projects/${plan.project_id}/cards`,async route => {
    const request=route.request();
    if(request.method() !== "POST") return route.continue();
    quickAttempts.push({body:request.postData(),id:request.headers()["x-request-id"],epoch:request.headers()["x-command-epoch"]});
    if(quickAttempts.length === 1) return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"SERVER_BUSY"}})});
    return route.continue();
  });
  await page.getByRole("button",{name:"Add card in active",exact:true}).click();
  await page.getByLabel("New card title in active",{exact:true}).fill("Quick retry card");
  await page.getByLabel("New card title in active",{exact:true}).press("Enter");
  await page.getByRole("button",{name:"Retry same command",exact:true}).waitFor();
  await expect(page.getByLabel("Title",{exact:true})).toHaveValue("Quick retry card");
  await expect(page.getByRole("button",{name:"Create",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Retry same command",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(quickAttempts.length,2); assert.deepEqual(quickAttempts[0],quickAttempts[1]);
  assert.equal(cli("--project",folder,"card","list","--status","active").items.filter(item=>item.title==="Quick retry card").length,1);
  await page.unroute(`**/api/v1/projects/${plan.project_id}/cards`);

  // Each project's collapse and first-page scroll survive navigation and reload.
  // With Cancelled collapsed by default, use a viewport that still overflows after Active is collapsed.
  await page.setViewportSize({width: 1000, height: 1000});
  await page.locator(".astra-column-active").getByRole("button",{name:"Collapse column",exact:true}).click();
  const savedScroll = await page.evaluate(() => {
    const horizontal=document.querySelector(".astra-board .date-scroll");
    const vertical=document.querySelector(".astra-column-review [data-kanban-column-cards]");
    horizontal.scrollLeft=40; vertical.scrollTop=240;
    return {horizontal:horizontal.scrollLeft,vertical:vertical.scrollTop};
  });
  assert(savedScroll.horizontal>0 && savedScroll.vertical>0);
  await page.getByRole("button",{name:"Focus",exact:true}).click();
  await page.getByRole("button",{name:"Board",exact:true}).click();
  const assertRestored = async () => {
    await expect(page.locator(".astra-column-active").getByRole("button",{name:"Expand column",exact:true})).toBeVisible();
    await expect.poll(() => page.locator(".astra-board .date-scroll").evaluate(node=>node.scrollLeft)).toBe(savedScroll.horizontal);
    await expect.poll(() => page.locator(".astra-column-review [data-kanban-column-cards]").evaluate(node=>node.scrollTop)).toBe(savedScroll.vertical);
  };
  await assertRestored();
  await page.getByLabel("Project",{exact:true}).selectOption(nativePlan.project_id);
  await expect(page.locator(".astra-column-active").getByRole("button",{name:"Collapse column",exact:true})).toBeVisible();
  await page.getByLabel("Project",{exact:true}).selectOption(plan.project_id);
  await assertRestored();
  await page.reload();
  await assertRestored();
  await page.screenshot({path:join(evidenceDir, "board-remembered-view.png"),fullPage:true});
  await page.setViewportSize({width: 1440, height: 1000});

  const focusBefore = cli("get","/api/v1/workspace/focus");
  const focusFile = join(temp,"focus.json");
  await writeFile(focusFile,JSON.stringify({items:[...focusBefore.items,{project_id:plan.project_id,card_id:typedId}]}));
  cli("command","PUT","/api/v1/workspace/focus","--json-file",focusFile,"--if-version",focusBefore.version);
  await page.getByRole("button",{name:"Focus",exact:true}).click();
  await page.getByRole("button",{name:"Arrange focus",exact:true}).click();
  await page.getByRole("button",{name:"Move up: Typed CLI task",exact:true}).click();
  await page.getByRole("button",{name:"Save focus order",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("get","/api/v1/workspace/focus").items[0].card_id,typedId);

  const milestoneFile=join(temp,"milestone.json");
  await writeFile(milestoneFile,JSON.stringify({title:"Release gate",due:{date:"2026-09-30",kind:"hard"}}));
  cli("command","POST",`/api/v1/projects/${plan.project_id}/milestones`,"--json-file",milestoneFile);
  await page.getByRole("button",{name:"Timeline",exact:true}).click();
  await page.getByRole("button",{name:"hard milestone deadline: Release gate",exact:true}).waitFor();
  await page.getByRole("button",{name:"Calendar",exact:true}).click();
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("week");
  await expect(page.locator(".ec-body .ec-day")).toHaveCount(7);
  await expect(page.getByLabel("Go to date",{exact:true})).toHaveValue((await page.locator(".topbar .date").innerText()).trim());
  await page.getByLabel("Go to date",{exact:true}).fill("2026-09-08");
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("day");
  await expect(page.locator(".ec-body .ec-day")).toHaveCount(1);
  await page.getByRole("button",{name:"Next calendar period",exact:true}).click();
  await expect(page.getByLabel("Go to date",{exact:true})).toHaveValue("2026-09-09");
  await page.getByRole("button",{name:"Previous calendar period",exact:true}).focus();
  await page.keyboard.press("Alt+2");
  await expect(page.getByLabel("Calendar layout",{exact:true})).toHaveValue("week");
  await page.getByRole("button",{name:"New scheduled card",exact:true}).click();
  await expect(page.getByLabel("Start",{exact:true})).toHaveValue("2026-09-09");
  await page.getByLabel("Title",{exact:true}).fill("Waterfall successor");
  await page.getByLabel("End",{exact:true}).fill("2026-09-11");
  await page.getByRole("button",{name:"Create",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  const waterfall = cli("get",`/api/v1/views/list?type=card&project_id=${plan.project_id}&limit=200`).items.find(row=>row.title==="Waterfall successor");
  assert(waterfall);
  await page.getByRole("button",{name:"Timeline",exact:true}).click();
  await page.getByLabel("Predecessor",{exact:true}).selectOption(cards[0].id);
  await page.getByLabel("Successor",{exact:true}).selectOption(waterfall.id);
  await page.getByRole("button",{name:"Connect cards",exact:true}).click();
  await page.getByRole("button",{name:"Save dependencies",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  const waterfallPath=`/api/v1/projects/${plan.project_id}/cards/${waterfall.id}`;
  assert.deepEqual(cli("get",waterfallPath).metadata.depends_on,[cards[0].id]);
  const forecast=cli("get",`/api/v1/views/gantt?project_id=${plan.project_id}`).forecasts.find(row=>row.id===waterfall.id);
  assert.equal(forecast.schedule.start,"2026-09-15");
  assert.equal(forecast.schedule.end,"2026-09-17");
  await page.getByLabel("Dependency forecast",{exact:true}).check();
  await expect(page.getByRole("button",{name:"Move plan: Waterfall successor",exact:true})).toBeDisabled();
  assert.equal(cli("get",waterfallPath).metadata.schedule.start,"2026-09-09");
  await page.screenshot({path:join(evidenceDir, "gantt-waterfall.png"),fullPage:true});
  await page.getByLabel("Dependency forecast",{exact:true}).uncheck();
  await page.getByLabel("Predecessor",{exact:true}).selectOption(waterfall.id);
  await page.getByLabel("Successor",{exact:true}).selectOption(cards[0].id);
  await page.getByRole("button",{name:"Connect cards",exact:true}).click();
  await page.getByRole("button",{name:"Save dependencies",exact:true}).click();
  await page.getByRole("alert").filter({hasText:/DEPENDENCY|dependency/i}).waitFor();
  assert(!cli("get",path).metadata.depends_on?.includes(waterfall.id));
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("button",{name:"Calendar",exact:true}).click();
  await page.getByLabel("Go to date",{exact:true}).fill("2026-09-09");
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("week");
  const calendarCard=page.getByRole("button",{name:"Planned work: Waterfall successor",exact:true});
  await calendarCard.waitFor();
  await calendarCard.focus();await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByLabel("Planned start",{exact:true})).toHaveValue("2026-09-10");
  await page.getByRole("button",{name:"Save planned dates",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("get",waterfallPath).metadata.schedule.end,"2026-09-12");
  await page.screenshot({path:join(evidenceDir, "calendar-week.png"),fullPage:true});
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("month");
  await page.getByRole("button",{name:"List",exact:true}).click();
  await page.getByLabel("Search content",{exact:true}).fill("untrusted");
  await page.getByText("Competing timeline edit",{exact:true}).waitFor();
  await page.getByText("Typed CLI task",{exact:true}).waitFor({state:"hidden"});
  await page.getByLabel("Search content",{exact:true}).fill("");
  assert.equal(cli("--project",folder,"git").error,"NOT_A_GIT_ROOT");
  await page.getByRole("button",{name:"Git",exact:true}).click();
  await page.getByText("Observation unavailable: NOT_A_GIT_ROOT",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Close Git observation",exact:true}).click();
  await page.getByRole("button",{name:"Host diagnostics",exact:true}).click();
  await page.getByText("0 source issues · 0 unresolved commands",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Close diagnostics",exact:true}).click();
  await page.getByRole("button",{name:"Workspace settings",exact:true}).click();
  await page.getByLabel("Theme",{exact:true}).selectOption("dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),"dark");
  await page.getByRole("button",{name:"Close settings",exact:true}).click();
  await page.screenshot({path:join(evidenceDir, "desktop-dark.png"),fullPage:true});
  await page.reload();
  await page.getByRole("heading",{name:"List.",exact:true}).waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),"dark");
  await page.getByText("Competing timeline edit",{exact:true}).click();
  await page.getByLabel("Title",{exact:true}).fill("Unsaved revocation draft");
  await mobile.getByRole("button",{name:"Timeline",exact:true}).click();
  await mobile.getByLabel("Project",{exact:true}).selectOption(plan.project_id);
  await mobile.getByLabel("Month",{exact:true}).fill("2026-09");
  await mobile.getByRole("button",{name:"Move plan: Competing timeline edit",exact:true}).click();
  await mobile.getByLabel("Planned end",{exact:true}).fill("2026-09-16");
  const settingsPage = await context.newPage();
  await settingsPage.goto(origin);
  await settingsPage.getByRole("button",{name:"Workspace settings",exact:true}).click();
  await settingsPage.getByLabel("Timezone",{exact:true}).fill("Europe/Warsaw");
  await settingsPage.route("**/api/v1/workspace/preferences", route => route.request().method() === "PATCH" ? route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"SERVER_BUSY"}})}) : route.continue());
  await settingsPage.getByRole("button",{name:"Save preferences",exact:true}).click();
  await settingsPage.getByText("Pending command:",{exact:false}).waitFor();
  for(const session of cli("sessions").items) cli("revoke-session",session.id);
  await page.getByRole("heading",{name:"List.",exact:true}).waitFor({state:"hidden",timeout:5000});
  assert.equal(await page.getByLabel("Title",{exact:true}).inputValue(),"Unsaved revocation draft");
  await page.getByRole("button",{name:"Copy draft",exact:true}).waitFor();
  assert.equal(await mobile.getByLabel("Planned end",{exact:true}).inputValue(),"2026-09-16");
  await mobile.getByText("Your session ended.",{exact:false}).first().waitFor();
  await mobile.getByRole("button",{name:"Copy draft",exact:true}).waitFor();
  await settingsPage.getByText("Your session ended. Your settings draft",{exact:false}).waitFor();
  assert.equal(await settingsPage.getByLabel("Timezone",{exact:true}).inputValue(),"Europe/Warsaw");
  await settingsPage.getByText("Pending command:",{exact:false}).waitFor();
  await settingsPage.getByRole("button",{name:"Copy settings draft",exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: HTTPS pairing, folder selection and confirmed registration, real file creation, desktop and mobile emulation, concurrent edit conflict, draft preservation, seven views, undo, focus, report read receipts, persisted settings, native external file updates, typed CLI, timeline move, resize conflict, pending command retention, whole-card drag without controls, immediate drop persistence, same-command retry, keyboard ordering, vertical auto-scroll and cancellation, touch hold-to-drag and normal touch scrolling, SVAR collapse, quick title creation with identical retry, per-project collapse and scroll restoration across navigation and reload, held board conflict, 51-card pagination boundaries, dark/mobile board layout, milestone timeline, aligned calendar weeks, full-text search, SSE during held drag, session revocation with preserved desktop/mobile drafts, settings draft and pending identity retention, on-demand Git, diagnostics, dark appearance and gesture cancellation.",
  );
  console.log(
    "This is Chromium device emulation, not physical iPhone or Safari evidence.",
  );
} catch (error) {
  if (browser) {
    for (const [index, context] of browser.contexts().entries()) {
      const failurePage = context.pages()[0];
      if (!failurePage) continue;
      await failurePage.screenshot({path:join(evidenceDir, `failure-${index}.png`),fullPage:false}).catch(() => {});
      await writeFile(join(evidenceDir, `failure-${index}.txt`),await failurePage.locator("body").innerText().catch(() => "Page unavailable")).catch(() => {});
    }
  }
  throw error;
} finally {
  await browser?.close();
  daemon.kill("SIGTERM");
  await new Promise((r) => {
    if (daemon.exitCode !== null) r();
    else daemon.once("exit", r);
  });
  proxy.closeAllConnections();
  await new Promise((r) => proxy.close(r));
  await rm(temp, { recursive: true, force: true });
}
