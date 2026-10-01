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
