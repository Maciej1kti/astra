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
          if (planned.length >= 32) break;
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
  ],
};

export const menuLayers: Sequence = {
  layers: [
    {
      selector: ":scope > .layout-panel-heading",
      role: "heading",
      delay: 50,
      distance: "4px",
    },
    {
      selector:
        ":scope > :not(.layout-order, .layout-panel-heading, .layout-panel-footer), .layout-order > li",
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

/** Chart view: controls, the counter list, plot surfaces and the summary. */
export const chartLayers = [
  {
    selector: ".chart-options > *, .chart-controls > *",
    role: "detail",
    delay: 80,
    stagger: 40,
  },
  { selector: ".counter-picker", role: "content", delay: 100 },
  {
    selector: ".picker-summary, .counter-search",
    role: "heading",
    delay: 160,
    stagger: 40,
    afterParent: true,
    soften: false,
  },
  {
    selector: ".counter-option",
    role: "detail",
    delay: 220,
    stagger: 32,
    afterParent: true,
  },
  {
    selector: ".chart-panel, .chart-workspace > .empty",
    role: "content",
    delay: 160,
    stagger: 60,
  },
  {
    selector: ".plot-heading",
    role: "heading",
    delay: 240,
    afterParent: true,
    distance: "4px",
  },
  { selector: ".chart-note", role: "detail", delay: 360 },
  {
    selector: ".summary-heading",
    role: "heading",
    delay: 300,
    distance: "4px",
  },
  {
    selector: ".summary-row",
    role: "detail",
    delay: 360,
    stagger: 36,
  },
] as const;

/** One plot: its readout, then the marks rising from the baseline. */
export const plotLayers = [
  {
    selector: ".plot-legend > li",
    role: "detail",
    delay: 280,
    stagger: 36,
    soften: true,
  },
  { selector: ".plot-marks", role: "content", delay: 320, rise: true },
] as const;

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

/** A titled group of small items below a view, such as unscheduled cards. */
export const groupLayers: Sequence["layers"] = [
  { selector: ":scope > h3", role: "heading", delay: 60, distance: "4px" },
  {
    selector:
      ":scope > * > button, :scope > * > p, :scope > p, :scope > details",
    role: "detail",
    delay: 140,
    stagger: 32,
  },
];
