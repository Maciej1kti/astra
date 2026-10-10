import { invalidationBatch } from "../../apps/web/src/lib/api/invalidations.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import {
  viewSections,
  viewQueryKey,
  affectedSections,
  invalidatesTags,
  resourceListPath,
  loadView,
} from "../../apps/web/src/features/workspace/view-queries.ts";
import {
  ApiError,
  configure,
  clearReads,
  command,
  send,
} from "../../apps/web/src/lib/api/api.ts";
import { cursorPage } from "../../apps/web/src/lib/api/pagination.ts";

const query = {
  view: "list",
  project: "p",
  search: "",
  archived: false,
  status: "",
  priority: "",
  label: "",
};
const response = (value) => ({
  status: 200,
  ok: true,
  json: async () => value,
});

test("Projects loads projects only and keeps folder/title filtering local", async () => {
  const projects = {
    ...query,
    view: "projects",
    folder: "Work",
    search: "Astra",
  };
  assert.deepEqual(viewSections(projects), ["projects"]);
  assert.equal(
    viewQueryKey(projects),
    viewQueryKey({
      ...projects,
      folder: "Home",
      search: "Other",
      project: "other",
    }),
  );
  for (const type of ["update", "milestone"])
    assert.deepEqual(
      affectedSections(
        { kind: "changed", project_id: "other", target: { type } },
        projects,
      ),
      [],
    );
  // A goal's span is derived from its cards, so their writes reload goals.
  for (const type of ["card", "project"])
    assert.deepEqual(
      affectedSections(
        { kind: "changed", project_id: "other", target: { type } },
        projects,
      ),
      ["projects"],
    );
  for (const view of ["calendar", "gantt"]) {
    const planning = { ...query, view, project: "p" };
    assert.deepEqual(
      affectedSections(
        { kind: "changed", project_id: "p", target: { type: "card" } },
        planning,
      ),
      ["projects", "planning"],
    );
    assert.deepEqual(
      affectedSections(
        { kind: "changed", project_id: "other", target: { type: "card" } },
        planning,
      ),
      ["projects"],
    );
  }
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "other", target: { type: "card" } },
      { ...query, view: "list", project: "p" },
    ),
    [],
  );
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const first = !url.includes("cursor=");
    const archived =
      new URL(url, "https://example.test").searchParams.get("archived") ===
      "true";
    return response({
      items: [
        {
          type: "project",
          id: `${archived ? "archived" : "ordinary"}-${first ? "one" : "two"}`,
          status: archived ? "archived" : "active",
        },
      ],
      page: { next_cursor: first ? "second" : null },
    });
  };
  try {
    const result = await loadView(
      projects,
      viewSections(projects),
      {},
      new AbortController().signal,
    );
    assert.deepEqual(
      result.projects.map((item) => item.id),
      ["ordinary-one", "ordinary-two", "archived-one", "archived-two"],
    );
    assert.equal(calls.length, 4);
    assert.equal(
      calls.filter(
        (url) =>
          !new URL(url, "https://example.test").searchParams.has("archived"),
      ).length,
      2,
    );
    assert.equal(
      calls.filter((url) => url.startsWith("/api/v1/projects?archived=true"))
        .length,
      2,
    );
    assert.deepEqual(result.pages, {});
  } finally {
    clearReads();
    globalThis.fetch = previous;
  }
});

test("Projects combines overlapping archive reads as one complete observed project", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  const ordinary = {
    type: "project",
    id: "changed-project",
    title: "Before archive",
    status: "active",
    version: "observed-before",
    folder: "Work",
  };
  const archived = {
    type: "project",
    id: ordinary.id,
    title: "Archived source",
    status: "archived",
    version: "observed-archived",
  };
  const activeOnly = { type: "project", id: "active-only", status: "active" };
  const archivedOnly = {
    type: "project",
    id: "archived-only",
    status: "archived",
  };
  globalThis.fetch = async (url) => {
    calls.push(url);
    const archiveScope =
      new URL(url, "https://example.test").searchParams.get("archived") ===
      "true";
    return response({
      items: archiveScope ? [archived, archivedOnly] : [ordinary, activeOnly],
      page: { next_cursor: null },
    });
  };
  try {
    const result = await loadView(
      { ...query, view: "projects" },
      ["projects"],
      {},
      new AbortController().signal,
    );
    assert.deepEqual(result.projects, [archived, activeOnly, archivedOnly]);
    assert.equal(result.projects[0], archived);
    assert.equal(result.projects[0].version, "observed-archived");
    assert.equal("folder" in result.projects[0], false);
    assert.equal(calls.length, 2, "Overlap must not introduce source rereads");
  } finally {
    clearReads();
    globalThis.fetch = previous;
  }
});

