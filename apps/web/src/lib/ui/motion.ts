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
  // Until the stylesheet applies its tokens there is no curve to follow, and
  // an empty easing would throw. The content then simply appears.
  if (preference().matches || options.easing === "") return;
  const animation = node.animate(frames, options);
  active.add(animation);
  const release = () => active.delete(animation);
  animation.addEventListener("finish", release, { once: true });
  animation.addEventListener("cancel", release, { once: true });
  return animation;
}

export type MotionRole = "heading" | "content" | "detail";

/** Gentle opacity onset; only small, explicitly chosen layers resolve from blur. */
export function enter(
  node: HTMLElement,
  options: {
    id: string;
    duration: number;
    delay: number;
    easing: string;
    distance: string;
    surface?: boolean;
    softness?: string;
    rise?: string;
  },
) {
  const { distance, surface, softness, rise, ...timing } = options;
  const moving = distance !== "0px";
  return play(
    node,
    [
      {
        opacity: 0,
        ...(moving ? { translate: `0 ${distance}` } : {}),
        ...(softness ? { filter: `blur(${softness})` } : {}),
        // Chart marks grow from their baseline; their origin is set in CSS.
        ...(rise ? { scale: `1 ${rise}` } : {}),
      },
      ...(surface ? [{ opacity: 1, offset: 0.8 }] : []),
      {
        opacity: 1,
        ...(moving ? { translate: "0 0" } : {}),
        ...(softness ? { filter: "blur(0px)" } : {}),
        ...(rise ? { scale: "1 1" } : {}),
      },
    ],
    { ...timing, fill: "backwards" },
  );
}

export function onScreen(node: HTMLElement) {
  if (node.closest("[inert], [aria-hidden='true']")) return false;
  const rect = node.getBoundingClientRect();
  return (
    rect.width > 1 &&
    rect.height > 1 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
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
  cardSelector?: string;
};
const sceneItems =
  ".sectiontitle, .tablehead, .resource-card, .focus-card, .listrow, .update, .empty";
const cardLayers = [
  {
    name: "context",
    selector:
      ".focus-card-context, .card-content > small, :scope.listrow > div:first-of-type > small, :scope.update > div > small",
    delay: 60,
  },
  {
    name: "title",
    selector:
      ".focus-card-title, .card-title, :scope.listrow > div:first-of-type > strong, :scope.update h3, :scope[data-board-card] h3",
    delay: 100,
  },
  {
    name: "metadata",
    selector: ".focus-card-facts, .row-metadata, .resource-metadata",
    delay: 150,
  },
  {
    name: "labels",
    selector: ".focus-card-labels, .resource-metadata > .tags",
    delay: 200,
  },
  { name: "reasons", selector: ".attention-reasons", delay: 220 },
  { name: "counters", selector: ".focus-card-counters", delay: 250 },
] as const;

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
      const duration = motionDuration(node, "--motion-scene", 720);
      const style = getComputedStyle(node);
      const easing = style.getPropertyValue("--motion-emerge").trim();
      const softness = style.getPropertyValue("--motion-softness").trim();
      const stagger = motionDuration(node, "--motion-stagger", 52);
      const headingDuration = motionDuration(node, "--motion-heading", 600);
      const detailDuration = motionDuration(node, "--motion-detail", 480);
      // Measure one bounded group before writing animation styles.
      const targets = Array.from(
        node.querySelectorAll<HTMLElement>(options.selector ?? sceneItems),
      )
        .slice(0, 24)
        .filter(onScreen);
      const cards: { item: HTMLElement; delay: number }[] = [];
      const planned: ({ item: HTMLElement } & Parameters<typeof enter>[1])[] =
        [];
      for (const [index, item] of targets.entries()) {
        const heading = item.matches(".sectiontitle, .tablehead");
        const delay = (heading ? 0 : 80) + Math.min(index, 5) * stagger;
        // Focus owns pointer/drag geometry. Its surface only fades.
        const distance = item.matches(".focus-card")
          ? "0px"
          : (options.distance ??
            style.getPropertyValue("--motion-distance").trim());
        planned.push({
          item,
          id: `astra-scene-${heading ? "heading" : "content"}`,
          duration: heading ? headingDuration : duration,
          delay,
          easing,
          distance: heading ? "4px" : distance,
          surface: !heading,
          softness: heading ? softness : undefined,
        });
        if (!options.selector && !heading) cards.push({ item, delay });
      }
      // Board columns retain their geometry; only bounded visible card children fade.
      if (options.cardSelector) {
        const selector = options.cardSelector;
        cards.push(
          ...targets
            .flatMap((column) =>
              Array.from(column.querySelectorAll<HTMLElement>(selector)).slice(
                0,
                8,
              ),
            )
            .slice(0, 48)
            .filter(onScreen)
            .slice(0, 24)
            .map((item, index) => ({
              item,
              delay: 80 + Math.min(index, 5) * stagger,
            })),
        );
      }
      let details = 0;
      for (const { item, delay } of cards) {
        for (const layer of cardLayers) {
          if (details >= 72) break;
          const detail = item.querySelector<HTMLElement>(layer.selector);
          if (!detail || !onScreen(detail)) continue;
          planned.push({
            item: detail,
            id: `astra-scene-card-${layer.name}`,
            duration: layer.name === "title" ? headingDuration : detailDuration,
            delay: delay + layer.delay,
            easing,
            distance: "0px",
            softness: layer.name === "title" ? softness : undefined,
          });
          details++;
        }
      }
      for (const { item, ...entrance } of planned) {
        const effect = enter(item, entrance);
        if (effect) animations.push(effect);
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
            duration: motionDuration(node, "--motion-selection", 520),
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
