import test from "node:test";
import assert from "node:assert/strict";
import { configure, clearReads } from "../../apps/web/src/lib/api/api.ts";
import { getProjectTags } from "../../apps/web/src/lib/api/tags.ts";
import { loadEditorTarget } from "../../apps/web/src/features/editor/editor-opening.ts";

const turn = () => new Promise((resolve) => setImmediate(resolve));
const project = "11111111-1111-4111-8111-111111111111";
const reference = {
  project_id: project,
  type: "card",
  id: "22222222-2222-4222-8222-222222222222",
};
const base = `/api/v1/projects/${project}`;
const sourcePath = `${base}/cards/${reference.id}`;
const card = {
  type: "card",
  metadata: { id: reference.id, title: "Current source" },
  body: "Current description",
  version: "current-card-version",
};
const projectSource = {
  type: "project",
  metadata: { id: project, name: "Current project" },
  body: "",
  version: "current-project-version",
};
const catalog = { tags: [{ name: "Current tag" }], complete: true };

function fixture(t) {
  const savedFetch = globalThis.fetch;
  const savedWindow = globalThis.window;
  const reads = [];
  globalThis.window = new EventTarget();
  const listeners = new Set();
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === "tag-suggestions-changed") listeners.add(listener);
    add(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (type === "tag-suggestions-changed") listeners.delete(listener);
    remove(type, listener, options);
  };
  configure({
    csrf_token: "synthetic-csrf",
    server_time: new Date().toISOString(),
  });
  globalThis.fetch = (path, { signal, method }) => {
    assert.equal(method, "GET");
    return new Promise((resolve, reject) => {
      const cancelled = () => reject(signal.reason);
      signal.addEventListener("abort", cancelled, { once: true });
      reads.push({
        path,
        signal,
        finish(value, status = 200) {
          signal.removeEventListener("abort", cancelled);
          resolve({ status, ok: status === 200, json: async () => value });
        },
      });
    });
  };
  t.after(async () => {
    clearReads();
    await turn();
    globalThis.fetch = savedFetch;
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  });
  return {
    reads,
    listeners,
    finish(path, value, status) {
      const read = reads.findLast((read) => read.path === path);
      assert.ok(read, `Expected transport for ${path}`);
      read.finish(value, status);
    },
  };
}

test("fresh context transports overlap the source and each opening read is consumed once", async (t) => {
  const { reads, finish } = fixture(t);
  let published = false;
  const opening = loadEditorTarget(
    reference,
    new AbortController().signal,
  ).then((value) => {
    published = true;
    return value;
  });
  void opening.catch(() => {});
  await turn();
  assert.equal(
    reads[0].path,
    sourcePath,
    "The authoritative source starts before optional context",
  );
  assert.deepEqual(
    reads.map((read) => read.path).sort(),
    [sourcePath, base, `${base}/tags`].sort(),
  );
  finish(base, projectSource);
  finish(`${base}/tags`, catalog);
  await turn();
  assert.equal(
    published,
    false,
    "Context cannot open an editor without its source",
  );
  finish(sourcePath, card);
  const target = await opening;
  assert.equal(target.resource, card);
  assert.equal(target.resource.version, card.version);
  assert.equal(await target.opening.takeProject(), projectSource);
  assert.equal(await target.opening.takeTags(), catalog);
  assert.equal(target.opening.takeProject(), undefined);
  assert.equal(target.opening.takeTags(), undefined);
  target.opening.cancel();
});

test("cancellation after source resolution releases unconsumed context and its listener", async (t) => {
  const { reads, listeners, finish } = fixture(t);
  const controller = new AbortController();
  const opening = loadEditorTarget(reference, controller.signal);
  await turn();
  finish(sourcePath, card);
  const target = await opening;
  assert.equal(listeners.size, 1);
  controller.abort();
  assert.equal(target.opening.takeProject(), undefined);
  assert.equal(target.opening.takeTags(), undefined);
  assert.equal(listeners.size, 0);
  assert.ok(
    reads
      .filter((read) => read.path !== sourcePath)
      .every((read) => read.signal.aborted),
  );
});

