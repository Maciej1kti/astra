type Options = {
  delta: (x: number, y: number, startX: number, startY: number) => number;
  commit: (days: number) => void;
};
/** Gesture previews never write data. Only pointerup proposes a versioned edit. */
export function dateGesture(node: HTMLElement, initial: Options) {
  let options = initial,
    pointer: number | null = null,
    x = 0,
    y = 0,
    startX = 0,
    startY = 0,
    frame = 0,
    days = 0;
  let suppressClick = false;
  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }
  function cancel() {
    if (pointer !== null) suppressClick = true;
    const captured = pointer;
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    days = 0;
    node.style.transform = "";
    node.removeAttribute("data-dragging");
    if (captured !== null && node.hasPointerCapture(captured))
      node.releasePointerCapture(captured);
    if (captured !== null)
      window.dispatchEvent(new Event("planning-gesture-ended"));
  }
  function paint() {
    frame = 0;
    if (pointer === null) return;
    days = options.delta(x, y, startX, startY);
    node.style.transform = `translate(${x - startX}px, ${y - startY}px)`;
    const scroll = node.closest<HTMLElement>(".date-scroll");
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      const direction = x < rect.left + 32 ? -1 : x > rect.right - 32 ? 1 : 0;
      if (direction) {
        scroll.scrollLeft += direction * 8;
        frame = requestAnimationFrame(paint);
      }
    }
  }
  function down(event: PointerEvent) {
    if (pointer !== null || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    pointer = event.pointerId;
    x = startX = event.clientX;
    y = startY = event.clientY;
    node.setPointerCapture(pointer);
    node.setAttribute("data-dragging", "true");
    window.dispatchEvent(new Event("planning-gesture-started"));
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    const delta = options.delta(event.clientX, event.clientY, startX, startY);
    cancel();
    suppressClick = delta !== 0;
    if (delta) options.commit(delta);
  }
  function second(event: PointerEvent) {
    if (pointer !== null && event.pointerId !== pointer) cancel();
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") cancel();
  }
  node.addEventListener("click", click, true);
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("lostpointercapture", cancel);
  window.addEventListener("pointerdown", second, true);
  window.addEventListener("keydown", key);
  window.addEventListener("orientationchange", cancel);
  return {
    update(value: Options) {
      options = value;
    },
    destroy() {
      cancel();
      node.removeEventListener("click", click, true);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("pointerdown", second, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("orientationchange", cancel);
    },
  };
}
