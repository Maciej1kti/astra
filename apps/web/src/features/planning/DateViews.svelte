<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import type { CardCreate } from "../../lib/contracts/api.generated";
  import type { DateProposal } from "./proposals";
  import type { CalendarLayout, PlanningScope } from "./planning-navigation";
  import { loadCalendarView, loadGanttView } from "./planning-components";
  import { reloadAfterPreloadFailure } from "../../lib/ui/preload-recovery";

  // Both views take what they need from one set of props.
  let props: {
    project: string;
    /** Goals with the span of their cards' dates; the goal scope draws these. */
    goals: Summary[];
    scope: PlanningScope;
    onscope: (scope: PlanningScope) => void;
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
    const requestedView = props.view;
    error = "";
    try {
      if (requestedView === "calendar")
        CalendarView = (await loadCalendarView()).default;
      else GanttView = (await loadGanttView()).default;
    } catch {
      if (props.view === requestedView)
        error =
          "Nie udało się wczytać widoku planowania. Spróbuj ponownie lub odśwież aplikację.";
    }
  }
  $effect(() => {
    void props.view;
    void loadView();
  });
</script>

{#if error}<p>
    <span role="alert">{error}</span>
    <button onclick={loadView}>Ponów ładowanie widoku planowania</button>
    <button onclick={reloadAfterPreloadFailure}>Odśwież aplikację</button>
  </p>{/if}
{#if props.view === "calendar" && CalendarView}<CalendarView {...props} />
{:else if props.view === "gantt" && GanttView}<GanttView
    {...props}
    today={props.workspaceToday}
    oncreate={(schedule) => props.oncreate({ schedule })}
  />
{:else if !error}<p role="status">Ładowanie widoku planowania…</p>{/if}