test("planning routes only load shared project context; list and reports fetch their own collection", () => {
  assert.deepEqual(viewSections({ ...query, view: "calendar" }), [
    "projects",
    "planning",
  ]);
  assert.deepEqual(viewSections(query), ["projects", "card"]);
  assert.deepEqual(viewSections({ ...query, view: "chart" }), [
    "projects",
    "chart",
  ]);
  assert.deepEqual(viewSections({ ...query, view: "updates" }), [
    "projects",
    "update",
  ]);
  assert.deepEqual(viewSections({ ...query, view: "focus" }), [
    "projects",
    "focus",
    "attention",
    "card",
    "event",
  ]);
});

test("Chart invalidates for its card and project sources while ignoring unrelated report writes", () => {
  const chart = { ...query, view: "chart" };
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "card" } },
      chart,
    ),
    ["chart"],
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "project" } },
      chart,
    ),
    ["projects", "chart"],
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "update" } },
      chart,
    ),
    [],
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "other", target: { type: "card" } },
      chart,
    ),
    [],
  );
  assert.deepEqual(affectedSections({ kind: "resync_required" }, chart), [
    "projects",
    "chart",
  ]);
});

test("SSE changes invalidate only affected visible data, with conservative recovery for gaps", () => {
  assert.equal(
    invalidatesTags({
      kind: "changed",
      target: { type: "card" },
      tags_changed: false,
    }),
    false,
  );
  assert.equal(
    invalidatesTags({
      kind: "changed",
      target: { type: "card" },
      tags_changed: true,
    }),
    true,
  );
  assert.equal(
    invalidatesTags({ kind: "changed", target: { type: "card" } }),
    true,
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "other", target: { type: "card" } },
      query,
    ),
    [],
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "update" } },
      query,
    ),
    [],
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "card" } },
      query,
    ),
    ["card"],
  );
  assert.deepEqual(affectedSections({ kind: "resync_required" }, query), [
    "projects",
    "card",
  ]);
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "p", target: { type: "milestone" } },
      { ...query, view: "gantt" },
    ),
    ["planning"],
  );
});

test("loaded-title filters retain queries and pagination, while server filters remain scoped and exact", () => {
  assert.equal(
    viewQueryKey({ ...query, view: "board" }),
    viewQueryKey({ ...query, view: "board", search: "new" }),
  );
  assert.notEqual(
    viewQueryKey(query),
    viewQueryKey({ ...query, search: "new" }),
  );
  const url = new URL(
    resourceListPath(
      { ...query, label: "Review, exact", archived: true },
      "card",
      "opaque:c",
    ),
    "https://local.test",
  );
  assert.equal(url.searchParams.get("label"), "Review, exact");
  assert.equal(url.searchParams.get("cursor"), "opaque:c");
  assert.equal(url.searchParams.get("archived"), "true");
});

test("focus card reads are bounded to daily plans and ignore list-only filters", () => {
  const url = new URL(
    resourceListPath(
      {
        ...query,
        view: "focus",
        archived: true,
        status: "done",
        priority: "high",
        label: "retired",
      },
      "card",
    ),
    "https://local.test",
  );
  assert.equal(url.pathname, "/api/v1/views/focus-cards");
  assert.equal(url.searchParams.get("section"), "motion");
  assert.equal(url.searchParams.get("status"), null);
  assert.equal(url.searchParams.get("archived"), null);
  assert.equal(url.searchParams.get("priority"), null);
  assert.equal(url.searchParams.get("label"), null);
});

test("continuous invalidations flush at the deadline and teardown cancels queued work", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const batches = [];
    const batch = invalidationBatch((events) => batches.push(events), 150, 500);
    for (let i = 0; i < 5; i++) {
      batch.push({ kind: "changed" });
      mock.timers.tick(100);
    }
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 5);
    batch.push({ kind: "changed" });
    batch.cancel();
    mock.timers.tick(500);
    assert.equal(batches.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("page refresh preserves a valid cursor and restarts only on explicit CURSOR_STALE", async () => {
  const seen = [];
  assert.deepEqual(
    await cursorPage(async (cursor) => {
      seen.push(cursor);
      return "same page";
    }, "page-2"),
    { value: "same page", reset: false },
  );
  const recovered = await cursorPage(async (cursor) => {
    seen.push(cursor);
    if (cursor) throw new ApiError(409, { error: { code: "CURSOR_STALE" } });
    return "first";
  }, "old");
  assert.deepEqual(recovered, { value: "first", reset: true });
  assert.deepEqual(seen, ["page-2", "old", null]);
  await assert.rejects(
    cursorPage(async () => {
      throw new ApiError(401, {});
    }, "page"),
    { status: 401 },
  );
});

test("one active card-list load makes exactly one request and leaves unrelated arrays absent", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(url);
    return response({ items: [{ id: "c" }], page: { next_cursor: null } });
  };
  try {
    const result = await loadView(
      query,
      ["card"],
      {},
      new AbortController().signal,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(result.pages.card.value.items, [{ id: "c" }]);
    assert.equal(result.focus, undefined);
    assert.equal(result.projects, undefined);
  } finally {
    clearReads();
    globalThis.fetch = previous;
  }
});

