import type { CalendarItem } from "../../lib/contracts/api.generated";

interface MonthChunk {
  gridRow: number;
  gridColumn: number;
  dates: Date[];
  resource?: unknown;
  event: {
    title: string;
    allDay: boolean;
    display: string;
    styles: string[];
    classNames: string[];
    editable?: boolean;
    startEditable?: boolean;
    durationEditable?: boolean;
    extendedProps: { astra?: CalendarItem };
  };
}

/** Only Astra's single-line month snippet has reviewed equal-height shapes. */
export function monthChunkSamples<C extends MonthChunk>(chunks: C[]) {
  const shapes = new Map<string, C>();
  const representatives = new Set<C>();
  const sample = new Map<C, C>();
  for (const chunk of chunks) {
    const { event } = chunk;
    const item = event.extendedProps?.astra;
    if (
      !item ||
      !["card_schedule", "card_event", "milestone_due"].includes(item.kind) ||
      !item.title.trim() ||
      event.title !== item.title ||
      event.allDay !== !item.event ||
      event.display !== "auto" ||
      event.styles.length ||
      event.classNames.length ||
      chunk.resource
    )
      return null;
    // Contract clocks are fixed ASCII HH:mm in tabular digits; changing the
    // value does not change the month snippet's line geometry.
    const key = JSON.stringify([
      chunk.gridRow,
      chunk.gridColumn,
      chunk.dates.length,
      item.kind,
      item.event?.start.slice(11).length,
      item.event && item.event.duration_minutes <= 30,
      event.editable,
      event.startEditable,
      event.durationEditable,
    ]);
    let representative = shapes.get(key);
    if (!representative) {
      representative = chunk;
      shapes.set(key, chunk);
      representatives.add(chunk);
    }
    sample.set(chunk, representative);
  }
  return chunks.length ? { representatives, sample } : null;
}

/** Geometry is reused only within one synchronous layout pass. */
export function measureOnce<T extends object>(read: (element: T) => number) {
  const heights = new WeakMap<T, number>();
  return (element: T): number => {
    let height = heights.get(element);
    if (height === undefined) {
      height = read(element);
      heights.set(element, height);
    }
    return height;
  };
}

/** Cell/span capacity is shared only within this synchronous layout pass. */
export function monthLayoutGeometry(
  grid: Element,
  columns: number,
  read: (element: Element) => number,
) {
  const measure = measureOnce(read);
  const days = new Map<
    number,
    { element: Element; capacities: Map<number, number> }
  >();
  function cell(chunk: Pick<MonthChunk, "gridRow" | "gridColumn">) {
    const index = (chunk.gridRow - 1) * columns + chunk.gridColumn - 1;
    let value = days.get(index);
    if (!value) {
      const element = grid.children.item(index);
      if (!element) throw new Error("Calendar layout cell is missing");
      value = { element, capacities: new Map() };
      days.set(index, value);
    }
    return value;
  }
  return {
    measure,
    dayElement: (chunk: Pick<MonthChunk, "gridRow" | "gridColumn">) =>
      cell(chunk).element,
    isHidden(
      chunk: Pick<MonthChunk, "gridRow" | "gridColumn" | "dates"> & {
        bottom: number;
      },
    ) {
      const first = cell(chunk);
      const span = chunk.dates.length;
      let capacity = first.capacities.get(span);
      if (capacity === undefined) {
        let day: Element | null = first.element;
        let footer = 0;
        for (let index = 0; index < span && day; index++) {
          if (day.lastElementChild)
            footer = Math.max(footer, measure(day.lastElementChild));
          day = day.nextElementSibling;
        }
        capacity = measure(first.element) - footer;
        first.capacities.set(span, capacity);
      }
      return chunk.bottom > capacity;
    },
  };
}

/** Native date bounds stay exclusive; read current normalized Date values. */
export function calendarEventIntersects(
  event: { start: Date; end: Date; resourceIds: readonly unknown[] },
  start: Date,
  end: Date,
  resource?: { id: unknown },
) {
  return (
    (!resource || event.resourceIds.includes(resource.id)) &&
    event.start.getTime() < end.getTime() &&
    event.end.getTime() > start.getTime()
  );
}

/** Collect one hide pass without recopying an expanding list for each event. */
export function collectHiddenChunks<K, T>(target: Map<K, T[]>) {
  const pending = new Map<K, { previous: T[]; seen: Set<T>; values?: T[] }>();
  return {
    add(key: K, chunk: T) {
      let entry = pending.get(key);
      if (!entry) {
        const previous = target.get(key) ?? [];
        entry = { previous, seen: new Set(previous) };
        pending.set(key, entry);
      }
      if (entry.seen.has(chunk)) return;
      entry.seen.add(chunk);
      (entry.values ??= entry.previous.slice()).push(chunk);
    },
    publish() {
      for (const [key, { values }] of pending)
        if (values) target.set(key, values);
      pending.clear();
    },
  };
}

/** Snippets subscribe to optional details only when they read those details. */
export function calendarContentArgs<E, T, V>(
  event: E,
  readTimeText: () => T,
  readView: () => V,
) {
  return {
    event,
    get timeText() {
      return readTimeText();
    },
    get view() {
      return readView();
    },
  };
}
