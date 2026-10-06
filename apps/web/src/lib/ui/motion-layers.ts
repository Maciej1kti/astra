import { enter, motionDuration, onScreen, type MotionRole } from "./motion";

type Layer = {
  selector: string;
  role: MotionRole;
  delay: number;
  stagger?: number;
  distance?: string;
  afterParent?: boolean;
  soften?: boolean;
  /** Chart marks: also grow from the baseline set by their transform origin. */
  rise?: boolean;
};
type Sequence = { key?: string; ready?: boolean; layers: readonly Layer[] };

/** Explicit local sequences, measured once per opening/key, never on draft edits. */
export function revealLayers(node: HTMLElement, initial: Sequence) {
  let options = initial;
  let key: string | undefined;
  let frame = 0;
  let effects: Animation[] = [];
  const clear = () => {
    cancelAnimationFrame(frame);
    for (const effect of effects) effect.cancel();
    effects = [];
  };
  const reveal = () => {
    const next = options.key ?? "initial";
    if (options.ready === false) {
      cancelAnimationFrame(frame);
      return;
    }
    if (key === next) return;
    clear();
    frame = requestAnimationFrame(() => {
      key = next;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const owner = node.closest("dialog");
      const planned: { element: HTMLElement; layer: Layer; delay: number }[] =
        [];
      const seen = new Set<HTMLElement>();
      // Collect/measure first; then start a bounded set of visual effects.
      for (const layer of options.layers) {
        const targets = Array.from(
          node.querySelectorAll<HTMLElement>(layer.selector),
        )
          .slice(0, 16)
          .filter(
            (element) =>
              element.closest("dialog") === owner &&
              !seen.has(element) &&
              onScreen(element),
          );
        for (const [index, element] of targets.entries()) {
          if (planned.length >= 48) break;
          const parent = layer.afterParent
            ? planned.filter((item) => item.element.contains(element)).at(-1)
            : undefined;
          const delay = Math.min(
            560,
            Math.max(layer.delay, (parent?.delay ?? 0) + (parent ? 120 : 0)) +
              Math.min(index, 4) * (layer.stagger ?? 0),
          );
          planned.push({ element, layer, delay });
          seen.add(element);
        }
      }
      const style = getComputedStyle(node);
      const easing = style.getPropertyValue("--motion-emerge").trim();
      const softness = style.getPropertyValue("--motion-softness").trim();
      const rise = style.getPropertyValue("--motion-rise").trim();
      const durations = {
        heading: motionDuration(node, "--motion-heading", 600),
        content: motionDuration(node, "--motion-content", 640),
        detail: motionDuration(node, "--motion-detail", 480),
      };
      for (const { element, layer, delay } of planned) {
        const effect = enter(element, {
          id: `astra-layer-${layer.role}`,
          duration: durations[layer.role],
          delay,
          easing,
          distance: layer.distance ?? "0px",
          surface: layer.role === "content",
          softness:
            (layer.soften ?? layer.role === "heading") ? softness : undefined,
          rise: layer.rise ? rise : undefined,
        });
        if (effect) effects.push(effect);
      }
    });
  };
  reveal();
  return {
    update(next: Sequence) {
      options = next;
      reveal();
    },
    destroy: clear,
  };
}

export const dialogLayers: Sequence = {
  layers: [
    {
      selector: ".dialog-heading",
      role: "heading",
      delay: 60,
      distance: "3px",
    },
    {
      selector: ".dialog-header-content > *",
      role: "heading",
      delay: 110,
      stagger: 65,
      distance: "4px",
    },
    { selector: ".dialog-header-actions", role: "detail", delay: 140 },
    {
      selector:
        ".dialog-body > :not(.card-body-grid, .dialog-footer), .card-section[data-card-visible='true'] > .card-section-content",
      role: "content",
      delay: 200,
      stagger: 50,
    },
    { selector: ".dialog-footer", role: "detail", delay: 320 },
    {
      selector: ".tags .chips > li",
      role: "detail",
      delay: 280,
      stagger: 28,
      afterParent: true,
      soften: true,
    },
    {
      selector: ".counter-trend",
      role: "detail",
      delay: 300,
      stagger: 40,
      afterParent: true,
      rise: true,
    },
    // Fields, rows and notes inside each block of an ordinary dialog.
    {
      selector: ".dialog-body > :not(.card-body-grid, .dialog-footer) > *",
      role: "detail",
      delay: 260,
      stagger: 36,
      afterParent: true,
    },
    // Rows inside a card section.
    {
      selector:
        ".card-section-content :is(.checklist li, .add-row, .counter, .counter-actions, .comment-composer, .comment-history > li, .schedule-heading, .tags .input-row)",
      role: "detail",
      delay: 260,
      stagger: 36,
      afterParent: true,
    },
  ],
};

export const menuLayers: Sequence = {
  layers: [
    {
      selector: ":scope > .layout-panel-heading, .navigation-panel > strong",
      role: "heading",
      delay: 50,
      distance: "4px",
    },
    // A wrapper is not a layer: its items enter one by one.
    {
      selector:
        ":scope > :not(.layout-order, .layout-panel-heading, .layout-panel-footer, .navigation-panel), .layout-order > li, .navigation-panel > :not(strong)",
      role: "detail",
      delay: 100,
      stagger: 36,
    },
    { selector: ":scope > .layout-panel-footer", role: "detail", delay: 260 },
  ],
};

export const suggestionLayers: Sequence = {
  layers: [
    {
      selector: ":scope > li",
      role: "detail",
      delay: 80,
      stagger: 32,
      soften: true,
    },
  ],
};

export const controlsLayers: Sequence = {
  layers: [{ selector: ":scope > *", role: "detail", delay: 80, stagger: 40 }],
};

/** Pairing page: brand, headline, lead and the pairing surface. */
export const pairingLayers: Sequence = {
  layers: [
    { selector: ":scope > .brand", role: "detail", delay: 0 },
    {
      selector: ":scope > h1",
      role: "heading",
      delay: 80,
      distance: "4px",
    },
    { selector: ":scope > .lead", role: "detail", delay: 180 },
    {
      selector: ":scope > .pairbox",
      role: "content",
      delay: 260,
      distance: "6px",
    },
    {
      selector: ":scope > .pairbox > *",
      role: "detail",
      delay: 340,
      stagger: 40,
      afterParent: true,
    },
  ],
};
