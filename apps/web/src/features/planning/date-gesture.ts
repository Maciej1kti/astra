import { gestureCancellation } from "../../lib/ui/gesture-cancellation.ts";

type Options = {
  delta: (x: number, y: number, startX: number, startY: number) => number;
  commit: (days: number) => void;
  active: (value: boolean) => void;
  operation?: "move" | "start" | "end";
};
/** Gesture previews never write data. Only pointerup proposes a versioned edit. */
export function dateGesture(node: HTMLElement, initial: Options) {
  let options = initial,
    captured: Options | null = null,
    pointer: number | null = null,
    x = 0,
    startX = 0,
    startY = 0,
    frame = 0;
  let suppressClick = false;
  let previewNode = node,
    scroll: HTMLElement | null = null,
    scrollStart = 0;
  let originalTransform = "",
    originalWidth = "",
    width = 0;
  const travel = () => (scroll?.scrollLeft ?? 0) - scrollStart;

  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }
  function cancel() {
    if (pointer !== null) suppressClick = true;
    const pointerId = pointer;
    const intent = captured;
    pointer = null;
    captured = null;
    cancelAnimationFrame(frame);
    frame = 0;
    previewNode.style.transform = originalTransform;
    previewNode.style.width = originalWidth;
    node.removeAttribute("data-dragging");
    if (pointerId !== null && node.hasPointerCapture(pointerId))
      node.releasePointerCapture(pointerId);
    if (pointerId !== null) intent?.active(false);
  }
  function paint() {
    frame = 0;
    if (pointer === null) return;
    const dx = x - startX + travel();
    if (captured?.operation === "end")
      previewNode.style.width = `${Math.max(1, width + dx)}px`;
    else if (captured?.operation === "start") {
      previewNode.style.transform = `translateX(${Math.min(dx, width - 1)}px)`;
      previewNode.style.width = `${Math.max(1, width - dx)}px`;
    } else previewNode.style.transform = `translateX(${dx}px)`;
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
    if (
      pointer !== null ||
      !event.isPrimary ||
      event.button !== 0 ||
      node.matches(":disabled")
    )
      return;
    captured = options;
    suppressClick = false;
    previewNode = node.closest<HTMLElement>(".wx-bar") ?? node;
    originalTransform = previewNode.style.transform;
    originalWidth = previewNode.style.width;
    width = previewNode.getBoundingClientRect().width;
    scroll = node.closest<HTMLElement>(".wx-chart, .date-scroll");
    scrollStart = scroll?.scrollLeft ?? 0;
    pointer = event.pointerId;
    x = startX = event.clientX;
    startY = event.clientY;
    node.setPointerCapture(pointer);
    node.setAttribute("data-dragging", "true");
    captured.active(true);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    x = event.clientX;
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    const intent = captured;
    if (!intent || node.matches(":disabled")) return cancel();
    const delta = intent.delta(
      event.clientX + travel(),
      event.clientY,
      startX,
      startY,
    );
    cancel();
    suppressClick = delta !== 0;
    if (delta) intent.commit(delta);
  }
  node.addEventListener("click", click, true);
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  const cancelGestures = gestureCancellation(node, {
    pointer: () => pointer,
    cancel,
  });
  return {
    update(value: Options) {
      options = value;
      if (node.matches(":disabled")) cancel();
    },
    destroy() {
      cancel();
      node.removeEventListener("click", click, true);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      cancelGestures();
    },
  };
}
