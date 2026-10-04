/** Real HTTPS browser -> daemon -> filesystem smoke test. No authentication bypass. */
import {
  setCalendarDate,
  expectCalendarDate,
} from "./browser/calendar-controls.mjs";
import { chromium, devices, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHost } from "./browser/host.mjs";
import { artifactManifest } from "./browser/artifacts.mjs";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
async function hitbox(locator, attempt = 0) {
  try {
    await locator.waitFor({ state: "visible" });
    await expect(locator).toBeEnabled();
    await locator.scrollIntoViewIfNeeded();
    // Layout can settle after scrollIntoView or a preceding full-page screenshot.
    await locator.evaluate(
      (element) =>
        new Promise((resolve) => {
          let previous = "",
            stable = 0,
            frames = 0;
          const check = () => {
            const rect = element.getBoundingClientRect();
            const current = `${rect.x},${rect.y},${rect.width},${rect.height}`;
            stable = current === previous ? stable + 1 : 0;
            previous = current;
            if (stable >= 2 || ++frames >= 120) resolve(null);
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
    );
    const box = await locator.boundingBox();
    assert(
      box,
      "The gesture target must be rendered before sending pointer input",
    );
    return box;
  } catch (error) {
    if (attempt < 2 && /not attached|detached/.test(String(error)))
      return hitbox(locator, attempt + 1);
    throw error;
  }
}
const root = resolve(import.meta.dirname, "..");
const evidenceDir = resolve(
  root,
  process.env.ASTRA_EVIDENCE_DIR ?? "test-results/browser/browser-smoke",
);
await mkdir(evidenceDir, { recursive: true });
const host = await createHost();
const { temp, folder, cli, origin } = host;
let browser;
try {
  const plan = cli("registration-plan", folder, "--name", "Field notes");
  cli("register", plan.plan_id);
  const commandFile = join(temp, "browser-smoke-command.json");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ASTRA_TEST_CHROMIUM || undefined,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "Poproś o dostęp" }).click();
  await page.getByText("Porównaj ten kod na komputerze serwera:").waitFor();
  const pending = cli("pairings").items[0];
  cli("approve", pending.id, "--challenge", pending.challenge);
  await page
    .getByRole("button", { name: "Przeglądarka została zatwierdzona" })
    .click();
  await page.getByRole("heading", { name: "W Focus" }).waitFor();
  let pickerRequests = 0;
  await page.route("**/api/v1/native-folder-selections", (route) => {
    pickerRequests++;
    const input = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selection_id: input.selection_id,
        state: "cancelled",
        plan: null,
        error: null,
      }),
    });
  });
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  await page
    .getByRole("button", { name: "Dodaj projekt", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Wybierz folder…", exact: true })
    .click();
  await page
    .getByText(
      "Anulowano wybór folderu. Pliki projektu nie zostały zmienione.",
      {
        exact: true,
      },
    )
    .waitFor();
  assert.equal(pickerRequests, 1);
  await page
    .getByRole("button", { name: "Zamknij dodawanie projektu", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.unroute("**/api/v1/native-folder-selections");
  const nativeFolder = join(temp, "Native selection fixture");
  await mkdir(nativeFolder);
  const nativePlan = cli(
    "registration-plan",
    nativeFolder,
    "--name",
    "Native-selected project",
  );
  await page.route("**/api/v1/native-folder-selections", (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        selection_id: input.selection_id,
        state: "selected",
        plan: nativePlan,
        error: null,
      }),
    });
  });
  await page
    .getByRole("button", { name: "Dodaj projekt", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Wybierz folder…", exact: true })
    .click();
  await page.getByText(nativeFolder, { exact: true }).waitFor();
  await assert.rejects(readFile(join(nativeFolder, ".project/project.json")), {
    code: "ENOENT",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Dodaj projekt", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.match(
    await readFile(join(nativeFolder, ".project/project.json"), "utf8"),
    /Native-selected project/,
  );
  await page.unroute("**/api/v1/native-folder-selections");
  const pickRoot = join(temp, "Selectable folders");
  const selectedFolder = join(pickRoot, "Chosen project");
  await mkdir(selectedFolder, { recursive: true });
  cli("add-root", pickRoot, "--label", "Test projects");
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  await page
    .getByRole("button", { name: "Dodaj projekt", exact: false })
    .click();
  await page.getByText("Zdalny serwer bez pulpitu?", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Przeglądaj zatwierdzone foldery",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Otwórz folder: Chosen project", exact: true })
    .click();
  const registration = page.locator("dialog:modal:not([inert])");
  await expect(registration).toHaveCount(1);
  await registration
    .getByLabel("Nazwa projektu", { exact: true })
    .fill("Chosen in browser");
  await page
    .getByRole("button", { name: "Wybierz ten folder", exact: true })
    .click();
  await page.getByText("Wybrany folder", { exact: true }).waitFor();
  await assert.rejects(
    readFile(join(selectedFolder, ".project/project.json")),
    {
      code: "ENOENT",
    },
  );
  await page
    .getByRole("button", { name: "Dodaj wybrany projekt", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(
    cli("projects").items.some((item) => item.title === "Chosen in browser"),
    true,
  );
  assert.match(
    await readFile(join(selectedFolder, ".project/project.json"), "utf8"),
    /Chosen in browser/,
  );
  await page
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  await page
    .getByRole("button", { name: "＋ Dodaj kartę", exact: true })
    .click();
  await page.getByLabel("Tytuł", { exact: true }).fill("Ship the field guide");
  await page.getByLabel("Początek", { exact: true }).fill("2026-09-07");
  await page.getByLabel("Koniec", { exact: true }).fill("2026-09-12");
  await expect(page.getByLabel("Termin", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Deadline type", { exact: true })).toHaveCount(
    0,
  );
  await page.locator(".resource-description-rendered").click();
  await page
    .getByLabel("Opis", { exact: true })
    .fill('A real browser write.\n\n<script>alert("untrusted")</script>');
  await page.getByRole("dialog").locator(".card-project-name").click();
  assert.equal(
    await page.locator(".markdown script, .markdown img").count(),
    0,
  );
  await expect(page.getByTestId("autosave-status")).toHaveText("Zapisano");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Tablica", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  await page.getByText("Połączono z serwerem", { exact: false }).waitFor();
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
  const selectMobileView = async (name) => {
    const navigation = mobile.getByRole("navigation", {
      name: "Widoki przestrzeni roboczej",
    });
    const more = navigation.getByRole("button", {
      name: "Więcej widoków",
      exact: true,
    });
    await more.click();
    await navigation.getByRole("button", { name, exact: true }).click();
    await expect(more).toHaveAttribute("aria-current", "page");
    await expect(more).toHaveAttribute("aria-expanded", "false");
  };
  await mobile.goto(origin);
  await mobile.getByRole("heading", { name: "W Focus" }).waitFor();
  await selectMobileView("Tablica");
  await mobile.getByRole("heading", { name: "Ship the field guide" }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).click();
  await page
    .getByLabel("Tytuł", { exact: true })
    .fill("Ship the revised guide");
  await expect(page.getByTestId("autosave-status")).toHaveText("Zapisano");
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await mobile
    .getByLabel("Tytuł", { exact: true })
    .fill("Keep my mobile draft");
  await expect(mobile.getByTestId("autosave-status")).toHaveText("Niezapisane");
  await mobile.getByText("Aktualna zapisana wersja").waitFor();
  assert.equal(
    await mobile.getByLabel("Tytuł", { exact: true }).inputValue(),
    "Keep my mobile draft",
  );
  assert.equal(cli("get", path).metadata.title, "Ship the revised guide");
  await mobile.screenshot({
    path: join(evidenceDir, "mobile-conflict.png"),
    fullPage: true,
  });
  await mobile.getByRole("button", { name: "Zamknij edytor" }).click();
  await mobile
    .getByRole("button", { name: "Odrzuć wersję roboczą", exact: true })
    .click();

  await page.getByRole("heading", { name: "Ship the revised guide" }).click();
  const current = cli("get", path);
  const history = cli("get", `${path}/history`).items;
  const entry = history.find(
    (item) => item.can_undo && item.changed_fields.includes("title"),
  );
  assert(entry, "the browser smoke title edit should be undoable");
  await writeFile(
    commandFile,
    JSON.stringify({ undo: { history_entry_id: entry.id } }),
    { mode: 0o600 },
  );
  cli(
    "command",
    "PATCH",
    path,
    "--json-file",
    commandFile,
    "--if-version",
    current.version,
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  assert.equal(cli("get", path).metadata.title, "Ship the field guide");
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const reopenedCard = page.locator(
    `[data-board-card="${cards[0].id}"] .title`,
  );
  await expect(reopenedCard).toBeEnabled();
  await reopenedCard.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Przypnij do Focus", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Przypnij do Focus", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Usuń z Focus", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(
    cli("get", "/api/v1/workspace/focus").items[0].card_id,
    cards[0].id,
  );
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await page.getByRole("heading", { name: "Ship the field guide" }).waitFor();
  for (const view of [
    "Kalendarz",
    "Oś czasu",
    "Lista",
    "Aktualizacje",
    "Projekty",
  ]) {
    await page.getByRole("button", { name: view, exact: true }).click();
  }

  await page.getByRole("button", { name: "Aktualizacje", exact: true }).click();
  await page
    .getByRole("button", { name: "Dodaj aktualizację", exact: false })
    .click();
  await page.getByLabel("Podsumowanie", { exact: true }).fill("Browser report");
  await page.getByRole("button", { name: "Utwórz", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page
    .getByRole("heading", { name: "Browser report", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Oznacz jako przeczytane", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Oznacz jako nieprzeczytane",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByLabel("Tylko nieprzeczytane").check();
  await page
    .getByRole("heading", { name: "Browser report", exact: true })
    .waitFor({ state: "hidden" });
  const reports = cli(
    "get",
    `/api/v1/views/list?type=update&project_id=${plan.project_id}`,
  ).items;
  assert.equal(reports[0].read, true);
  assert.equal(
    cli("get", `/api/v1/projects/${plan.project_id}/updates/${reports[0].id}`)
      .read,
    true,
  );
  await page.getByLabel("Tylko nieprzeczytane").uncheck();

  await page
    .getByRole("button", {
      name: "Ustawienia przestrzeni roboczej",
      exact: true,
    })
    .click();
  await page.getByLabel("Strefa czasowa", { exact: true }).fill("UTC");
  await page.getByLabel("Widok domyślny", { exact: true }).selectOption("list");
  await page
    .getByRole("button", { name: "Zapisz ustawienia", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // Saving preferences retains the current explicit route. A clean entry uses the default.
  await expect(
    page.getByRole("button", { name: "Aktualizacje", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  assert.equal(cli("get", "/api/v1/workspace/preferences").timezone, "UTC");
  assert.equal(
    cli("get", "/api/v1/workspace/preferences").preferences.default_view,
    "list",
  );
  await page.goto(origin);
  await page.getByRole("heading", { name: "Lista", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Lista", exact: true }).waitFor();
  const cardFile = join(folder, ".project", "cards", `${cards[0].id}.json`);
  const source = await readFile(cardFile, "utf8");
  await writeFile(
    cardFile,
    source.replace("Ship the field guide", "External editor update"),
  );
  await page
    .getByText("External editor update", { exact: true })
    .waitFor({ timeout: 10000 });
  assert.equal(cli("get", path).metadata.title, "External editor update");
  await page
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  await page.getByRole("button", { name: "Oś czasu", exact: true }).click();
  await page.getByLabel("Miesiąc", { exact: true }).fill("2026-09");
  const moveHandle = page.getByRole("button", {
    name: "Przenieś plan: External editor update",
    exact: true,
  });
  await moveHandle.waitFor();
  const beforeGesture = cli("get", path);
  for (const cancellation of [
    "escape",
    "pointercancel",
    "orientationchange",
    "second-pointer",
  ]) {
    const bounds = await hitbox(moveHandle);
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 48,
      bounds.y + bounds.height / 2,
      { steps: 4 },
    );
    if (cancellation === "escape") await page.keyboard.press("Escape");
    else if (cancellation === "pointercancel")
      await moveHandle.dispatchEvent("pointercancel", { pointerId: 1 });
    else if (cancellation === "orientationchange")
      await page.evaluate(() =>
        window.dispatchEvent(new Event("orientationchange")),
      );
    else
      await page.evaluate(() =>
        window.dispatchEvent(
          new PointerEvent("pointerdown", { pointerId: 99, isPrimary: false }),
        ),
      );
    await page.mouse.up();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(cli("get", path).version, beforeGesture.version);
  }
  const concurrentGesture = join(temp, "during-gesture.json");
  const held = await hitbox(moveHandle);
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    held.x + held.width / 2 + 48,
    held.y + held.height / 2,
    { steps: 4 },
  );
  await writeFile(
    concurrentGesture,
    JSON.stringify({ set: { title: "During held gesture" } }),
  );
  cli(
    "command",
    "PATCH",
    path,
    "--json-file",
    concurrentGesture,
    "--if-version",
    cli("get", path).version,
  );
  await page.waitForTimeout(700);
  assert.equal(
    await moveHandle.count(),
    1,
    "Incoming SSE must not replace the held gesture baseline",
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
    .click();
  await page
    .getByText("Aktualny zapisany harmonogram:", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  let busyReads = 0;
  await page.route("**/api/v1/views/gantt?*", async (route) => {
    if (busyReads++ === 0)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          api_version: "1",
          error: {
            code: "SERVER_BUSY",
            message: "Synthetic bounded worker saturation",
          },
        }),
      });
    else await route.continue();
  });
  await writeFile(
    concurrentGesture,
    JSON.stringify({ set: { title: "External editor update" } }),
  );
  cli(
    "command",
    "PATCH",
    path,
    "--json-file",
    concurrentGesture,
    "--if-version",
    cli("get", path).version,
  );
  await moveHandle.waitFor();
  assert(busyReads >= 2);
  await page.unroute("**/api/v1/views/gantt?*");
  const bounds = await hitbox(moveHandle);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 48,
    bounds.y + bounds.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Zmień zaplanowane daty" }).waitFor();
  assert.equal(
    await page.getByLabel("Zaplanowany początek", { exact: true }).inputValue(),
    "2026-09-08",
  );
  assert.equal(
    await page.getByLabel("Zaplanowany koniec", { exact: true }).inputValue(),
    "2026-09-13",
  );
  await page
    .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.deepEqual(cli("get", path).metadata.due, beforeGesture.metadata.due);
  assert.equal(cli("get", path).metadata.schedule.start, "2026-09-08");
  await page.screenshot({
    path: join(evidenceDir, "desktop-timeline.png"),
    fullPage: true,
  });

  const resize = page.getByRole("button", {
    name: "Zmień koniec: External editor update",
    exact: true,
  });
  const resizeBounds = await hitbox(resize);
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2,
    resizeBounds.y + resizeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2 + 48,
    resizeBounds.y + resizeBounds.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.equal(
    await page.getByLabel("Zaplanowany początek", { exact: true }).inputValue(),
    "2026-09-08",
  );
  assert.equal(
    await page.getByLabel("Zaplanowany koniec", { exact: true }).inputValue(),
    "2026-09-14",
  );
  const conflictingPatch = join(temp, "date-conflict.json");
  await writeFile(
    conflictingPatch,
    JSON.stringify({ set: { title: "Competing timeline edit" } }),
  );
  cli(
    "command",
    "PATCH",
    path,
    "--json-file",
    conflictingPatch,
    "--if-version",
    cli("get", path).version,
  );
  await page
    .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
    .click();
  await page
    .getByText("Aktualny zapisany harmonogram:", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByLabel("Zaplanowany koniec", { exact: true }).inputValue(),
    "2026-09-14",
  );
  assert.equal(cli("get", path).metadata.schedule.end, "2026-09-13");
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();

  try {
    await page
      .getByRole("button", {
        name: "Przenieś plan: Competing timeline edit",
        exact: true,
      })
      .click();
  } catch (error) {
    console.error(await page.locator("body").innerText(), errors, daemonLog);
    throw error;
  }
  await page
    .getByLabel("Zaplanowany koniec", { exact: true })
    .fill("2026-09-14");
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          api_version: "1",
          request_id: route.request().headers()["x-request-id"],
          state: "prepared",
        }),
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
    .click();
  await page
    .getByText("Stan polecenia: Przygotowane.", { exact: false })
    .waitFor({ timeout: 2000 });
  assert.equal(cli("get", path).metadata.schedule.end, "2026-09-13");
  await page.unroute(`**${path}`);
  await page
    .getByRole("button", { name: "Ponów to samo polecenie", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(cli("get", path).metadata.schedule.end, "2026-09-14");

  const agentContext = cli(
    "--project",
    folder,
    "context",
    "--max-bytes",
    "4096",
    "--json",
  );
  assert(Buffer.byteLength(JSON.stringify(agentContext)) <= 4096);
  const typedCard = cli(
    "--project",
    folder,
    "card",
    "create",
    "--title",
    "Typed CLI task",
  );
  const typedId = typedCard.result.resource.metadata.id;
  assert.equal(
    cli("--project", folder, "card", "get", typedId).metadata.title,
    "Typed CLI task",
  );
  const patchFile = join(temp, "patch.json");
  await writeFile(patchFile, JSON.stringify({ set: { status: "active" } }));
  cli(
    "--project",
    folder,
    "card",
    "set",
    typedId,
    "--patch-file",
    patchFile,
    "--if-version",
    typedCard.result.resource.version,
  );
  assert.equal(
    cli("--project", folder, "card", "get", typedId).metadata.status,
    "active",
  );
  await page.getByRole("button", { name: "Tablica", exact: true }).click();
  await expect(page.locator(".astra-board .date-scroll")).toHaveCount(1);
  const activeColumn = page.locator(".astra-column-active");
  await activeColumn
    .getByRole("button", { name: "Zwiń kolumnę", exact: true })
    .click();
  await expect(page.locator(`[data-board-card="${typedId}"]`)).toHaveCount(0);
  await activeColumn
    .getByRole("button", { name: "Rozwiń kolumnę", exact: true })
    .click();
  const footerAdd = page.getByRole("button", {
    name: "Dodaj kartę w Do sprawdzenia",
    exact: true,
  });
  await hitbox(footerAdd);
  await footerAdd.focus();
  await expect(footerAdd).toBeFocused();
  await page.keyboard.press("Enter");
  const quickTitle = page.getByLabel("Tytuł nowej karty w Do sprawdzenia", {
    exact: true,
  });
  await expect(quickTitle).toBeFocused();
  await quickTitle.fill("Column-created card");
  await quickTitle.press("Enter");
  await expect
    .poll(
      () =>
        cli("--project", folder, "card", "list", "--status", "review").items
          .length,
    )
    .toBe(1);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(
    cli("--project", folder, "card", "list", "--status", "review").items[0]
      .title,
    "Column-created card",
  );
  // Finish quick creation before the separate card-ordering scenario. The
  // open composer restores its input focus when its column is refreshed.
  await page
    .locator(".astra-column-review")
    .getByRole("button", { name: "Zamknij", exact: true })
    .click();
  await expect(quickTitle).toHaveCount(0);
  await expect(
    page.locator(
      "[data-board-card] select, [data-board-card] .handle, [data-board-card] details",
    ),
  ).toHaveCount(0);
  const statusCardTitle = page.locator(`[data-board-card="${typedId}"] .title`);
  await hitbox(statusCardTitle);
  await statusCardTitle.click();
  await expect(
    page.getByRole("dialog", { name: "Edytuj element", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Status:/ }).click();
  await page.getByRole("button", { name: "Zaplanowane", exact: true }).click();
  await expect(page.getByTestId("autosave-status")).toHaveText("Zapisano");
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(
    cli("--project", folder, "card", "get", typedId).metadata.status,
    "planned",
  );
  // Native dismissal finishes after the outgoing dialog leaves the accessibility tree.
  const boardHandle = page.locator(`[data-board-card="${typedId}"] .title`);
  const boardTarget = page.locator(`[data-board-card="${cards[0].id}"] .title`);
  // Regression: dragging a card title should move the card, not open its editor.
  const sourceTitle = page.locator(`[data-board-card="${typedId}"] .title`);
  const sourceBounds = await hitbox(sourceTitle),
    targetBounds = await hitbox(boardTarget);
  await page.mouse.move(
    sourceBounds.x + sourceBounds.width / 2,
    sourceBounds.y + sourceBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + 10,
    { steps: 6 },
  );
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await expect(page.locator("[data-board-drop-indicator]")).toBeVisible();
  await page.screenshot({
    path: join(evidenceDir, "board-drag-preview.png"),
    fullPage: true,
  });
  await page.mouse.up();
  await expect
    .poll(
      () =>
        cli("--project", folder, "card", "list", "--status", "planned").items[0]
          .id,
    )
    .toBe(typedId);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const ordered = cli(
    "--project",
    folder,
    "card",
    "list",
    "--status",
    "planned",
  ).items;
  assert.equal(ordered[0].id, typedId);
  await page.screenshot({
    path: join(evidenceDir, "desktop-board.png"),
    fullPage: true,
  });
  await expect(boardHandle).toBeEnabled();
  await expect(
    page.locator('[data-board-status="planned"]').first(),
  ).toHaveAttribute("data-board-card", typedId);
  await boardHandle.focus();
  await expect(boardHandle).toBeFocused();
  await boardHandle.press("Alt+ArrowDown");
  try {
    await expect
      .poll(
        () =>
          cli(
            "--project",
            folder,
            "card",
            "list",
            "--status",
            "planned",
          ).items.at(-1).id,
      )
      .toBe(typedId);
  } catch (error) {
    console.error(
      "Keyboard reorder state",
      ordered,
      cli("--project", folder, "card", "list", "--status", "planned").items,
      errors,
      await page.locator("body").innerText(),
    );
    throw error;
  }
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // Drag between statuses, retaining the exact command when a response is uncertain.
  const typedPath = `/api/v1/projects/${plan.project_id}/cards/${typedId}`;
  const attempts = [];
  await page.route(`**${typedPath}`, async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.continue();
    attempts.push({
      body: request.postData(),
      id: request.headers()["x-request-id"],
      epoch: request.headers()["x-command-epoch"],
      version: request.headers()["if-match"],
    });
    if (attempts.length === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "SERVER_BUSY" } }),
      });
    return route.continue();
  });
  const targetColumn = page.locator(
    ".astra-column-active [data-kanban-column-cards]",
  );
  await hitbox(targetColumn);
  const statusSource = await hitbox(boardHandle);
  const emptyColumn = await targetColumn.boundingBox();
  await page.mouse.move(statusSource.x + 30, statusSource.y + 20);
  await page.mouse.down();
  await page.mouse.move(statusSource.x + 40, statusSource.y + 20, { steps: 2 });
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await page.mouse.move(emptyColumn.x + 60, emptyColumn.y + 60, { steps: 6 });
  await expect(page.locator("[data-board-drop-indicator]")).toBeVisible();
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Ponów to samo polecenie", exact: true })
    .waitFor();
  assert.equal(cli("get", typedPath).metadata.status, "planned");
  await page
    .getByRole("button", { name: "Ponów to samo polecenie", exact: true })
    .click();
  await expect.poll(() => cli("get", typedPath).metadata.status).toBe("active");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  await page.unroute(`**${typedPath}`);
  const returnSource = await hitbox(boardHandle),
    returnTarget = await hitbox(boardTarget);
  await page.mouse.move(returnSource.x + 30, returnSource.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    returnTarget.x + 60,
    returnTarget.y + returnTarget.height + 15,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(() => cli("get", typedPath).metadata.status)
    .toBe("planned");
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // A live refresh must not replace the version captured by a held board gesture.
  const heldSource = await hitbox(boardHandle),
    heldTarget = await hitbox(boardTarget);
  await page.mouse.move(
    heldSource.x + heldSource.width / 2,
    heldSource.y + heldSource.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    heldSource.x + heldSource.width / 2 + 8,
    heldSource.y + heldSource.height / 2,
    { steps: 2 },
  );
  const heldVersion = cli("--project", folder, "card", "get", typedId).version;
  await writeFile(patchFile, JSON.stringify({ set: { priority: "high" } }));
  cli(
    "--project",
    folder,
    "card",
    "set",
    typedId,
    "--patch-file",
    patchFile,
    "--if-version",
    heldVersion,
  );
  await expect.poll(() => page.locator("[data-dragging]").count()).toBe(1);
  await page.waitForTimeout(300);
  await page.mouse.move(
    heldTarget.x + heldTarget.width / 2,
    heldTarget.y + 10,
    { steps: 6 },
  );
  await page.mouse.up();
  await page
    .getByText("Karta lub jej sąsiedzi się zmienili.", { exact: false })
    .waitFor();
  await expect(
    page.getByRole("button", { name: "Potwierdź przeniesienie", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  assert.equal(
    cli("--project", folder, "card", "list", "--status", "planned").items.at(-1)
      .id,
    typedId,
  );
  assert.equal(
    cli("--project", folder, "card", "get", typedId).metadata.priority,
    "high",
  );

  // Counts and legal placements refer to server pages, not SVAR's loaded array.
  const pageFixture = join(temp, "board-page.json");
  for (let index = 0; index < 50; index++) {
    await writeFile(
      pageFixture,
      JSON.stringify({ title: `Review page ${index}`, status: "review" }),
    );
    cli(
      "command",
      "POST",
      `/api/v1/projects/${plan.project_id}/cards`,
      "--json-file",
      pageFixture,
    );
  }
  const reviewColumn = page.locator(".astra-column-review");
  await expect(
    reviewColumn.getByRole("heading", {
      name: "Do sprawdzenia · 51",
      exact: true,
    }),
  ).toBeVisible();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(50);
  await expect(reviewColumn.locator(".column-footer")).toHaveCount(1);
  await page.locator(`[data-board-card="${typedId}"] .title`).click();
  await expect(page.getByLabel("Tytuł", { exact: true })).toHaveValue(
    "Typed CLI task",
  );
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  const scrollColumn = reviewColumn.locator("[data-kanban-column-cards]");
  const scrollBox = await scrollColumn.boundingBox();
  const dragBox = await hitbox(boardHandle);
  const dragVersion = cli("--project", folder, "card", "get", typedId).version;
  await page.mouse.move(dragBox.x + 20, dragBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    scrollBox.x + scrollBox.width / 2,
    scrollBox.y + scrollBox.height - 12,
    { steps: 8 },
  );
  await expect
    .poll(() => scrollColumn.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-board-drag-preview]")).toHaveCount(0);
  const stoppedScroll = await scrollColumn.evaluate((node) => node.scrollTop);
  await page.waitForTimeout(100);
  assert.equal(
    await scrollColumn.evaluate((node) => node.scrollTop),
    stoppedScroll,
  );
  assert.equal(
    cli("--project", folder, "card", "get", typedId).version,
    dragVersion,
  );
  await scrollColumn.evaluate((node) => (node.scrollTop = 0));
  await page
    .getByRole("button", { name: "Następne 50 w Do sprawdzenia", exact: true })
    .click();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(1);
  // The preceding card is unknown on page two, so dropping before its first card is illegal.
  const hiddenPredecessorTarget = await hitbox(
    reviewColumn.locator("[data-board-card] .title"),
  );
  const boundarySource = await hitbox(boardHandle);
  await page.mouse.move(boundarySource.x + 20, boundarySource.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    hiddenPredecessorTarget.x + 30,
    hiddenPredecessorTarget.y + 5,
    { steps: 6 },
  );
  await expect(page.locator("[data-board-drag-preview]")).toBeVisible();
  await expect(page.locator("[data-board-drop-indicator]")).toBeHidden();
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(
    cli("--project", folder, "card", "get", typedId).version,
    dragVersion,
  );
  await page
    .getByRole("button", {
      name: "Pierwsza strona w Do sprawdzenia",
      exact: true,
    })
    .click();
  await expect(reviewColumn.locator("[data-board-card]")).toHaveCount(50);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: join(evidenceDir, "desktop-board-dark.png"),
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(evidenceDir, "mobile-board.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Touch starts with a hold; an immediate swipe must remain normal scrolling.
  await selectMobileView("Tablica");
  await mobile
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  const mobileSource = mobile.locator(`[data-board-card="${typedId}"] .title`);
  const mobileTarget = mobile.locator(
    `[data-board-card="${cards[0].id}"] .title`,
  );
  const touchSource = await hitbox(mobileSource),
    touchTarget = await hitbox(mobileTarget);
  const cdp = await second.newCDPSession(mobile);
  const touchPoint = (x, y) => [{ x, y, id: 1, radiusX: 3, radiusY: 3 }];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touchPoint(touchSource.x + 30, touchSource.y + 20),
  });
  await expect(mobile.locator("[data-board-drag-preview]")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: touchPoint(touchTarget.x + 30, touchTarget.y + 5),
  });
  await expect(mobile.locator("[data-board-drop-indicator]")).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(
      () =>
        cli("--project", folder, "card", "list", "--status", "planned").items[0]
          .id,
    )
    .toBe(typedId);
  await expect(mobile.locator("dialog[open]")).toHaveCount(0);
  const mobileReview = mobile.locator(
    ".astra-column-review [data-kanban-column-cards]",
  );
  await mobileReview.scrollIntoViewIfNeeded();
  await mobileReview.evaluate((node) => (node.scrollTop = 0));
  const swipeBox = await mobileReview.boundingBox();
  const swipeX = swipeBox.x + swipeBox.width / 2,
    swipeY = Math.min(
      swipeBox.y + swipeBox.height - 20,
      (await mobile.evaluate(() => innerHeight)) - 20,
    );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touchPoint(swipeX, swipeY),
  });
  for (let step = 1; step <= 4; step++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touchPoint(swipeX, swipeY - step * 25),
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => mobileReview.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(10);
  await expect(mobile.locator("[data-board-drag-preview]")).toHaveCount(0);
  await cdp.detach();

  // Quick creation keeps its title and command identity when the result is uncertain.
  const quickAttempts = [];
  await page.route(
    `**/api/v1/projects/${plan.project_id}/cards`,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      quickAttempts.push({
        body: request.postData(),
        id: request.headers()["x-request-id"],
        epoch: request.headers()["x-command-epoch"],
      });
      if (quickAttempts.length === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "SERVER_BUSY" } }),
        });
      return route.continue();
    },
  );
  await page
    .getByRole("button", { name: "Dodaj kartę w Aktywne", exact: true })
    .click();
  await page
    .getByLabel("Tytuł nowej karty w Aktywne", { exact: true })
    .fill("Quick retry card");
  await page
    .getByLabel("Tytuł nowej karty w Aktywne", { exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: /Ponów (ten sam zapis|to samo polecenie)/ })
    .waitFor();
  await expect(page.getByLabel("Tytuł", { exact: true })).toHaveValue(
    "Quick retry card",
  );
  await page
    .getByRole("button", { name: /Ponów (ten sam zapis|to samo polecenie)/ })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(quickAttempts.length, 2);
  assert.deepEqual(quickAttempts[0], quickAttempts[1]);
  assert.equal(
    cli("--project", folder, "card", "list", "--status", "active").items.filter(
      (item) => item.title === "Quick retry card",
    ).length,
    1,
  );
  await page.unroute(`**/api/v1/projects/${plan.project_id}/cards`);

  // Each project's collapse and first-page scroll survive navigation and reload.
  // With Cancelled collapsed by default, use a viewport that still overflows after Active is collapsed.
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page
    .locator(".astra-column-active")
    .getByRole("button", { name: "Zwiń kolumnę", exact: true })
    .click();
  const savedScroll = await page.evaluate(() => {
    const horizontal = document.querySelector(".astra-board .date-scroll");
    const vertical = document.querySelector(
      ".astra-column-review [data-kanban-column-cards]",
    );
    horizontal.scrollLeft = 40;
    vertical.scrollTop = 240;
    return { horizontal: horizontal.scrollLeft, vertical: vertical.scrollTop };
  });
  assert(savedScroll.horizontal > 0 && savedScroll.vertical > 0);
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await page.getByRole("button", { name: "Tablica", exact: true }).click();
  const assertRestored = async () => {
    await expect(
      page
        .locator(".astra-column-active")
        .getByRole("button", { name: "Rozwiń kolumnę", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".astra-board .date-scroll")
          .evaluate((node) => node.scrollLeft),
      )
      .toBe(savedScroll.horizontal);
    await expect
      .poll(() =>
        page
          .locator(".astra-column-review [data-kanban-column-cards]")
          .evaluate((node) => node.scrollTop),
      )
      .toBe(savedScroll.vertical);
  };
  await assertRestored();
  await page
    .getByLabel("Projekt", { exact: true })
    .selectOption(nativePlan.project_id);
  await expect(
    page
      .locator(".astra-column-active")
      .getByRole("button", { name: "Zwiń kolumnę", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  await assertRestored();
  await page.reload();
  await assertRestored();
  await page.screenshot({
    path: join(evidenceDir, "board-remembered-view.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const focusBefore = cli("get", "/api/v1/workspace/focus");
  const focusNeighbor = cli(
    "--project",
    folder,
    "card",
    "create",
    "--title",
    "Focus keyboard neighbor",
  );
  const focusItems = [
    ...focusBefore.items,
    {
      project_id: plan.project_id,
      card_id: focusNeighbor.result.resource.metadata.id,
    },
    { project_id: plan.project_id, card_id: typedId },
  ];
  const pinFile = join(temp, "focus-pin.json");
  await writeFile(pinFile, JSON.stringify({ set: { pinned: true } }));
  for (const cardId of [focusNeighbor.result.resource.metadata.id, typedId]) {
    const path = `/api/v1/projects/${plan.project_id}/cards/${cardId}`;
    cli(
      "command",
      "PATCH",
      path,
      "--json-file",
      pinFile,
      "--if-version",
      cli("get", path).version,
    );
  }
  const focusFile = join(temp, "focus.json");
  await writeFile(focusFile, JSON.stringify({ items: focusItems }));
  cli(
    "command",
    "PUT",
    "/api/v1/workspace/focus",
    "--json-file",
    focusFile,
    "--if-version",
    focusBefore.version,
  );
  await page.goto(`${origin}/?view=focus&project=${plan.project_id}`);
  const typedFocusCard = page.locator(`[data-focus-card="${typedId}"]`);
  await expect(typedFocusCard).toBeVisible();
  const focusWrite = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/v1/workspace/focus",
  );
  await typedFocusCard.focus();
  await typedFocusCard.press("Alt+ArrowUp");
  const focusReply = await focusWrite;
  assert.equal(focusReply.status(), 200);
  await expect(page.locator(`[data-focus-card="${typedId}"]`)).toBeFocused();
  const expectedFocus = [...focusItems];
  const lastFocusIndex = expectedFocus.length - 1;
  [expectedFocus[lastFocusIndex - 1], expectedFocus[lastFocusIndex]] = [
    expectedFocus[lastFocusIndex],
    expectedFocus[lastFocusIndex - 1],
  ];
  assert.deepEqual(cli("get", "/api/v1/workspace/focus").items, expectedFocus);
  await page.reload();
  await expect(page.locator(`[data-focus-card="${typedId}"]`)).toBeVisible();
  const reloadedFocusOrder = await page
    .locator('[data-focus-section="focus"] [data-focus-card]')
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-focus-card")),
    );
  assert.deepEqual(
    reloadedFocusOrder,
    expectedFocus
      .filter((item) => item.project_id === plan.project_id)
      .map((item) => item.card_id),
  );

  const milestoneFile = join(temp, "milestone.json");
  await writeFile(
    milestoneFile,
    JSON.stringify({
      title: "Release gate",
      due: { date: "2026-09-30" },
    }),
  );
  cli(
    "command",
    "POST",
    `/api/v1/projects/${plan.project_id}/milestones`,
    "--json-file",
    milestoneFile,
  );
  await page.getByRole("button", { name: "Oś czasu", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Termin kamienia milowego: Release gate",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Kalendarz", exact: true }).click();
  await page
    .getByLabel("Układ kalendarza", { exact: true })
    .selectOption("week");
  await expect(page.locator(".ec-body .ec-day")).toHaveCount(7);
  await expectCalendarDate(
    page,
    (await page.locator(".topbar .date").innerText()).trim(),
  );
  await setCalendarDate(page, "2026-09-08");
  await page
    .getByLabel("Układ kalendarza", { exact: true })
    .selectOption("day");
  await expect(page.locator(".ec-body .ec-day")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Następny okres kalendarza", exact: true })
    .click();
  await expectCalendarDate(page, "2026-09-09");
  await page
    .getByRole("button", { name: "Poprzedni okres kalendarza", exact: true })
    .focus();
  await page.keyboard.press("Alt+2");
  await expect(
    page.getByLabel("Układ kalendarza", { exact: true }),
  ).toHaveValue("week");
  await page
    .getByRole("button", { name: "Nowa zaplanowana karta", exact: true })
    .click();
  await expect(page.getByLabel("Początek", { exact: true })).toHaveValue(
    "2026-09-09",
  );
  await page.getByLabel("Tytuł", { exact: true }).fill("Scheduled follow-up");
  await page.getByLabel("Koniec", { exact: true }).fill("2026-09-11");
  await expect(page.getByTestId("autosave-status")).toHaveText("Zapisano");
  await page
    .getByRole("button", { name: "Zamknij edytor", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const scheduledCard = cli(
    "get",
    `/api/v1/views/list?type=card&project_id=${plan.project_id}&limit=200`,
  ).items.find((row) => row.title === "Scheduled follow-up");
  assert(scheduledCard);
  await page.getByRole("button", { name: "Oś czasu", exact: true }).click();
  const scheduledPath = `/api/v1/projects/${plan.project_id}/cards/${scheduledCard.id}`;
  const recorded = cli("get", scheduledPath);
  assert.deepEqual(recorded.metadata.schedule, {
    start: "2026-09-09",
    end: "2026-09-11",
  });
  await expect(
    page.getByLabel("Dependency forecast", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Predecessor", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Przenieś plan: Scheduled follow-up",
      exact: true,
    }),
  ).toBeEnabled();
  await page.screenshot({
    path: join(evidenceDir, "gantt-recorded-schedule.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kalendarz", exact: true }).click();
  await setCalendarDate(page, "2026-09-09");
  await page
    .getByLabel("Układ kalendarza", { exact: true })
    .selectOption("week");
  const calendarCard = page.getByRole("button", {
    name: "Zaplanowana praca: Scheduled follow-up",
    exact: true,
  });
  await calendarCard.waitFor();
  await calendarCard.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(
    page.getByLabel("Zaplanowany początek", { exact: true }),
  ).toHaveValue("2026-09-10");
  await page
    .getByRole("button", { name: "Zapisz zaplanowane daty", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  assert.equal(cli("get", scheduledPath).metadata.schedule.end, "2026-09-12");
  await page.screenshot({
    path: join(evidenceDir, "calendar-week.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Układ kalendarza", { exact: true })
    .selectOption("month");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page.getByLabel("Szukaj w treści", { exact: true }).fill("untrusted");
  await page.getByText("Competing timeline edit", { exact: true }).waitFor();
  await page
    .getByText("Typed CLI task", { exact: true })
    .waitFor({ state: "hidden" });
  await page.getByLabel("Szukaj w treści", { exact: true }).fill("");
  assert.equal(cli("--project", folder, "git").error, "NOT_A_GIT_ROOT");
  await page.getByRole("button", { name: "Git", exact: true }).click();
  await page.getByText(/Stan niedostępny: .*NOT_A_GIT_ROOT/).waitFor();
  await page
    .getByRole("button", { name: "Zamknij stan Git", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Diagnostyka serwera", exact: true })
    .click();
  await page
    .getByText("0 problemów ze źródłami · 0 nierozstrzygniętych poleceń", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Zamknij diagnostykę", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Ustawienia przestrzeni roboczej",
      exact: true,
    })
    .click();
  await page.getByLabel("Motyw", { exact: true }).selectOption("dark");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
    "dark",
  );
  await page
    .getByRole("button", { name: "Zamknij ustawienia", exact: true })
    .click();
  await page.screenshot({
    path: join(evidenceDir, "desktop-dark.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "Lista", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
    "dark",
  );
  await page.getByText("Competing timeline edit", { exact: true }).click();
  let revocationAutosaveStarted = 0;
  let revocationAutosaveFinished = false;
  let revocationRouteError;
  let releaseRevocationAutosave;
  const revocationAutosaveReleased = new Promise(
    (resolve) => (releaseRevocationAutosave = resolve),
  );
  const revocationMatcher = `**${path}`;
  await page.route(revocationMatcher, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    revocationAutosaveStarted++;
    if (revocationAutosaveStarted === 1) await revocationAutosaveReleased;
    try {
      await route.continue();
    } catch (cause) {
      revocationRouteError = cause;
    } finally {
      revocationAutosaveFinished = true;
    }
  });
  await page
    .getByLabel("Tytuł", { exact: true })
    .fill("Queued revocation autosave");
  await expect.poll(() => revocationAutosaveStarted).toBe(1);
  await selectMobileView("Oś czasu");
  await mobile
    .getByLabel("Projekt", { exact: true })
    .selectOption(plan.project_id);
  await mobile.getByLabel("Miesiąc", { exact: true }).fill("2026-09");
  await mobile
    .getByRole("button", {
      name: "Przenieś plan: Competing timeline edit",
      exact: true,
    })
    .click();
  await mobile
    .getByLabel("Zaplanowany koniec", { exact: true })
    .fill("2026-09-16");
  const settingsPage = await context.newPage();
  await settingsPage.goto(origin);
  await settingsPage
    .getByRole("button", {
      name: "Ustawienia przestrzeni roboczej",
      exact: true,
    })
    .click();
  await settingsPage
    .getByLabel("Strefa czasowa", { exact: true })
    .fill("Europe/Warsaw");
  await settingsPage.route("**/api/v1/workspace/preferences", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "SERVER_BUSY" } }),
        })
      : route.continue(),
  );
  await settingsPage
    .getByRole("button", { name: "Zapisz ustawienia", exact: true })
    .click();
  await settingsPage
    .getByText("Oczekujące polecenie:", { exact: false })
    .waitFor();
  for (const session of cli("sessions").items)
    cli("revoke-session", session.id);
  await page
    .getByRole("heading", { name: "Lista", exact: true })
    .waitFor({ state: "hidden", timeout: 5000 });
  assert.equal(
    await page.getByLabel("Tytuł", { exact: true }).inputValue(),
    "Queued revocation autosave",
  );
  await page
    .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
    .waitFor();
  releaseRevocationAutosave();
  await expect.poll(() => revocationAutosaveFinished).toBe(true);
  assert.equal(revocationRouteError, undefined);
  await page.unroute(revocationMatcher);
  assert.equal(
    await mobile.getByLabel("Zaplanowany koniec", { exact: true }).inputValue(),
    "2026-09-16",
  );
  await mobile.getByText("Sesja wygasła.", { exact: false }).first().waitFor();
  await mobile
    .getByRole("button", { name: "Kopiuj wersję roboczą", exact: true })
    .waitFor();
  await settingsPage
    .getByText("Sesja wygasła. Wersja robocza ustawień", { exact: false })
    .waitFor();
  assert.equal(
    await settingsPage
      .getByLabel("Strefa czasowa", { exact: true })
      .inputValue(),
    "Europe/Warsaw",
  );
  await settingsPage
    .getByText("Oczekujące polecenie:", { exact: false })
    .waitFor();
  await settingsPage
    .getByRole("button", {
      name: "Kopiuj wersję roboczą ustawień",
      exact: true,
    })
    .waitFor();
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
      await failurePage
        .screenshot({
          path: join(evidenceDir, `failure-${index}.png`),
          fullPage: false,
        })
        .catch(() => {});
      await writeFile(
        join(evidenceDir, `failure-${index}.txt`),
        await failurePage
          .locator("body")
          .innerText()
          .catch(() => "Page unavailable"),
      ).catch(() => {});
    }
  }
  throw error;
} finally {
  try {
    await browser?.close();
  } finally {
    await host.close();
  }
  await artifactManifest(evidenceDir);
}
