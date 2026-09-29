// The route can fetch its widget while session and project reads are in flight.
// Dynamic imports share the browser's module cache; the mounted view owns errors.
export const loadCalendarView = () => import("./CalendarView.svelte");
export const loadGanttView = () => import("./GanttView.svelte");
