import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calendarContentArgs,
  calendarEventIntersects,
  collectHiddenChunks,
  measureOnce,
  monthChunkSamples,
  monthLayoutGeometry,
} from "../../apps/web/src/features/planning/calendar-layout.ts";
import { calendarLayoutSource } from "../../apps/web/build/calendar-layout-plugin.ts";

function monthChunk(overrides = {}) {
  return {
    gridRow: 1,
    gridColumn: 2,
    dates: [new Date("2026-09-01"), new Date("2026-09-02")],
    event: {
      title: "First title",
      allDay: true,
      display: "auto",
      styles: [],
      classNames: [],
      editable: true,
      startEditable: true,
      durationEditable: true,
      extendedProps: {
        astra: {
          kind: "card_schedule",
          title: "First title",
          version: "observed",
        },
      },
    },
    ...overrides,
  };
}

test("month samples retain every current chunk while sharing only reviewed geometry", () => {
  const first = monthChunk();
  const second = monthChunk();
  second.event.title = second.event.extendedProps.astra.title =
    "Another long title 🧪";
  second.event.extendedProps.astra.version = "changed";
  const samples = monthChunkSamples([first, second]);
  assert.deepEqual([...samples.representatives], [first]);
  assert.equal(samples.sample.get(first), first);
  assert.equal(samples.sample.get(second), first);
  assert.equal(samples.sample.size, 2);
  const current = monthChunk();
  const next = monthChunkSamples([current]);
  assert.deepEqual([...next.sample], [[current, current]]);
  assert.equal(next.sample.has(first), false);
  assert.equal(monthChunkSamples([]), null);
});

test("month samples separate widths, rows, snippet kinds and editability", () => {
  const first = monthChunk();
  const changes = [
    monthChunk({ gridRow: 2 }),
    monthChunk({ gridColumn: 3 }),
    monthChunk({ dates: [new Date("2026-09-01")] }),
    monthChunk(),
    monthChunk(),
    monthChunk(),
  ];
  changes[3].event.extendedProps.astra.kind = "milestone_due";
  changes[4].event.editable = false;
  changes[5].event.allDay = false;
  Object.assign(changes[5].event.extendedProps.astra, {
    kind: "card_event",
    event: { start: "2026-09-01T09:30", duration_minutes: 60 },
  });
  const all = [first, ...changes];
  const samples = monthChunkSamples(all);
  assert.equal(samples.representatives.size, all.length);
  for (const chunk of all) assert.equal(samples.sample.get(chunk), chunk);
});

test("unknown month content and style overrides retain the full native renderer", () => {
  for (const change of [
    (chunk) => (chunk.resource = {}),
    (chunk) => chunk.event.styles.push("height:90px"),
    (chunk) => chunk.event.classNames.push("custom"),
    (chunk) => (chunk.event.display = "background"),
    (chunk) => (chunk.event.title = "Unreviewed content"),
    (chunk) => (chunk.event.allDay = false),
    (chunk) => (chunk.event.extendedProps = {}),
    (chunk) => (chunk.event.extendedProps.astra.title = " "),
    (chunk) => (chunk.event.extendedProps.astra.kind = "unknown"),
  ]) {
    const unknown = monthChunk();
    change(unknown);
    assert.equal(monthChunkSamples([monthChunk(), unknown]), null);
  }
});

test("month clock values share line geometry while format length remains separate", () => {
  const chunks = [monthChunk(), monthChunk(), monthChunk()];
  for (const [index, chunk] of chunks.entries()) {
    chunk.event.allDay = false;
    Object.assign(chunk.event.extendedProps.astra, {
      kind: "card_event",
      event: {
        start: index === 0 ? "2026-09-01T09:01" : "2026-09-01T18:59",
        duration_minutes: 60,
      },
    });
  }
  // A future extended clock format must not silently reuse an existing shape.
  chunks[2].event.extendedProps.astra.event.start += ":00";
  const samples = monthChunkSamples(chunks);
  assert.deepEqual([...samples.representatives], [chunks[0], chunks[2]]);
  assert.equal(samples.sample.get(chunks[1]), chunks[0]);
});

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

function geometryGrid(heights) {
  const cells = heights.map((height) => ({
    height,
    firstElementChild: { height: 22 },
    lastElementChild: { height: 0 },
    nextElementSibling: null,
  }));
  for (let index = 0; index + 1 < cells.length; index++)
    cells[index].nextElementSibling = cells[index + 1];
  let lookups = 0;
  return {
    cells,
    get lookups() {
      return lookups;
    },
    children: {
      item(index) {
        lookups++;
        return cells[index] ?? null;
      },
    },
  };
}

