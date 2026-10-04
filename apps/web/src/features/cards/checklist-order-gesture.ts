import {
  cloneReorderPreview,
  insideReorderBounds,
  positionReorderOverlay,
  reorderGesture,
  reorderInsertionIndex,
  reorderScrollDelta,
  sameReorderOrder,
  type ReorderGestureOptions,
  type ReorderPointer,
} from "../../lib/ui/reorder-gesture.ts";
import type { AcceptanceItem } from "./card-work";

type Options = {
  items: () => AcceptanceItem[];
  disabled: () => boolean;
  pickedUp: (id: string) => void;
  released: () => void;
  commit: (order: string[], id: string) => void;
  announce: (message: string) => void;
};
type Snapshot = {
  id: string;
  order: string[];
  row: HTMLElement;
  handle: HTMLButtonElement;
  offsetY: number;
  scroll: HTMLElement | null;
};

function scrollContainer(list: HTMLElement) {
  let parent = list.parentElement;
  while (parent) {
    if (["auto", "scroll"].includes(getComputedStyle(parent).overflowY))
      return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** Checklist edits are retained by identity; only the completed drop changes order. */
export function checklistOrderGesture(list: HTMLElement, initial: Options) {
  let options = initial;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;

  function destination(pointer: ReorderPointer<Snapshot>) {
    const bounds = list.getBoundingClientRect();
    const viewport = pointer.snapshot.scroll?.getBoundingClientRect();
    if (
      !insideReorderBounds(pointer.x, pointer.y, bounds) ||
      (viewport && !insideReorderBounds(pointer.x, pointer.y, viewport))
    ) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-checklist-item]"),
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
        index === rows.length ? rect.bottom : rect.top,
        rect.width,
      );
    }
    return index;
  }

  function gestureOptions(): ReorderGestureOptions<Snapshot> {
    return {
      disabled: () => options.disabled(),
      capture(event) {
        const handle = (event.target as Element).closest<HTMLButtonElement>(
          "[data-checklist-handle]",
        );
        const row = handle?.closest<HTMLElement>("[data-checklist-item]");
        const id = row?.dataset.checklistItem;
        const order = options.items().map((item) => item.id);
        if (!handle || !row || !id || !order.includes(id)) return null;
        handle.focus({ preventScroll: true });
        options.pickedUp(id);
        return {
          id,
          order,
          row,
          handle,
          offsetY: event.clientY - row.getBoundingClientRect().top,
          scroll: scrollContainer(list),
        };
      },
      valid: (snapshot) =>
        sameReorderOrder(
          snapshot.order,
          options.items().map((item) => item.id),
        ),
      start({ snapshot }) {
        const rect = snapshot.row.getBoundingClientRect();
        const section = list.closest<HTMLElement>(".checklist")!;
        preview = section.cloneNode(false) as HTMLElement;
        preview.setAttribute("data-checklist-drag-preview", "");
        preview.setAttribute("aria-hidden", "true");
        preview.inert = true;
        const copy = cloneReorderPreview(snapshot.row, [
          "data-checklist-item",
          "data-checklist-handle",
        ]);
        copy.classList.remove("dragging");
        const contents = list.cloneNode(false) as HTMLElement;
        contents.append(copy);
        preview.append(contents);
        Object.assign(preview.style, {
          position: "fixed",
          pointerEvents: "none",
          margin: "0",
          zIndex: "var(--layer-drag-preview)",
          width: `${rect.width}px`,
          left: `${rect.left}px`,
          background: "var(--paper)",
          boxShadow: "var(--shadow-floating)",
          borderRadius: "var(--radius-control)",
        });
        indicator = document.createElement("div");
        indicator.setAttribute("data-checklist-drop-indicator", "");
        indicator.setAttribute("aria-hidden", "true");
        Object.assign(indicator.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: "var(--layer-drag-indicator)",
          height: "var(--space-2)",
          background: "var(--accent-ink)",
          borderRadius: "var(--radius-sm)",
        });
        (list.closest("dialog") ?? document.body).append(preview, indicator);
        snapshot.handle.setAttribute("aria-pressed", "true");
        options.announce(
          `Picked up checklist item ${snapshot.order.indexOf(snapshot.id) + 1}.`,
        );
      },
      paint(pointer) {
        if (preview) {
          const rect = pointer.snapshot.row.getBoundingClientRect();
          positionReorderOverlay(
            preview,
            rect.left,
            pointer.y - pointer.snapshot.offsetY,
            rect.width,
          );
        }
        const scroll = pointer.snapshot.scroll;
        const bounds = scroll?.getBoundingClientRect();
        if (
          scroll &&
          bounds &&
          pointer.x >= bounds.left &&
          pointer.x <= bounds.right
        )
          scroll.scrollTop += reorderScrollDelta(pointer.y, bounds);
        destination(pointer);
      },
      drop(pointer) {
        const index = destination(pointer);
        const { order, id } = pointer.snapshot;
        if (index === null || index === order.indexOf(id)) return;
        const next = order.filter((value) => value !== id);
        next.splice(index, 0, id);
        return () => options.commit(next, id);
      },
      release({ snapshot }) {
        preview?.remove();
        indicator?.remove();
        preview = indicator = null;
        snapshot.handle.setAttribute("aria-pressed", "false");
        options.released();
      },
      cancelled({ dragging }) {
        if (dragging) options.announce("Checklist item order restored.");
      },
    };
  }
  const gesture = reorderGesture(list, gestureOptions());
  return {
    update(next: Options) {
      options = next;
      gesture.update(gestureOptions());
    },
    destroy: gesture.destroy,
  };
}
