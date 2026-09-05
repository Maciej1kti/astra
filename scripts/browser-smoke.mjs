/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import { chromium, devices } from "@playwright/test";
import { mkdtemp, mkdir, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const temp = await realpath(
  await mkdtemp(join(await realpath("/tmp"), "lp-browser-")),
);
const state = join(temp, "state"),
  folder = join(temp, "Field notes");
await mkdir(state, { mode: 0o700 });
await mkdir(folder, { mode: 0o700 });
const socket = join(state, "projectd.sock");
const cli = (...args) =>
  JSON.parse(
    execFileSync(
      join(root, "target/debug/projectctl"),
      ["--socket", socket, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ).body;
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
  join(root, "target/debug/projectd"),
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
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "Request access" }).click();
  await page.getByText("Compare this challenge on the host machine:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page.getByRole("button", { name: "I approved this browser" }).click();
  await page
    .getByRole("heading", { name: "Make room for what matters." })
    .waitFor();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption(plan.project_id);
  await page.getByRole("button", { name: "Add card", exact: false }).click();
  await page.getByLabel("Title", { exact: true }).fill("Ship the field guide");
  await page.getByLabel("Start", { exact: true }).fill("2026-09-07");
  await page.getByLabel("End", { exact: true }).fill("2026-09-12");
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-15");
  await page
    .getByLabel("Description Markdown source")
    .fill('A real browser write.\n\n<script>alert("untrusted")</script>');
  await page.getByRole("button", { name: "Preview Markdown", exact: true }).click();
  assert.equal(await page.locator(".markdown script, .markdown img").count(), 0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  await page.getByText("Connected to host", { exact: false }).waitFor();
  await mkdir(join(root, "progress/screenshots"), { recursive: true });
  await page.screenshot({
    path: join(root, "progress/screenshots/desktop-board.png"),
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
    path: join(root, "progress/screenshots/mobile-conflict.png"),
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Close editor" }).click();
  await mobile.getByRole("button", { name: "Discard draft", exact: true }).click();

  await page.getByRole("heading", { name: "Ship the revised guide" }).click();
  await page.getByText("Change history", { exact: true }).click();
  await page.getByRole("button", { name: "Load history", exact: true }).click();
  await page
    .locator("button:enabled")
    .filter({ hasText: /^Undo this change$/ })
    .first()
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(cli("get", path).metadata.title, "Ship the field guide");
  await page.getByRole("heading", { name: "Ship the field guide" }).click();
  await page.getByRole("button", { name: "Pin to focus", exact: true }).click();
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
  await page.getByRole("heading", { name: "List.", exact: true }).waitFor();
  assert.equal(cli("get", "/api/v1/workspace/preferences").timezone, "UTC");
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
    const bounds=await moveHandle.boundingBox();
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
  const bounds=await moveHandle.boundingBox();
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
  await page.screenshot({path:join(root,"progress/screenshots/desktop-timeline.png"),fullPage:true});

  const resize = page.getByRole("button",{name:"Resize end: External editor update",exact:true});
  const resizeBounds=await resize.boundingBox();
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
  await page.getByLabel("Move Typed CLI task to",{exact:true}).selectOption("planned");
  await page.getByRole("button",{name:"Confirm move",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("--project",folder,"card","get",typedId).metadata.status,"planned");
  const boardHandle=page.getByRole("button",{name:"Reorder: Typed CLI task",exact:true});
  const boardTarget=page.locator(`[data-board-card="${cards[0].id}"] .title`);
  const sourceBounds=await boardHandle.boundingBox(),targetBounds=await boardTarget.boundingBox();
  await page.mouse.move(sourceBounds.x+sourceBounds.width/2,sourceBounds.y+sourceBounds.height/2);await page.mouse.down();
  await page.mouse.move(targetBounds.x+targetBounds.width/2,targetBounds.y+targetBounds.height/2,{steps:6});await page.mouse.up();
  await page.getByRole("button",{name:"Confirm move",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  const ordered=cli("--project",folder,"card","list","--status","planned").items;
  assert.equal(ordered[0].id,typedId);
  await page.screenshot({path:join(root,"progress/screenshots/desktop-board.png"),fullPage:true});
  await page.getByLabel("Move Typed CLI task to",{exact:true}).selectOption("planned");
  await page.getByLabel("Position",{exact:true}).selectOption("");
  await page.getByRole("button",{name:"Confirm move",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.equal(cli("--project",folder,"card","list","--status","planned").items.at(-1).id,typedId);

  const milestoneFile=join(temp,"milestone.json");
  await writeFile(milestoneFile,JSON.stringify({title:"Release gate",due:{date:"2026-09-30",kind:"hard"}}));
  cli("command","POST",`/api/v1/projects/${plan.project_id}/milestones`,"--json-file",milestoneFile);
  await page.getByRole("button",{name:"Timeline",exact:true}).click();
  await page.getByRole("button",{name:"hard milestone deadline: Release gate",exact:true}).waitFor();
  await page.getByRole("button",{name:"Calendar",exact:true}).click();
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("week");
  assert.equal(await page.locator("[data-calendar-day]").count(),7);
  assert.equal(await page.locator("[data-calendar-day]").first().getAttribute("data-calendar-day"),"2026-08-31");
  await page.getByLabel("Calendar layout",{exact:true}).selectOption("month");
  await page.getByRole("button",{name:"List",exact:true}).click();
  await page.getByLabel("Search content",{exact:true}).fill("untrusted");
  await page.getByText("Competing timeline edit",{exact:true}).waitFor();
  await page.getByText("Typed CLI task",{exact:true}).waitFor({state:"hidden"});
  await page.getByLabel("Search content",{exact:true}).fill("");
  await page.getByRole("button",{name:"Workspace settings",exact:true}).click();
  await page.getByLabel("Theme",{exact:true}).selectOption("dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),"dark");
  await page.getByRole("button",{name:"Close settings",exact:true}).click();
  await page.screenshot({path:join(root,"progress/screenshots/desktop-dark.png"),fullPage:true});
  await page.reload();
  await page.getByRole("heading",{name:"List.",exact:true}).waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),"dark");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: HTTPS pairing, real file creation, desktop and mobile emulation, concurrent edit conflict, draft preservation, seven views, undo, focus, report read receipts, persisted settings, native external file updates, typed CLI, timeline move, resize conflict, pending command retention, board drag and keyboard ordering, milestone timeline, aligned calendar weeks, full-text search and gesture cancellation.",
  );
  console.log(
    "This is Chromium device emulation, not physical iPhone or Safari evidence.",
  );
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
