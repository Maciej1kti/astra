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
} from "../../lib/ui/reorder-gesture.ts";
import {
  cardSections,
  moveCardSectionTo,
  type CardLayout,
  type CardSection,
} from "./card-layout.ts";

type Options = {
  order: () => CardLayout;
  disabled: () => boolean;
  commit: (order: CardLayout, section: CardSection) => void;
  announce: (message: string) => void;
};
type Snapshot = {
  section: CardSection;
  order: CardLayout;
  handle: HTMLButtonElement;
  row: HTMLElement;
  offsetY: number;
};

/** Section identity and browser preferences stay with the editor adapter. */
export function cardLayoutGesture(list: HTMLElement, initial: Options) {
  let options = initial;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  const panel = list.closest<HTMLElement>(".action-menu-panel")!;

  function destination(pointer: ReorderPointer<Snapshot>) {
    const bounds = panel.getBoundingClientRect();
    if (!insideReorderBounds(pointer.x, pointer.y, bounds)) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-layout-section]"),
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

  function gestureOptions(): ReorderGestureOptions<Snapshot> {
    return {
      disabled: () => options.disabled(),
      capture(event) {
        const handle = (event.target as Element).closest<HTMLButtonElement>(
          "[data-layout-handle]",
        );
        const row = handle?.closest<HTMLElement>("[data-layout-section]");
        const section = row?.dataset.layoutSection as CardSection | undefined;
        if (!handle || !row || !section || !options.order().includes(section))
          return null;
        handle.focus({ preventScroll: true });
        return {
          section,
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
        preview.className = "layout-order layout-drag-preview";
        preview.append(
          cloneReorderPreview(snapshot.row, [
            "data-layout-section",
            "data-layout-handle",
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
        options.announce(`${cardSections[snapshot.section]} picked up.`);
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
        const { order, section } = pointer.snapshot;
        if (index === null || index === order.indexOf(section)) return;
        const next = moveCardSectionTo(order, section, index);
        return () => options.commit(next, section);
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
        if (dragging) options.announce("Section order unchanged.");
      },
      keydown(event) {
        const handle = (event.target as Element).closest<HTMLButtonElement>(
          "[data-layout-handle]",
        );
        if (!handle || options.disabled()) return;
        const section = handle.dataset.layoutHandle as CardSection;
        const order = options.order();
        const current = order.indexOf(section);
        const index = reorderKeyIndex(event.key, current, order.length);
        if (index === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (index !== current)
          options.commit(moveCardSectionTo(order, section, index), section);
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
