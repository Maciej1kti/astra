import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileModule } from "svelte/compiler";
import { readRoute } from "../../apps/web/src/features/workspace/navigation.ts";

// Exercise the actual rune module; only browser history and feature hooks are fixtures.
const sourceUrl = new URL(
  "../../apps/web/src/features/workspace/navigation-state.svelte.ts",
  import.meta.url,
);
const source = stripTypeScriptTypes(await readFile(sourceUrl, "utf8"));
const compiled = compileModule(source, {
  filename: sourceUrl.pathname,
  generate: "client",
}).js.code;
await mkdir(new URL("../../test-results/", import.meta.url), {
  recursive: true,
});
const temp = await mkdtemp(
  new URL("../../test-results/navigation-module-", import.meta.url),
);
after(() => rm(temp, { recursive: true, force: true }));
const modulePath = join(temp, "navigation.mjs");
await writeFile(
  modulePath,
  compiled.replace(
    '"./navigation"',
    JSON.stringify(
      new URL(
        "../../apps/web/src/features/workspace/navigation.ts",
        import.meta.url,
      ).href,
    ),
  ),
);
const { navigationState } = await import(pathToFileURL(modulePath).href);

const today = "2026-09-08";
const project = "11111111-1111-4111-8111-111111111111";
const target = {
  project,
  type: "card",
  id: "22222222-2222-4222-8222-222222222222",
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(overrides = {}) {
  let url = new URL(`https://localhost/?view=list&project=${project}`);
  const historyCalls = [],
    shown = [],
    errors = [];
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    get: () => url,
  });
  globalThis.history = Object.fromEntries(
    ["pushState", "replaceState"].map((name) => [
      name,
      (_state, _title, next) => {
        historyCalls.push({ name, next });
        url = new URL(next, url);
      },
    ]),
  );
  const routing = navigationState(readRoute(url.searchParams, today), {
    today: () => today,
    hasEditor: () => false,
    requestClose: () => false,
    dialogsOpen: () => false,
    clearEditor: () => {},
    loadResource: async () => ({}),
    showResource: (...args) => shown.push(args),
    refresh: async () => {},
    error: (cause) => errors.push(cause),
    ...overrides,
  });
  return {
    routing,
    shown,
    errors,
    historyCalls,
    navigate: (next) => {
      url = new URL(next, url);
    },
  };
}

test("view/project selection and draft creation invalidate a pending resource read", async () => {
  for (const invalidate of [
    (route) => route.selectView("updates"),
    (route) => route.changeFilters({ project: "" }),
    (route) => route.showProject("another-project"),
    (route) => route.startDraft(),
    (route) => route.reset(),
  ]) {
    const read = deferred();
    const { routing, shown, errors } = fixture({
      loadResource: () => read.promise,
    });
    const opening = routing.openResource(target);
    invalidate(routing);
    read.resolve({ version: "old-read" });
    await opening;
    assert.deepEqual(shown, []);
    assert.deepEqual(errors, []);
  }
});

test("latest resource wins and an obsolete read failure cannot replace its result", async () => {
  const first = deferred(),
    second = deferred();
  let reads = 0;
  const { routing, shown, errors } = fixture({
    loadResource: () => (++reads === 1 ? first.promise : second.promise),
  });
  const old = routing.openResource(target),
    latest = routing.openResource({ ...target, id: "latest" });
  second.resolve({ version: "latest-version" });
  await latest;
  first.reject(new Error("obsolete failure"));
  await old;
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0].id, "latest");
  assert.deepEqual(errors, []);
});

test("route owner resets collection status and preserves exact filters and calendar navigation", () => {
  const { routing } = fixture();
  routing.changeFilters({
    status: "review",
    label: " QA, exact ",
    archived: true,
  });
  routing.changeFilters({ collection: "milestones" });
  assert.equal(routing.current.status, "");
  assert.equal(routing.current.label, " QA, exact ");
  routing.changeFilters({ month: "2026-12" });
  routing.changeMonth(1);
  assert.equal(routing.current.month, "2027-01");
  routing.navigateCalendar("2027-01-08", "week");
  assert.equal(routing.current.calendarLayout, "week");
  assert.equal(routing.current.calendarDate, "2027-01-08");
});

test("history synchronizes semantic changes with push and search edits with replace", () => {
  const { routing, historyCalls } = fixture();
  routing.sync();
  routing.changeFilters({ search: "one" });
  routing.sync();
  routing.selectView("board");
  routing.sync();
  assert.deepEqual(
    historyCalls.map((call) => call.name),
    ["replaceState", "replaceState", "pushState"],
  );
});

test("keeping a dirty editor restores its history entry without fetching another resource", () => {
  let reads = 0;
  const { routing, navigate } = fixture({
    hasEditor: () => true,
    requestClose: () => true,
    loadResource: async () => {
      reads++;
    },
  });
  routing.sync(target);
  const original = location.href;
  navigate("?view=board");
  routing.fromHistory();
  assert.equal(routing.pending.get("view"), "board");
  routing.keepEditing();
  assert.equal(location.href, original);
  assert.equal(routing.pending, null);
  assert.equal(routing.restoring, false);
  assert.equal(reads, 0);
});

test("new view navigation cancels an in-flight history restoration without leaving routing suspended", async () => {
  const read = deferred();
  const { routing, shown } = fixture({ loadResource: () => read.promise });
  const restoring = routing.restore(
    new URLSearchParams({
      view: "list",
      resource_project: project,
      type: "card",
      resource: target.id,
    }),
  );
  assert.equal(routing.restoring, true);
  routing.selectView("board");
  read.resolve({ version: "obsolete" });
  await restoring;
  assert.equal(routing.current.view, "board");
  assert.equal(routing.restoring, false);
  assert.deepEqual(shown, []);
});
