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
