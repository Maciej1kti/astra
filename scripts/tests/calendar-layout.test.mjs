import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calendarContentArgs,
  measureOnce,
} from "../../apps/web/src/features/planning/calendar-layout.ts";
import { calendarLayoutSource } from "../../apps/web/build/calendar-layout-plugin.ts";

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
