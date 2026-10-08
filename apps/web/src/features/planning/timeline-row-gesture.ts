import {
  insideReorderBounds,
  positionReorderOverlay,
  reorderGesture,
  reorderKeyIndex,
  sameReorderOrder,
  type ReorderGestureOptions,
  type ReorderPointer,
} from "../../lib/ui/reorder-gesture.ts";

type Options = {
  id: string;
  order: () => string[];
  disabled: () => boolean;
  active: (value: boolean) => void;
  commit: (id: string, destination: number) => void;
};
type Snapshot = {
  id: string;
  index: number;
  order: string[];
  row: HTMLElement;
};

/** Timeline row geometry stays here; cancellation and snapshots are shared. */
export function timelineRowGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;

  function destination(pointer: ReorderPointer<Snapshot>) {
    const bounds = node.closest(".astra-gantt")?.getBoundingClientRect();
    if (!bounds || !insideReorderBounds(pointer.x, pointer.y, bounds)) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const rect = pointer.snapshot.row.getBoundingClientRect();
    if (!rect.height) return null;
    const index = Math.max(
      0,
      Math.min(
        pointer.snapshot.order.length - 1,
        pointer.snapshot.index +
          Math.round((pointer.y - pointer.startY) / rect.height),
      ),
    );
    if (indicator) {
      indicator.hidden = false;
      // The line crosses the whole visible chart, not only the title column.
      positionReorderOverlay(
        indicator,
        bounds.left,
        rect.top +
          (index - pointer.snapshot.index) * rect.height +
          (index > pointer.snapshot.index ? rect.height : 0),
        bounds.width,
      );
    }
    return index;
  }

  function gestureOptions(): ReorderGestureOptions<Snapshot> {
    return {
      disabled: () => options.disabled(),
      active: (value) => options.active(value),
      capture(event) {
        const order = options.order();
        const index = order.indexOf(options.id);
        if (index < 0) return null;
        event.stopPropagation();
        node.focus({ preventScroll: true });
        return {
          id: options.id,
          index,
          order: [...order],
          row: node.closest<HTMLElement>("[data-timeline-row]") ?? node,
        };
      },
      valid: (snapshot) =>
        snapshot.id === options.id &&
        sameReorderOrder(snapshot.order, options.order()),
      start({ snapshot }) {
        const bounds = snapshot.row.getBoundingClientRect();
        preview = document.createElement("div");
        preview.textContent = snapshot.row.textContent;
        preview.setAttribute("aria-hidden", "true");
        preview.inert = true;
        Object.assign(preview.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: "var(--layer-drag-preview)",
          display: "flex",
          alignItems: "center",
          height: `${bounds.height}px`,
          padding: "0 var(--space-8)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          fontSize: "var(--text-base)",
          background: "var(--paper)",
          border: "var(--stroke) solid var(--line)",
          borderRadius: "var(--radius-control)",
          boxShadow: "var(--shadow-floating)",
          width: `${bounds.width}px`,
          left: `${bounds.left}px`,
        });
        indicator = document.createElement("div");
        indicator.setAttribute("aria-hidden", "true");
        Object.assign(indicator.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: "var(--layer-drag-indicator)",
          height: "var(--space-2)",
          background: "var(--accent-ink)",
          width: `${bounds.width}px`,
          left: `${bounds.left}px`,
        });
        document.body.append(preview, indicator);
        node.setAttribute("data-dragging", "true");
        node.setAttribute("aria-pressed", "true");
      },
      paint(pointer) {
        if (preview) {
          const rect = pointer.snapshot.row.getBoundingClientRect();
          positionReorderOverlay(
            preview,
            rect.left,
            pointer.y - rect.height / 2,
            rect.width,
          );
        }
        destination(pointer);
      },
      drop(pointer) {
        const index = destination(pointer);
        if (index === null || index === pointer.snapshot.index) return;
        return () => options.commit(pointer.snapshot.id, index);
      },
      release() {
        preview?.remove();
        indicator?.remove();
        preview = indicator = null;
        node.removeAttribute("data-dragging");
        node.setAttribute("aria-pressed", "false");
      },
      keydown(event) {
        if (!event.altKey || options.disabled()) return;
        const order = options.order();
        const current = order.indexOf(options.id);
        const index = reorderKeyIndex(event.key, current, order.length);
        if (index === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (index !== current) options.commit(options.id, index);
      },
    };
  }
  const gesture = reorderGesture(node, gestureOptions());
  return {
    update(next: Options) {
      options = next;
      gesture.update(gestureOptions());
    },
    destroy: gesture.destroy,
  };
}
