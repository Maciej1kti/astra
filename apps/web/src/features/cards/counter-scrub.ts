import { clampCounter } from "./focus-counter-controller.ts";

type Options = {
  value: number;
  step: number;
  disabled: boolean;
  preview: (value: number | null) => void;
  commit: (value: number) => void;
};
type Gesture = {
  id: number;
  x: number;
  y: number;
  active: boolean;
  value: number;
  original: Options;
};

/** Horizontal intent only; vertical touch movement belongs to the page. No writes. */
export function counterScrub(node: HTMLElement, options: Options) {
  let gesture: Gesture | null = null;
  let suppressClick = false;
  const cancel = () => {
    const current = gesture;
    gesture = null;
    if (!current) return;
    current.original.preview(null);
    delete node.dataset.scrubbing;
    if (node.hasPointerCapture(current.id))
      node.releasePointerCapture(current.id);
  };
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || options.disabled) return;
    suppressClick = false;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      value: options.value,
      original: options,
    };
  };
  const move = (event: PointerEvent) => {
    const current = gesture;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        cancel();
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
      current.active = true;
      suppressClick = true;
      node.setPointerCapture(current.id);
      node.dataset.scrubbing = "true";
    }
    event.preventDefault();
    current.value = clampCounter(
      current.original.value + Math.trunc(dx / 12) * current.original.step,
    );
    current.original.preview(current.value);
  };
  const up = (event: PointerEvent) => {
    const current = gesture;
    if (!current || current.id !== event.pointerId) return;
    cancel();
    if (current.active && current.value !== current.original.value)
      current.original.commit(current.value);
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape" && gesture) {
      cancel();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      document.activeElement !== node ||
      options.disabled ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const direction = ["ArrowUp", "ArrowRight"].includes(event.key)
      ? 1
      : ["ArrowDown", "ArrowLeft"].includes(event.key)
        ? -1
        : 0;
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    options.commit(clampCounter(options.value + direction * options.step));
  };
  const secondPointer = (event: PointerEvent) => {
    if (gesture && gesture.id !== event.pointerId) cancel();
  };
  const lostCapture = (event: PointerEvent) => {
    // Touch starts with implicit capture on the tapped child. Its transfer to
    // this button bubbles a lost event; only losing our own capture cancels.
    if (event.target === node && gesture?.id === event.pointerId) cancel();
  };
  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("lostpointercapture", lostCapture);
  window.addEventListener("pointerdown", secondPointer);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
  window.addEventListener("blur", cancel);
  window.addEventListener("session-ended", cancel);
  return {
    update(next: Options) {
      options = next;
      if (next.disabled) cancel();
    },
    destroy() {
      cancel();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("pointerdown", secondPointer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("session-ended", cancel);
    },
  };
}
