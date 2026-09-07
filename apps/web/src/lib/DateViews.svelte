<script lang="ts">
  import type { Summary } from "./api";
  import type { DateProposal } from "./proposals";
  let {
    project,
    month,
    view,
    revision,
    weekStart,
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
  $effect(() => {
    const loading =
      view === "calendar"
        ? import("./CalendarView.svelte").then(
            (m) => (CalendarView = m.default),
          )
        : import("./GanttView.svelte").then((m) => (GanttView = m.default));
    void loading.catch((e) => (error = String(e)));
  });
</script>

{#if error}<p role="alert">{error}</p>{/if}
{#if view === "calendar" && CalendarView}<CalendarView
    {project}
    {month}
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
{:else}<p role="status">Loading planning view…</p>{/if}