test("an already cancelled opening starts no transport or invalidation listener", async (t) => {
  const { reads, listeners } = fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadEditorTarget(reference, controller.signal), {
    name: "AbortError",
  });
  assert.equal(reads.length, 0);
  assert.equal(listeners.size, 0);
});

test("source failure cancels pending context without replacing the source error", async (t) => {
  const { reads, finish } = fixture(t);
  const opening = loadEditorTarget(reference, new AbortController().signal);
  const rejected = assert.rejects(opening, /Current source unavailable/);
  await turn();
  finish(
    sourcePath,
    { error: { code: "NOT_FOUND", message: "Current source unavailable" } },
    404,
  );
  await rejected;
  assert.ok(
    reads
      .filter((read) => read.path !== sourcePath)
      .every((read) => read.signal.aborted),
  );
});

test("cancelled navigation releases its three reads and a new opening reads fresh source", async (t) => {
  const { reads, finish } = fixture(t);
  const controller = new AbortController();
  const obsolete = loadEditorTarget(reference, controller.signal);
  const rejected = assert.rejects(obsolete, { name: "AbortError" });
  await turn();
  controller.abort();
  await rejected;
  assert.ok(reads.every((read) => read.signal.aborted));
  const current = loadEditorTarget(reference, new AbortController().signal);
  await turn();
  assert.equal(reads.length, 6);
  const changed = { ...card, version: "newer-source-version" };
  finish(sourcePath, changed);
  finish(base, projectSource);
  finish(`${base}/tags`, catalog);
  const target = await current;
  assert.equal(target.resource, changed);
  target.opening.cancel();
});

test("a tag change before editor creation discards the opening catalog and retains the source read", async (t) => {
  const { reads, finish } = fixture(t);
  const opening = loadEditorTarget(reference, new AbortController().signal);
  await turn();
  window.dispatchEvent(new Event("tag-suggestions-changed"));
  assert.equal(
    reads.find((read) => read.path === `${base}/tags`).signal.aborted,
    true,
  );
  assert.equal(
    reads.find((read) => read.path === sourcePath).signal.aborted,
    false,
  );
  finish(base, projectSource);
  finish(sourcePath, card);
  const target = await opening;
  assert.equal(target.opening.takeTags(), undefined);
  const refreshed = getProjectTags(project);
  await turn();
  const changed = {
    ...catalog,
    tags: [{ name: "Changed before source arrived" }],
  };
  finish(`${base}/tags`, changed);
  assert.equal(await refreshed, changed);
  assert.equal(target.resource, card);
  target.opening.cancel();
});

test("project and milestone openings request only their relevant context", async (t) => {
  const { reads, finish } = fixture(t);
  const projectOpening = loadEditorTarget(
    { project_id: project, type: "project", id: project },
    new AbortController().signal,
  );
  await turn();
  assert.equal(reads.length, 1);
  finish(base, projectSource);
  const projectTarget = await projectOpening;
  assert.equal(projectTarget.opening.takeProject(), undefined);
  assert.equal(projectTarget.opening.takeTags(), undefined);
  projectTarget.opening.cancel();
  const milestone = {
    type: "milestone",
    metadata: { id: reference.id },
    body: "",
    version: "milestone-version",
  };
  const milestonePath = `${base}/milestones/${reference.id}`;
  const milestoneOpening = loadEditorTarget(
    { ...reference, type: "milestone" },
    new AbortController().signal,
  );
  await turn();
  assert.equal(reads.length, 3);
  finish(base, projectSource);
  finish(milestonePath, milestone);
  const target = await milestoneOpening;
  assert.equal(target.resource, milestone);
  assert.equal(await target.opening.takeProject(), projectSource);
  assert.equal(target.opening.takeTags(), undefined);
  target.opening.cancel();
});
