<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import type { DateProposal } from "./proposals";
  import type { CalendarLayout } from "./planning-navigation";

  let {
    project,
    month,
    view,
    revision,
    weekStart,
    calendarDate,
    calendarLayout,
    workspaceToday,
    onCalendarNavigate,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    month: string;
    view: "calendar" | "gantt";
    revision: number;
    weekStart: string;
    calendarDate: string;
    calendarLayout: CalendarLayout;
    workspaceToday: string;
    onCalendarNavigate: (date: string, layout: CalendarLayout) => void;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (proposal: DateProposal) => void;
    oncreate: (schedule: { start: string; end: string }) => void;
  } = $props();
  let CalendarView = $state<
    typeof import("./CalendarView.svelte").default | null
  >(null);
  let GanttView = $state<typeof import("./GanttView.svelte").default | null>(
    null,
  );
  let error = $state("");
  async function loadView() {
    const requestedView = view;
    error = "";
    try {
      if (requestedView === "calendar")
        CalendarView = (await import("./CalendarView.svelte")).default;
      else GanttView = (await import("./GanttView.svelte")).default;
    } catch {
      if (view === requestedView)
        error =
          "This planning view could not be loaded. Retry, or reload after preserving any open draft.";
    }
  }
  $effect(() => {
    void view;
    void loadView();
  });
</script>

{#if error}<p role="alert">
    {error} <button onclick={loadView}>Retry planning view</button>
  </p>{/if}
{#if view === "calendar" && CalendarView}<CalendarView
    {project}
    {calendarDate}
    {calendarLayout}
    {workspaceToday}
    {onCalendarNavigate}
    {revision}
    {weekStart}
    {search}
    {open}
    {onpropose}
    {oncreate}
  />
{:else if view === "gantt" && GanttView}<GanttView
    {project}
    {month}
    {revision}
    {search}
    {open}
    {onpropose}
    {oncreate}
  />
{:else if !error}<p role="status">Loading planning view…</p>{/if}
