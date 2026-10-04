type Options = {
  anchor: HTMLElement;
  align: "start" | "end";
  placement: "bottom" | "auto";
};

/** Keep every action disclosure anchored and reachable in the visible viewport. */
export function popoverPosition(panel: HTMLElement, initial: Options) {
  let options = initial;
  let frame = 0;
  const position = () => {
    frame = 0;
    const { anchor, align, placement } = options;
    if (!anchor.isConnected || !panel.isConnected) return;
    const tokens = getComputedStyle(anchor);
    const gap = parseFloat(tokens.getPropertyValue("--space-4")) || 8;
    const edge = parseFloat(tokens.getPropertyValue("--space-6")) || 12;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + edge;
    const top = (viewport?.offsetTop ?? 0) + edge;
    const right =
      (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - edge;
    const bottom =
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - edge;
    const bounds = anchor.getBoundingClientRect();

    // Restore the authored limit before measuring, including feature size caps.
    panel.style.removeProperty("max-height");
    panel.style.maxWidth = `${Math.max(0, right - left)}px`;
    const width = panel.offsetWidth;
    const height = Math.min(panel.offsetHeight, Math.max(0, bottom - top));
    const before = Math.max(0, bounds.top - gap - top);
    const after = Math.max(0, bottom - bounds.bottom - gap);
    const spaceLeft = bounds.left - gap - left;
    const spaceRight = right - bounds.right - gap;
    const beside =
      placement === "auto" &&
      Math.max(before, after) < height &&
      Math.max(spaceLeft, spaceRight) >= width;
    const above =
      !beside && placement === "auto" && after < height && before > after;
    const available = beside ? bottom - top : above ? before : after;
    const maxHeight = Math.max(0, Math.min(height, available));
    const preferredLeft = beside
      ? spaceLeft >= width
        ? bounds.left - gap - width
        : bounds.right + gap
      : align === "start"
        ? bounds.left
        : bounds.right - width;
    const preferredTop = beside
      ? bounds.top
      : above
        ? bounds.top - gap - maxHeight
        : bounds.bottom + gap;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.left = `${Math.max(left, Math.min(preferredLeft, right - width))}px`;
    panel.style.top = `${Math.max(top, Math.min(preferredTop, bottom - maxHeight))}px`;
    panel.classList.toggle("above", above);
    panel.classList.toggle("beside", beside);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(position);
  };
  panel.showPopover();
  position();
  const resize = new ResizeObserver(schedule);
  resize.observe(panel);
  resize.observe(options.anchor);
  const content = new MutationObserver(schedule);
  content.observe(panel, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  document.addEventListener("animationend", schedule);
  document.addEventListener("transitionend", schedule);
  return {
    update(next: Options) {
      if (next.anchor !== options.anchor) {
        resize.unobserve(options.anchor);
        resize.observe(next.anchor);
      }
      options = next;
      schedule();
    },
    destroy() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("animationend", schedule);
      document.removeEventListener("transitionend", schedule);
      // Svelte removes the native popover after its inert exit completes.
    },
  };
}
