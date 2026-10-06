/** Shared, interruptible motion. Visual effects never own application state. */
const preference = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const active = new Set<Animation>();

export function motionDuration(node: Element, token: string, fallback: number) {
  if (preference().matches) return 0;
  const value = getComputedStyle(node).getPropertyValue(token).trim();
  return (
    (parseFloat(value) || fallback) *
    (value.endsWith("ms") ? 1 : value.endsWith("s") ? 1000 : 1)
  );
}

function play(
  node: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  if (preference().matches) return;
  const animation = node.animate(frames, options);
  active.add(animation);
  const release = () => active.delete(animation);
  animation.addEventListener("finish", release, { once: true });
  animation.addEventListener("cancel", release, { once: true });
  return animation;
}

/** One preference listener for our WAAPI effects, including changes mid-flight. */
export function motionEnvironment() {
  const media = preference();
  const settle = () => {
    if (!media.matches) return;
    for (const animation of active) animation.cancel();
    // Svelte owns outro/FLIP completion; finish those rather than abandoning it.
    for (const animation of document.getAnimations()) {
      if (
        animation.playbackRate &&
        animation.effect?.getTiming().iterations !== Infinity
      )
        animation.finish();
    }
  };
  media.addEventListener("change", settle);
  return () => {
    media.removeEventListener("change", settle);
    for (const animation of active) animation.cancel();
  };
}

/** Move one shared selection surface across both sidebar and mobile dock. */
type NavigationSelection = string | { selected: string; layout: string };
export function navigationMotion(
  node: HTMLElement,
  value: NavigationSelection,
) {
  let selected = typeof value === "string" ? value : value.selected;
  const indicator = document.createElement("span");
  indicator.className = "navigation-indicator";
  indicator.setAttribute("aria-hidden", "true");
  node.prepend(indicator);
  node.dataset.motionNavigation = "";
  let previous:
    { left: number; top: number; width: number; height: number } | undefined;
  let animation: Animation | undefined;
  let frame = 0;
  const position = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const button = Array.from(
        node.querySelectorAll<HTMLButtonElement>("button[data-view]"),
      ).find((item) => item.dataset.view === selected);
      if (!button) return;
      const bounds = node.getBoundingClientRect();
      const item = button.getBoundingClientRect();
      const next = {
        left: item.left - bounds.left + node.scrollLeft - node.clientLeft,
        top: item.top - bounds.top + node.scrollTop - node.clientTop,
        width: item.width,
        height: item.height,
      };
      if (
        previous &&
        Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous?.[key as keyof typeof next],
        )
      )
        return;
      const from = previous ? indicator.getBoundingClientRect() : undefined;
      animation?.cancel();
      Object.assign(indicator.style, {
        left: `${next.left}px`,
        top: `${next.top}px`,
        width: `${next.width}px`,
        height: `${next.height}px`,
      });
      const to = indicator.getBoundingClientRect();
      if (from && to.width && to.height)
        animation = play(
          indicator,
          [
            {
              transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            },
            { transform: "none" },
          ],
          {
            duration: motionDuration(node, "--motion-slow", 280),
            easing: getComputedStyle(node)
              .getPropertyValue("--motion-spring")
              .trim(),
          },
        );
      previous = next;
    });
  };
  const observer = new ResizeObserver(position);
  observer.observe(node);
  for (const button of node.querySelectorAll("button"))
    observer.observe(button);
  position();
  return {
    update(value: NavigationSelection) {
      selected = typeof value === "string" ? value : value.selected;
      position();
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      animation?.cancel();
      indicator.remove();
      delete node.dataset.motionNavigation;
    },
  };
}
