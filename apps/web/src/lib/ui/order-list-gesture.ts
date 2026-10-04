import {
  cloneReorderPreview,
  insideReorderBounds,
  positionReorderOverlay,
  reorderGesture,
  reorderInsertionIndex,
  reorderKeyIndex,
  reorderScrollDelta,
  sameReorderOrder,
  type ReorderGestureOptions,
  type ReorderPointer,
} from "./reorder-gesture.ts";

type Options<Key extends string> = {
  order: () => Key[];
  label: (key: Key) => string;
  disabled: () => boolean;
  commit: (order: Key[], key: Key) => void;
  announce: (message: string) => void;
  cancellationMessage: string;
  rowAttribute?: string;
  handleAttribute?: string;
};
type Snapshot<Key extends string> = {
  key: Key;
  order: Key[];
  handle: HTMLButtonElement;
  row: HTMLElement;
  offsetY: number;
};

function moveKey<Key extends string>(order: Key[], key: Key, index: number) {
  const next = [...order];
  next.splice(next.indexOf(key), 1);
  next.splice(index, 0, key);
  return next;
}

/** Reorder identified rows; the caller retains persistence and visibility rules. */
export function orderListGesture<Key extends string>(
  list: HTMLElement,
  initial: Options<Key>,
) {
  let options = initial;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  const panel =
    list.closest<HTMLElement>(".action-menu-panel") ??
    list.closest<HTMLElement>("dialog") ??
    list;

  function destination(pointer: ReorderPointer<Snapshot<Key>>) {
    const bounds = panel.getBoundingClientRect();
    if (!insideReorderBounds(pointer.x, pointer.y, bounds)) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-order-item]"),
    ].filter((row) => row !== pointer.snapshot.row);
    const rects = rows.map((row) => row.getBoundingClientRect());
    const index = reorderInsertionIndex(pointer.y, rects);
    const rect =
      rects[Math.min(index, rects.length - 1)] ??
      pointer.snapshot.row.getBoundingClientRect();
    if (indicator) {
      indicator.hidden = false;
      positionReorderOverlay(
        indicator,
        rect.left,
        Math.max(
          bounds.top,
          Math.min(
            bounds.bottom - 2,
            index === rows.length ? rect.bottom : rect.top,
          ),
        ),
        rect.width,
      );
    }
    return index;
  }

  function gestureOptions(): ReorderGestureOptions<Snapshot<Key>> {
    return {
      disabled: () => options.disabled(),
      capture(event) {
        const handle = (event.target as Element).closest<HTMLButtonElement>(
          "[data-order-handle]",
        );
        const row = handle?.closest<HTMLElement>("[data-order-item]");
        const key = row?.dataset.orderItem as Key | undefined;
        if (!handle || !row || !key || !options.order().includes(key))
          return null;
        handle.focus({ preventScroll: true });
        return {
          key,
          order: [...options.order()],
          handle,
          row,
          offsetY: event.clientY - row.getBoundingClientRect().top,
        };
      },
      valid: (snapshot) => sameReorderOrder(snapshot.order, options.order()),
      start({ snapshot }) {
        const rect = snapshot.row.getBoundingClientRect();
        snapshot.row.setAttribute("data-dragging", "true");
        snapshot.handle.setAttribute("aria-pressed", "true");
        preview = document.createElement("ol");
        // Preserve the component's scoped row styles in the inert clone.
        preview.className = `${list.className} layout-drag-preview`;
        preview.append(
          cloneReorderPreview(snapshot.row, [
            "data-order-item",
            "data-order-handle",
            ...(options.rowAttribute ? [options.rowAttribute] : []),
            ...(options.handleAttribute ? [options.handleAttribute] : []),
          ]),
        );
        preview.inert = true;
        preview.setAttribute("aria-hidden", "true");
        preview.style.width = `${rect.width}px`;
        preview.style.left = `${rect.left}px`;
        indicator = document.createElement("div");
        indicator.className = "layout-drop-indicator";
        indicator.setAttribute("aria-hidden", "true");
        // Native popovers/dialogs own their preview so it remains in the top layer.
        (panel.matches(":popover-open")
          ? panel
          : (list.closest("dialog") ?? panel)
        ).append(preview, indicator);
        options.announce(`${options.label(snapshot.key)} picked up.`);
      },
      paint(pointer) {
        if (!preview) return;
        const bounds = panel.getBoundingClientRect();
        const rect = pointer.snapshot.row.getBoundingClientRect();
        positionReorderOverlay(
          preview,
          rect.left,
          Math.max(
            bounds.top,
            Math.min(
              bounds.bottom - preview.offsetHeight,
              pointer.y - pointer.snapshot.offsetY,
            ),
          ),
          rect.width,
        );
        if (pointer.x >= bounds.left && pointer.x <= bounds.right)
          panel.scrollTop += reorderScrollDelta(pointer.y, bounds);
        destination(pointer);
      },
      drop(pointer) {
        const index = destination(pointer);
        const { order, key } = pointer.snapshot;
        if (index === null || index === order.indexOf(key)) return;
        const next = moveKey(order, key, index);
        return () => options.commit(next, key);
      },
      release({ snapshot }) {
        preview?.remove();
        indicator?.remove();
        preview = indicator = null;
        snapshot.row.removeAttribute("data-dragging");
        snapshot.handle.setAttribute("aria-pressed", "false");
      },
      cancelled({ snapshot, dragging }) {
        snapshot.handle.focus({ preventScroll: true });
        if (dragging) options.announce(options.cancellationMessage);
      },
      keydown(event) {
        const handle = (event.target as Element).closest<HTMLButtonElement>(
          "[data-order-handle]",
        );
        if (!handle || options.disabled()) return;
        const key = handle.dataset.orderHandle as Key;
        const order = options.order();
        const current = order.indexOf(key);
        const index = reorderKeyIndex(event.key, current, order.length);
        if (index === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (index !== current) options.commit(moveKey(order, key, index), key);
      },
    };
  }

  const gesture = reorderGesture(list, gestureOptions());
  return {
    update(next: Options<Key>) {
      options = next;
      gesture.update(gestureOptions());
    },
    destroy: gesture.destroy,
  };
}
