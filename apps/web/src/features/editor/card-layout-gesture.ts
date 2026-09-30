import {
  cardSections,
  moveCardSectionTo,
  type CardLayout,
  type CardSection,
} from "./card-layout";

type Options = {
  order: () => CardLayout;
  disabled: () => boolean;
  commit: (order: CardLayout, section: CardSection) => void;
  announce: (message: string) => void;
};

/** Like Focus, dragging previews an insertion; only a completed drop saves it. */
export function cardLayoutGesture(list: HTMLElement, initial: Options) {
  let options = initial;
  let drag: {
    pointer: number;
    section: CardSection;
    order: CardLayout;
    handle: HTMLButtonElement;
    row: HTMLElement;
    startX: number;
    startY: number;
    offsetY: number;
    x: number;
    y: number;
  } | null = null;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let frame = 0;
  let suppressClick = false;
  const panel = list.closest<HTMLElement>(".action-menu-panel")!;

  function release() {
    const previous = drag;
    drag = null;
    cancelAnimationFrame(frame);
    frame = 0;
    preview?.remove();
    indicator?.remove();
    preview = indicator = null;
    previous?.row.removeAttribute("data-dragging");
    previous?.handle.setAttribute("aria-pressed", "false");
    if (previous && list.hasPointerCapture(previous.pointer))
      list.releasePointerCapture(previous.pointer);
    return previous;
  }

  function cancel() {
    if (!drag) return;
    suppressClick = !!preview;
    const previous = release();
    previous?.handle.focus({ preventScroll: true });
    options.announce("Section order unchanged.");
  }

  function valid() {
    return (
      drag &&
      !options.disabled() &&
      drag.order.every((section, index) => options.order()[index] === section)
    );
  }

  function destination() {
    if (!drag) return null;
    const bounds = panel.getBoundingClientRect();
    if (
      drag.x < bounds.left ||
      drag.x > bounds.right ||
      drag.y < bounds.top ||
      drag.y > bounds.bottom
    ) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const rows = [
      ...list.querySelectorAll<HTMLElement>("[data-layout-section]"),
    ].filter((row) => row !== drag!.row);
    let index = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return drag!.y < rect.top + rect.height / 2;
    });
    if (index === -1) index = rows.length;
    const rect = rows[Math.min(index, rows.length - 1)].getBoundingClientRect();
    if (indicator) {
      indicator.hidden = false;
      indicator.style.top = `${Math.max(bounds.top, Math.min(bounds.bottom - 2, index === rows.length ? rect.bottom : rect.top))}px`;
      indicator.style.left = `${rect.left}px`;
      indicator.style.width = `${rect.width}px`;
    }
    return index;
  }

  function startPreview() {
    if (!drag) return;
    const rect = drag.row.getBoundingClientRect();
    drag.offsetY = drag.startY - rect.top;
    drag.row.setAttribute("data-dragging", "true");
    drag.handle.setAttribute("aria-pressed", "true");
    preview = document.createElement("ol");
    preview.className = "layout-order layout-drag-preview";
    const copy = drag.row.cloneNode(true) as HTMLElement;
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
      element.removeAttribute("id");
      element.removeAttribute("data-layout-section");
      element.removeAttribute("data-layout-handle");
      element.removeAttribute("data-dragging");
    }
    preview.append(copy);
    preview.inert = true;
    preview.setAttribute("aria-hidden", "true");
    preview.style.width = `${rect.width}px`;
    preview.style.left = `${rect.left}px`;
    indicator = document.createElement("div");
    indicator.className = "layout-drop-indicator";
    indicator.setAttribute("aria-hidden", "true");
    // A native popover/modal is in the top layer; keep the preview in that layer.
    (panel.matches(":popover-open")
      ? panel
      : (list.closest("dialog") ?? panel)
    ).append(preview, indicator);
    suppressClick = true;
    options.announce(`${cardSections[drag.section]} picked up.`);
  }

  function paint() {
    frame = 0;
    if (!valid()) return cancel();
    if (!drag || !preview) return;
    const bounds = panel.getBoundingClientRect();
    preview.style.top = `${Math.max(bounds.top, Math.min(bounds.bottom - preview.offsetHeight, drag.y - drag.offsetY))}px`;
    if (drag.x >= bounds.left && drag.x <= bounds.right) {
      const edge = Math.min(36, bounds.height / 4);
      if (drag.y < bounds.top + edge) panel.scrollTop -= 6;
      else if (drag.y > bounds.bottom - edge) panel.scrollTop += 6;
    }
    destination();
    frame = requestAnimationFrame(paint);
  }

  function down(event: PointerEvent) {
    if (drag || !event.isPrimary || event.button !== 0 || options.disabled())
      return;
    suppressClick = false;
    const handle = (event.target as Element).closest<HTMLButtonElement>(
      "[data-layout-handle]",
    );
    const row = handle?.closest<HTMLElement>("[data-layout-section]");
    const section = row?.dataset.layoutSection as CardSection | undefined;
    if (!handle || !row || !section || !options.order().includes(section))
      return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = {
      pointer: event.pointerId,
      section,
      order: [...options.order()],
      handle,
      row,
      startX: event.clientX,
      startY: event.clientY,
      offsetY: 0,
      x: event.clientX,
      y: event.clientY,
    };
    list.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!valid()) return cancel();
    event.preventDefault();
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!preview && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5)
      startPreview();
    if (preview && !frame) frame = requestAnimationFrame(paint);
  }

  function up(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!valid()) return cancel();
    drag.x = event.clientX;
    drag.y = event.clientY;
    const index = preview ? destination() : null;
    const previous = release()!;
    if (index === null || index === previous.order.indexOf(previous.section))
      return;
    options.commit(
      moveCardSectionTo(previous.order, previous.section, index),
      previous.section,
    );
  }

  function keydown(event: KeyboardEvent) {
    if (drag && (event.key === "Escape" || event.key === "Tab")) {
      cancel();
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const handle = (event.target as Element).closest<HTMLButtonElement>(
      "[data-layout-handle]",
    );
    if (!handle || !list.contains(handle) || options.disabled()) return;
    const section = handle.dataset.layoutHandle as CardSection;
    const order = options.order();
    const current = order.indexOf(section);
    const index =
      event.key === "ArrowUp"
        ? current - 1
        : event.key === "ArrowDown"
          ? current + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? order.length - 1
              : null;
    if (index === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (index >= 0 && index < order.length && index !== current)
      options.commit(moveCardSectionTo(order, section, index), section);
  }

  function secondPointer(event: PointerEvent) {
    if (drag && event.pointerId !== drag.pointer) cancel();
  }
  function lost(event: PointerEvent) {
    if (event.pointerId === drag?.pointer) cancel();
  }
  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  list.addEventListener("pointerdown", down);
  list.addEventListener("click", click, true);
  list.addEventListener("lostpointercapture", lost);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", lost);
  window.addEventListener("pointerdown", secondPointer, true);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("orientationchange", cancel);
  window.addEventListener("session-ended", cancel);

  return {
    update(next: Options) {
      options = next;
      if (drag && !valid()) cancel();
    },
    destroy() {
      release();
      list.removeEventListener("pointerdown", down);
      list.removeEventListener("click", click, true);
      list.removeEventListener("lostpointercapture", lost);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", lost);
      window.removeEventListener("pointerdown", secondPointer, true);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("session-ended", cancel);
    },
  };
}