test("one month pass reuses cell/span capacity and observes each current bottom", () => {
  const grid = geometryGrid(Array(14).fill(150.25));
  grid.cells[9].lastElementChild.height = 15.5;
  grid.cells[10].lastElementChild.height = 8.25;
  let reads = 0;
  const pass = monthLayoutGeometry(grid, 7, (element) => {
    reads++;
    return element.height;
  });
  for (let index = 0; index < 1000; index++) {
    const chunk = {
      gridRow: 2,
      gridColumn: 2,
      dates: Array(index % 2 ? 3 : 1),
      bottom: index % 3 ? 140 : 150.25,
    };
    // Independent native footer traversal, without any pass-local reuse.
    let day = grid.cells[8],
      footer = 0;
    for (let offset = 0; offset < chunk.dates.length && day; offset++) {
      footer = Math.max(footer, day.lastElementChild.height);
      day = day.nextElementSibling;
    }
    assert.equal(pass.isHidden(chunk), chunk.bottom > 150.25 - footer);
    assert.equal(pass.dayElement(chunk), grid.cells[8]);
    assert.equal(pass.measure(pass.dayElement(chunk).firstElementChild), 22);
  }
  assert.equal(grid.lookups, 1);
  assert.equal(reads, 5);
});

test("a new month pass observes resized cells and newly populated span footers", () => {
  const grid = geometryGrid([140, 140, 140]);
  const chunk = {
    gridRow: 1,
    gridColumn: 1,
    dates: Array(3),
    bottom: 120,
  };
  const read = (element) => element.height;
  assert.equal(monthLayoutGeometry(grid, 3, read).isHidden(chunk), false);
  grid.cells[0].height = 130;
  grid.cells[2].lastElementChild.height = 25;
  assert.equal(monthLayoutGeometry(grid, 3, read).isHidden(chunk), true);
  grid.cells[0].height = 145;
  // Native hiding uses a strict boundary: exact fits stay visible.
  assert.equal(monthLayoutGeometry(grid, 3, read).isHidden(chunk), false);
  chunk.bottom += 0.001;
  assert.equal(monthLayoutGeometry(grid, 3, read).isHidden(chunk), true);
});

test("month capacity preserves native sibling truncation at the grid edge", () => {
  const grid = geometryGrid([100, 100]);
  grid.cells[1].lastElementChild.height = 18;
  const pass = monthLayoutGeometry(grid, 2, (element) => element.height);
  const chunk = { gridRow: 1, gridColumn: 2, dates: Array(3), bottom: 82 };
  assert.equal(pass.isHidden(chunk), false);
  chunk.bottom = 83;
  assert.equal(pass.isHidden(chunk), true);
});

test("numeric calendar bounds match native exclusive dates and resource filtering", () => {
  function native(event, start, end, resource) {
    return (
      (!resource || event.resourceIds.includes(resource.id)) &&
      event.start < end &&
      event.end > start
    );
  }
  const instants = [
    -86400001,
    0,
    Date.parse("2026-09-07T00:00:00Z"),
    Date.parse("2026-10-25T02:30:00+02:00"),
    Date.parse("9999-12-31T00:00:00Z"),
    NaN,
  ];
  for (const instant of instants)
    for (const duration of [0, 1, 1800000, 86400000])
      for (const offset of [-86400000, -1, 0, 1, 86400000])
        for (const resource of [
          undefined,
          { id: "one" },
          { id: "missing" },
          { id: 7 },
          { id: "7" },
        ]) {
          const event = {
            start: new Date(instant),
            end: new Date(instant + duration),
            resourceIds: ["one", 7],
          };
          const start = new Date(instant + offset),
            end = new Date(instant + offset + 86400000);
          assert.equal(
            calendarEventIntersects(event, start, end, resource),
            native(event, start, end, resource),
          );
        }
});

test("calendar intersection reads mutated event and query dates without caching", () => {
  const start = new Date("2026-09-07T00:00:00Z");
  const end = new Date("2026-09-08T00:00:00Z");
  const event = {
    start: new Date(start),
    end: new Date(end),
    resourceIds: ["one"],
  };
  assert.equal(calendarEventIntersects(event, start, end), true);
  event.start.setUTCDate(8);
  event.end.setUTCDate(9);
  assert.equal(calendarEventIntersects(event, start, end), false);
  start.setUTCDate(8);
  end.setUTCDate(9);
  assert.equal(calendarEventIntersects(event, start, end, { id: "one" }), true);
  event.resourceIds[0] = "two";
  assert.equal(
    calendarEventIntersects(event, start, end, { id: "one" }),
    false,
  );
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
    "src/lib/chunks.js",
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
