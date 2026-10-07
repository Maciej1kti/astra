/** Chart view: controls, the counter list, plot surfaces and the summary. */
export const chartLayers = [
  {
    selector: ".chart-options > *, .chart-controls > *",
    role: "detail",
    delay: 80,
    stagger: 40,
  },
  { selector: ".chart-settlement", role: "content", delay: 90 },
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