test("mutations bypass GET sharing and retry retains original identity, epoch and payload", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  configure({
    csrf_token: "csrf",
    command_epoch: "original",
    server_time: new Date().toISOString(),
  });
  const pending = command(
    "/api/v1/projects/test/cards",
    "PATCH",
    { set: { title: "Draft" } },
    "version",
  );
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) throw new TypeError("Response lost");
    return response({
      api_version: "1",
      request_id: pending.requestId,
      replayed: false,
      status: "committed",
      result: { type: "card" },
      warnings: [],
    });
  };
  try {
    await assert.rejects(send(pending), {
      name: "TransportError",
      cause: new TypeError("Response lost"),
    });
    assert.equal(calls.length, 1);
    configure({
      csrf_token: "new csrf",
      command_epoch: "new epoch",
      server_time: new Date().toISOString(),
    });
    await send(pending);
    assert.equal(calls[0].init.body, calls[1].init.body);
    assert.equal(calls[1].init.headers["X-Command-Epoch"], "original");
    assert.equal(
      calls[0].init.headers["X-Request-ID"],
      calls[1].init.headers["X-Request-ID"],
    );
    assert.equal(calls[1].init.headers["If-Match"], '"version"');
  } finally {
    globalThis.fetch = previous;
  }
});

test("Focus queries use folders across projects and invalidate when project folders change", () => {
  const focus = { ...query, view: "focus", folder: "Work" };
  const path = new URL(resourceListPath(focus, "card"), "https://example.test");
  assert.equal(path.searchParams.get("folder"), "Work");
  assert.equal(path.searchParams.has("project_id"), false);
  assert.equal(
    viewQueryKey(focus),
    viewQueryKey({ ...focus, project: "other" }),
  );
  assert.notEqual(
    viewQueryKey(focus),
    viewQueryKey({ ...focus, folder: "Home" }),
  );
  assert.deepEqual(
    affectedSections(
      { kind: "changed", project_id: "other", target: { type: "project" } },
      focus,
    ),
    ["projects", "focus", "attention", "card", "event"],
  );
});

test("Focus uses snapshot summaries without detail reads and retains missing pins in order", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  const first = {
    type: "card",
    project_id: "p",
    id: "first",
    title: "First",
    version: "observed-first",
    availability: "stale",
  };
  const second = {
    ...first,
    id: "second",
    title: "Second",
    version: "observed-second",
    availability: "ready",
  };
  globalThis.fetch = async (url) => {
    calls.push(url);
    assert.equal(url, "/api/v1/workspace/focus");
    return response({
      items: [second, { ...first, id: "missing" }, first].map((item) => ({
        project_id: item.project_id,
        card_id: item.id,
      })),
      cards: [first, second],
      version: "order-version",
      complete: false,
      warnings: [],
      page: { freshness: "stale" },
    });
  };
  try {
    const result = await loadView(
      { ...query, view: "focus" },
      ["focus"],
      {},
      new AbortController().signal,
    );
    assert.deepEqual(calls, ["/api/v1/workspace/focus"]);
    assert.deepEqual(
      result.focusCards.map((item) => item.id),
      ["second", "missing", "first"],
    );
    assert.deepEqual(result.focusCards[0], second);
    assert.equal(result.focusCards[1].availability, "unavailable");
    assert.deepEqual(result.focusCards[2], first);
    assert.equal(result.focus.version, "order-version");
  } finally {
    clearReads();
    globalThis.fetch = previous;
  }
});

test("Focus remains compatible with reference-only hosts", async () => {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(url);
    return response(
      url === "/api/v1/workspace/focus"
        ? {
            items: [{ project_id: "p", card_id: "c" }],
            version: "order",
            warnings: [],
            page: { freshness: "index_snapshot" },
          }
        : {
            type: "card",
            metadata: { id: "c", title: "Legacy pin" },
            version: "card-version",
          },
    );
  };
  try {
    const result = await loadView(
      { ...query, view: "focus" },
      ["focus"],
      {},
      new AbortController().signal,
    );
    assert.deepEqual(calls, [
      "/api/v1/workspace/focus",
      "/api/v1/projects/p/cards/c",
    ]);
    assert.equal(result.focusCards[0].title, "Legacy pin");
    assert.equal(result.focusCards[0].version, "card-version");
  } finally {
    clearReads();
    globalThis.fetch = previous;
  }
});
