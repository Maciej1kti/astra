type Options = {
  id: string;
  order: () => string[];
  disabled: () => boolean;
  active: (value: boolean) => void;
  commit: (id: string, destination: number) => void;
};

/** A row drag owns a temporary preview and commits only on an uncancelled drop. */
export function timelineRowGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let drag: {
    pointer: number;
    y: number;
    index: number;
    order: string[];
  } | null = null;
  let preview: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let destination = -1;
  let suppressClick = false;
  function release() {
    const previous = drag;
    drag = null;
    preview?.remove();
    indicator?.remove();
    preview = indicator = null;
    node.removeAttribute("data-dragging");
    if (previous && node.hasPointerCapture(previous.pointer))
      node.releasePointerCapture(previous.pointer);
    if (previous) options.active(false);
    return previous;
  }
  function down(event: PointerEvent) {
    if (drag || event.button !== 0 || !event.isPrimary || options.disabled())
      return;
    const order = options.order();
    const index = order.indexOf(options.id);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    drag = {
      pointer: event.pointerId,
      y: event.clientY,
      index,
      order: [...order],
    };
    destination = index;
    suppressClick = false;
    node.setPointerCapture(event.pointerId);
    options.active(true);
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (
      options.disabled() ||
      !drag.order.every((id, i) => options.order()[i] === id)
    ) {
      release();
      return;
    }
    if (Math.abs(event.clientY - drag.y) < 5 && !preview) return;
    event.preventDefault();
    const source = node.closest<HTMLElement>(".wx-row") ?? node;
    const bounds = source.getBoundingClientRect();
    if (!preview) {
      preview = document.createElement("div");
      preview.textContent = source.textContent;
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      Object.assign(preview.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "10000",
        padding: "var(--space-6)",
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
        zIndex: "10001",
        height: "2px",
        background: "var(--accent-ink)",
        width: `${bounds.width}px`,
        left: `${bounds.left}px`,
      });
      document.body.append(preview, indicator);
      node.setAttribute("data-dragging", "true");
      suppressClick = true;
    }
    destination = Math.max(
      0,
      Math.min(
        drag.order.length - 1,
        drag.index + Math.round((event.clientY - drag.y) / bounds.height),
      ),
    );
    preview.style.top = `${event.clientY - bounds.height / 2}px`;
    indicator!.style.top = `${bounds.top + (destination - drag.index) * bounds.height + (destination > drag.index ? bounds.height : 0)}px`;
  }
  function up(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const bounds = node.closest(".astra-gantt")?.getBoundingClientRect();
    const inside =
      bounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    const target = destination;
    const moved = !!preview;
    const previous = release();
    if (inside && moved && previous && target !== previous.index)
      options.commit(options.id, target);
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") release();
  }
  function second(event: PointerEvent) {
    if (drag && drag.pointer !== event.pointerId) release();
  }
  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }
  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("lostpointercapture", release);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", release);
  window.addEventListener("pointerdown", second, true);
  window.addEventListener("keydown", key);
  window.addEventListener("blur", release);
  window.addEventListener("session-ended", release);
  return {
    update(next: Options) {
      if (next.id !== options.id) release();
      options = next;
    },
    destroy() {
      release();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("lostpointercapture", release);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointerdown", second, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", release);
      window.removeEventListener("session-ended", release);
    },
  };
}
