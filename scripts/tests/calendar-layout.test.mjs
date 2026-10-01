import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calendarContentArgs,
  collectHiddenChunks,
  measureOnce,
} from "../../apps/web/src/features/planning/calendar-layout.ts";
import { calendarLayoutSource } from "../../apps/web/build/calendar-layout-plugin.ts";

test("one hide pass retains native order, spanned days and chunk reference identity", () => {
  const actual = new Map(),
    expected = new Map();
  const chunks = Array.from({ length: 400 }, (_, index) => ({
    id: String(index),
    version: "observed",
  }));
  // This oracle is the reviewed upstream hide-list behavior.
  function nativeAdd(key, chunk) {
    const values = expected.get(key);
    if (!values) expected.set(key, [chunk]);
    else if (!values.includes(chunk)) expected.set(key, [...values, chunk]);
  }
  for (const pass of [
    chunks,
    chunks,
    [...chunks.slice(120), { id: "0", version: "changed" }],
  ]) {
    const hidden = collectHiddenChunks(actual);
    for (const chunk of pass)
      for (const day of [7, 8, 9]) {
        nativeAdd(day, chunk);
        hidden.add(day, chunk);
        hidden.add(day, chunk);
      }
    hidden.publish();
    assert.deepEqual([...actual], [...expected]);
    for (const [day, values] of actual)
      assert.ok(
        values.every((chunk, index) => chunk === expected.get(day)[index]),
      );
  }
});

test("unchanged hide passes preserve published lists and do not retrigger map writes", () => {
  let writes = 0;
  class ObservedMap extends Map {
    set(key, values) {
      writes++;
      return super.set(key, values);
    }
  }
  const first = { id: "first" },
    second = { id: "second" };
  const original = [first];
  const target = new ObservedMap([[7, original]]);
  writes = 0;
  const hidden = collectHiddenChunks(target);
  hidden.add(7, first);
  hidden.publish();
  assert.equal(writes, 0);
  assert.equal(target.get(7), original);
  hidden.add(7, second);
  hidden.add(7, second);
  hidden.publish();
  assert.equal(writes, 1);
  assert.deepEqual(original, [first]);
  assert.deepEqual(target.get(7), [first, second]);
  hidden.publish();
  assert.equal(writes, 1);
});

test("a new hide pass observes cleared geometry generations and current chunk objects", () => {
  const old = { id: "same", version: "old" },
    current = { id: "same", version: "current" };
  const target = new Map([[7, [old]]]);
  target.clear();
  const hidden = collectHiddenChunks(target);
  hidden.add(8, current);
  hidden.publish();
  assert.equal(target.has(7), false);
  assert.deepEqual(target.get(8), [current]);
  assert.equal(target.get(8)[0], current);
});

test("one layout pass reuses header, day and empty-footer geometry", () => {
  const header = { height: 24 },
    day = { height: 140 },
    footer = { height: 0 };
  let reads = 0;
  const measure = measureOnce((element) => {
    reads++;
    return element.height;
  });
  for (let i = 0; i < 1000; i++) {
    assert.equal(measure(header), 24);
    assert.equal(measure(day) - measure(footer), 140);
  }
  assert.equal(reads, 3);
});

test("the next layout pass observes resized cells and changed footers", () => {
  const day = { height: 140 },
    footer = { height: 0 };
  const read = (element) => element.height;
  const before = measureOnce(read);
  assert.equal(before(day) - before(footer), 140);
  day.height = 90;
  footer.height = 25;
  const after = measureOnce(read);
  assert.equal(after(day) - after(footer), 65);
});

test("unused calendar snippet details are lazy and used details keep their current values", () => {
  const event = { id: "event" };
  let time = "09:30",
    view = "day",
    reads = 0;
  const args = calendarContentArgs(
    event,
    () => {
      reads++;
      return time;
    },
    () => {
      reads++;
      return view;
    },
  );
  assert.equal(args.event, event);
  assert.equal(reads, 0);
  assert.equal(args.timeText, "09:30");
  assert.equal(args.view, "day");
  time = "10:00";
  view = "week";
  assert.deepEqual({ ...args }, { event, timeText: "10:00", view: "week" });
  assert.equal(reads, 4);
});

test("a changed vendor source fails the build instead of silently applying an unreviewed patch", async () => {
  for (const path of [
    "src/plugins/day-grid/View.svelte",
    "src/plugins/day-grid/Event.svelte",
    "src/lib/events.js",
    "src/lib/components/BaseEvent.svelte",
    "src/plugins/day-grid/derived.js",
  ]) {
    const id = new URL(
      `../../node_modules/@event-calendar/core/${path}`,
      import.meta.url,
    ).pathname;
    const source = await readFile(id, "utf8");
    assert.equal(typeof (await calendarLayoutSource(source, id)), "string");
    await assert.rejects(
      () => calendarLayoutSource(`${source}\n// Changed dependency\n`, id),
      /Review calendar layout optimization/,
    );
    assert.equal(await calendarLayoutSource(source, `${id}?compile`), null);
  }
  assert.equal(
    await calendarLayoutSource(
      "unrelated",
      "/apps/web/src/features/planning/CalendarView.svelte",
    ),
    null,
  );
});
