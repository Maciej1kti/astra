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
