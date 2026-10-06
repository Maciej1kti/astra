/** Native grids and event groups only fade, preserving all gesture geometry. */
export const calendarLayers = [
  { selector: ":scope > .ec", role: "content", delay: 0 },
  {
    selector: ".ec-header > .ec-grid",
    role: "heading",
    delay: 100,
    soften: false,
  },
  {
    selector: ".ec-body > .ec-grid, .ec-all-day > .ec-grid",
    role: "content",
    delay: 160,
    stagger: 50,
  },
  {
    selector: ".ec-body > .ec-events, .ec-all-day > .ec-events",
    role: "content",
    delay: 240,
    stagger: 60,
  },
  {
    selector: ".ec-list .ec-main > .ec-day, .ec-no-events",
    role: "content",
    delay: 180,
    stagger: 45,
  },
] as const;

/** The legend and shortcut help follow the calendar they describe. */
export const metaLayers = [
  { selector: ":scope > *", role: "detail", delay: 300, stagger: 60 },
] as const;

/** A titled group of small items below a view, such as unscheduled cards. */
export const groupLayers = [
  { selector: ":scope > h3", role: "heading", delay: 60, distance: "4px" },
  {
    selector:
      ":scope > * > button, :scope > * > p, :scope > p, :scope > details",
    role: "detail",
    delay: 140,
    stagger: 32,
  },
] as const;
