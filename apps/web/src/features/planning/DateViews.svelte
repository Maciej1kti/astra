<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import type { CardCreate } from "../../lib/contracts/api.generated";
  import type { DateProposal } from "./proposals";
  import type { CalendarLayout } from "./planning-navigation";
  import { loadCalendarView, loadGanttView } from "./planning-components";
  import { reloadAfterPreloadFailure } from "../../lib/ui/preload-recovery";

  let {
    project,
    month,
    view,
    revision,
    writePending,
    weekStart,
    calendarDate,
    calendarLayout,
    workspaceToday,
    workspaceTimezone,
    onCalendarNavigate,
    onmonth,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    month: string;
    view: "calendar" | "gantt";
    revision: number;
    writePending: boolean;
    weekStart: string;
    calendarDate: string;
    calendarLayout: CalendarLayout;
    workspaceToday: string;
    workspaceTimezone: string;
    onCalendarNavigate: (date: string, layout: CalendarLayout) => void;
    onmonth: (month: string) => void;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (proposal: DateProposal) => void;
    oncreate: (initial: Partial<CardCreate>) => void;
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
        CalendarView = (await loadCalendarView()).default;
      else GanttView = (await loadGanttView()).default;
    } catch {
      if (view === requestedView)
        error =
          "Nie udało się wczytać widoku planowania. Spróbuj ponownie lub odśwież aplikację.";
    }
  }
  $effect(() => {
    void view;
    void loadView();
  });
</script>

{#if error}<p>
    <span role="alert">{error}</span>
    <button onclick={loadView}>Ponów ładowanie widoku planowania</button>
    <button onclick={reloadAfterPreloadFailure}>Odśwież aplikację</button>
  </p>{/if}
{#if view === "calendar" && CalendarView}<CalendarView
    {project}
    {calendarDate}
    {calendarLayout}
    {workspaceToday}
    {workspaceTimezone}
    {onCalendarNavigate}
    {revision}
    {writePending}
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
    {writePending}
    {weekStart}
    today={workspaceToday}
    {search}
    {open}
    {onpropose}
    {onmonth}
    oncreate={(schedule) => oncreate({ schedule })}
  />
{:else if !error}<p role="status">Ładowanie widoku planowania…</p>{/if}
