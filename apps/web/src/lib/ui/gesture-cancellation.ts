type Options = {
  pointer: () => number | null;
  active?: () => boolean;
  cancel: (event?: Event) => void;
};

/** One cancellation policy for pointer previews, including native widget adapters. */
export function gestureCancellation(node: HTMLElement, options: Options) {
  const active = () => options.active?.() ?? options.pointer() !== null;
  function lost(event: PointerEvent) {
    if (
      event.pointerId === options.pointer() &&
      (event.type !== "lostpointercapture" || event.target === node)
    )
      options.cancel(event);
  }
  function second(event: PointerEvent) {
    if (active() && event.pointerId !== options.pointer())
      options.cancel(event);
  }
  function key(event: KeyboardEvent) {
    if (!active() || (event.key !== "Escape" && event.key !== "Tab")) return;
    options.cancel(event);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  function cancel(event: Event) {
    if (active()) options.cancel(event);
  }
  node.addEventListener("lostpointercapture", lost);
  window.addEventListener("pointercancel", lost);
  window.addEventListener("pointerdown", second, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("orientationchange", cancel);
  window.addEventListener("session-ended", cancel);
  return () => {
    node.removeEventListener("lostpointercapture", lost);
    window.removeEventListener("pointercancel", lost);
    window.removeEventListener("pointerdown", second, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("orientationchange", cancel);
    window.removeEventListener("session-ended", cancel);
  };
}
