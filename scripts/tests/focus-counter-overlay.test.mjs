import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeCounters,
  presentAcknowledged,
} from "../../apps/web/src/features/cards/focus-counter-overlay.ts";

const today = "2026-09-26";
const counter = (overrides = {}) => ({
  id: "c1",
  name: "Push-ups",
  unit: "reps",
  step: 5,
  archived: false,
  values: { [today]: 15, "2026-09-25": 40 },
  ...overrides,
});
const saved = (version, counters = [counter()]) => ({
  type: "card",
  version,
  body: "A long body that never enters the overlay",
  metadata: { id: "card", title: "Card", counters, comments: [{ id: "x" }] },
});
const summary = (version, overrides = {}) => ({
  type: "card",
  project_id: "project",
  id: "card",
  title: "Card",
  version,
  availability: "ready",
  daily_counters: [
    {
      id: "c1",
      name: "Push-ups",
      unit: "reps",
      step: 5,
      date: today,
      value: 10,
    },
  ],
  ...overrides,
});
const draft = (version, card = "card") => ({
  project: "project",
  card,
  version,
});

test("a projection read before the acknowledgement shows the acknowledged totals", () => {
  const entries = acknowledgeCounters([], draft("v1"), saved("v2"));
  const stale = summary("v1");
  const shown = presentAcknowledged(entries, stale, today);
  assert.equal(shown.version, "v2");
  assert.deepEqual(shown.daily_counters, [
    {
      id: "c1",
      name: "Push-ups",
      unit: "reps",
      step: 5,
      date: today,
      value: 15,
    },
  ]);
  // Everything else comes from the summary, which is not modified.
  assert.equal(shown.title, "Card");
  assert.equal(stale.version, "v1");
  assert.equal(stale.daily_counters[0].value, 10);
});

test("a projection at the acknowledged or a later version is shown as read", () => {
  const entries = acknowledgeCounters([], draft("v1"), saved("v2"));
  for (const version of ["v2", "v3", ""]) {
    const current = summary(version);
    assert.equal(presentAcknowledged(entries, current, today), current);
  }
  const other = summary("v1", { id: "another" });
  assert.equal(presentAcknowledged(entries, other, today), other);
  const elsewhere = summary("v1", { project_id: "elsewhere" });
  assert.equal(presentAcknowledged(entries, elsewhere, today), elsewhere);
});

test("consecutive saves keep replacing every older projection of the chain", () => {
  let entries = acknowledgeCounters([], draft("v1"), saved("v2"));
  entries = acknowledgeCounters(
    entries,
    draft("v2"),
    saved("v3", [counter({ values: { [today]: 20 } })]),
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].bases, ["v1", "v2"]);
  for (const version of ["v1", "v2"]) {
    const shown = presentAcknowledged(entries, summary(version), today);
    assert.equal(shown.version, "v3");
    assert.equal(shown.daily_counters[0].value, 20);
  }
});

test("a save based on an unrelated version starts a new chain", () => {
  let entries = acknowledgeCounters([], draft("v1"), saved("v2"));
  // The card changed elsewhere; this save was made from a fresh read.
  entries = acknowledgeCounters(entries, draft("v5"), saved("v6"));
  assert.deepEqual(entries[0].bases, ["v5"]);
  const older = summary("v1");
  assert.equal(presentAcknowledged(entries, older, today), older);
  assert.equal(
    presentAcknowledged(entries, summary("v5"), today).version,
    "v6",
  );
});

test("archived counters are omitted and a day without a record shows zero", () => {
  const entries = acknowledgeCounters(
    [],
    draft("v1"),
    saved("v2", [
      counter(),
      counter({ id: "c2", name: "Archived", archived: true }),
      counter({ id: "c3", name: "Squats", values: { "2026-09-25": 30 } }),
    ]),
  );
  assert.deepEqual(
    presentAcknowledged(entries, summary("v1"), today).daily_counters.map(
      ({ id, value, date }) => [id, value, date],
    ),
    [
      ["c1", 15, today],
      ["c3", 0, today],
    ],
  );
  // The next workspace day reads the same acknowledgement for its own date.
  assert.deepEqual(
    presentAcknowledged(
      entries,
      summary("v1"),
      "2026-09-27",
    ).daily_counters.map(({ value, date }) => [value, date]),
    [
      [0, "2026-09-27"],
      [0, "2026-09-27"],
    ],
  );
  const none = acknowledgeCounters([], draft("v1"), {
    ...saved("v2"),
    metadata: { id: "card", title: "Card" },
  });
  assert.deepEqual(
    presentAcknowledged(none, summary("v1"), today).daily_counters,
    [],
  );
});

test("only counter data is retained, for a bounded number of cards and bases", () => {
  const [entry] = acknowledgeCounters([], draft("v1"), saved("v2"));
  assert.deepEqual(Object.keys(entry).sort(), ["bases", "key", "resource"]);
  assert.deepEqual(Object.keys(entry.resource).sort(), ["counters", "version"]);

  let entries = [];
  for (let index = 0; index < 150; index++)
    entries = acknowledgeCounters(
      entries,
      draft("v1", `card-${index}`),
      saved("v2"),
    );
  assert.equal(entries.length, 100);
  assert.equal(entries.at(-1).key, "project:card-149");
  assert.equal(entries[0].key, "project:card-50");

  let chain = [];
  for (let index = 0; index < 100; index++)
    chain = acknowledgeCounters(
      chain,
      draft(`v${index}`),
      saved(`v${index + 1}`),
    );
  // The first base and the most recent ones remain; the middle is forgotten.
  assert.equal(chain[0].bases.length, 64);
  assert.equal(chain[0].bases[0], "v0");
  assert.equal(chain[0].bases.at(-1), "v99");
  assert.equal(chain[0].bases.includes("v20"), false);
});
