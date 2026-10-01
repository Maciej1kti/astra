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

type Scene = {
  key?: string;
  ready?: boolean;
  selector?: string;
  distance?: string;
};
const sceneItems =
  ".sectiontitle, .tablehead, .resource-card, .focus-card, .projectcard, .listrow, .update, .empty";

/** A bounded cascade, once per navigation/readiness; refreshes keep their DOM. */
export function revealScene(node: HTMLElement, initial: Scene = {}) {
  let options = initial;
  let revealed: string | undefined;
  let frame = 0;
  let animations: Animation[] = [];
  const clear = () => {
    cancelAnimationFrame(frame);
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  const reveal = () => {
    const key = options.key ?? "initial";
    if (options.ready === false) {
      cancelAnimationFrame(frame);
      return;
    }
    if (revealed === key) return;
    clear();
    frame = requestAnimationFrame(() => {
      revealed = key;
      if (preference().matches) return;
      const duration = motionDuration(node, "--motion-scene", 420);
      const style = getComputedStyle(node);
      const easing = style.getPropertyValue("--motion-ease").trim();
      const stagger = motionDuration(node, "--motion-stagger", 32);
      // Measure one bounded group before writing animation styles.
      const targets = Array.from(
        node.querySelectorAll<HTMLElement>(options.selector ?? sceneItems),
      )
        .slice(0, 24)
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return (
            rect.height > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0
          );
        });
      for (const [index, item] of targets.entries()) {
        // Focus owns pointer/drag geometry. Its surface only fades.
        const distance = item.matches(".focus-card")
          ? "0px"
          : (options.distance ??
            style.getPropertyValue("--motion-distance").trim());
        const animation = play(
          item,
          distance === "0px"
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, translate: `0 ${distance}` },
                { opacity: 1, translate: "0 0" },
              ],
          {
            duration,
            delay: Math.min(index, 5) * stagger,
            easing,
            fill: "backwards",
          },
        );
        if (animation) animations.push(animation);
      }
    });
  };
  reveal();
  return {
    update(next: Scene) {
      options = next;
      reveal();
    },
    destroy: clear,
  };
}

/** Move one shared selection surface across both sidebar and mobile dock. */
export function navigationMotion(node: HTMLElement, selected: string) {
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
      const next = {
        left: button.offsetLeft,
        top: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
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
            duration: motionDuration(node, "--motion-selection", 380),
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
    update(value: string) {
      selected = value;
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
