<script lang="ts">
  import { onMount, setContext, untrack, tick } from "svelte";
  import {
    Gantt,
    Willow,
    type IApi,
    type IColumnConfig,
    type IConfig,
  } from "@svar-ui/svelte-gantt";
  import { resourcePath, type Summary } from "../../lib/api/api";
  import { shiftedSchedule, shiftDate } from "./dates";
  import { widgetDate, type GanttPage } from "./planning";
  import type { DateProposal } from "./proposals";
  import { GANTT_CONTEXT, type GanttContext } from "./gantt-context";
  import GanttTask from "./GanttTask.svelte";
  import { cursorPage } from "../../lib/api/pagination";
  import { getGantt } from "../../lib/api/planning";
  import { PlanningRead } from "./planning-read";
  import { projectionNotice } from "../../lib/api/projection-state";
  import { ganttTasks } from "./gantt-tasks";

  let {
    project,
    month,
    revision,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    month: string;
    revision: number;
    search: string;
    open: (row: Summary) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (s: { start: string; end: string }) => void;
  } = $props();
  let data = $state<GanttPage | null>(null);
  let loading = $state(false);
  let error = $state("");
  let pageNotice = $state("");
  let freshness = $state("");
  let gesture = $state(false);
  let scale = $state("days");
  let selection = $state("");
  let history = $state<(string | null)[]>([null]);
  let chartWidth = $state(1000);
  let widgetApi = $state.raw<IApi | null>(null);
  let chartRoot = $state<HTMLDivElement>();
  let lastNavigation = "";
  let loadedProject: string | null = null;
  const reads = new PlanningRead((value) => {
    loading = value;
  });
  const filtered = $derived(
    (data?.rows ?? []).filter((r) =>
      r.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const cards = $derived(filtered.filter((r) => r.type === "card"));
  const selected = $derived(data?.rows.find((r) => r.id === selection));
  const tasks = $derived(ganttTasks(filtered));
  const scales = $derived<NonNullable<IConfig["scales"]>>(
    scale === "days"
      ? [
          { unit: "month", step: 1, format: "%F %Y" },
          { unit: "day", step: 1, format: "%j" },
        ]
      : scale === "weeks"
        ? [
            { unit: "month", step: 1, format: "%F %Y" },
            { unit: "week", step: 1, format: "%d %M" },
          ]
        : [
            { unit: "year", step: 1, format: "%Y" },
            { unit: "month", step: 1, format: "%F" },
          ],
  );
  const columns = $derived<IColumnConfig[]>(
    chartWidth < 650
      ? [{ id: "text", header: "Card / milestone", width: 170 }]
      : [
          { id: "text", header: "Card / milestone", width: 230 },
          { id: "plannedStart", header: "Start", width: 100 },
          { id: "plannedEnd", header: "End", width: 110 },
        ],
  );
  const axisStart = $derived(
    widgetDate(
      shiftDate(
        [
          `${month}-01`,
          ...tasks
            .map((t) => t.astra.schedule?.start ?? t.astra.due?.date)
            .filter((value): value is string => !!value),
        ].sort()[0],
        -2,
      ),
    ),
  );
  const axisEnd = $derived(
    widgetDate(
      shiftDate(
        [
          `${month}-28`,
          ...filtered.flatMap((row) => (row.due ? [row.due.date] : [])),
          ...tasks
            .map((t) => t.astra.schedule?.end ?? t.astra.due?.date)
            .filter((value): value is string => !!value),
        ]
          .sort()
          .at(-1)!,
        7,
      ),
    ),
  );
  const editable = () => (!loading || gesture) && !error;
  setContext<GanttContext>(GANTT_CONTEXT, {
    open: (row) => open(row),
    editable,
    gesture: (active) => {
      gesture = active;
      reads.pause(active);
    },
    propose: (row, days, operation) => {
      if (!row.schedule || row.availability !== "ready") return;
      selection = row.id;
      try {
        onpropose({
          path: resourcePath(row),
          version: row.version,
          schedule: shiftedSchedule(row.schedule, days, operation),
        });
      } catch (e) {
        error = String(e);
      }
    },
  });
  $effect(() => {
    const nextProject = project;
    void revision;
    untrack(() => {
      if (loadedProject !== nextProject) {
        loadedProject = nextProject;
        history = [null];
        data = null;
        selection = "";
        pageNotice = "";
      }
      void load(history.at(-1) ?? null);
    });
  });
  onMount(() => () => {
    reads.dispose();
    widgetApi = null;
  });
  async function load(cursor: string | null) {
    const scope = project;
    error = "";
    await reads.run<{ value: GanttPage | null; reset: boolean }>({
      key: `${scope}:${cursor ?? ""}`,
      read: (signal) =>
        scope
          ? cursorPage((page) => getGantt(scope, page, { signal }), cursor)
          : Promise.resolve({ value: null, reset: false }),
      apply: (result) => {
        if (result.reset) {
          history = [null];
          pageNotice =
            "The timeline changed. Showing the first page of the updated plan.";
        }
        data = result.value;
        freshness = result.value ? projectionNotice(result.value) : "";
      },
      failed: (cause) => {
        error = String(cause);
      },
    });
  }
  function selectCard(id: string) {
    selection = id;
    const task = tasks.find((item) => item.id === id);
    if (!task || !widgetApi) return;
    widgetApi.exec("select-task", { id });
    widgetApi.exec("scroll-chart", {
      left: Math.max(0, Number(widgetApi.getTask(id)?.$x ?? 0) - 48),
      top: tasks.indexOf(task) * 60,
    });
  }
  $effect(() => {
    const widget = widgetApi;
    const key = `${project}:${month}:${scale}:${chartWidth < 650}`;
    const task =
      tasks.find((t) =>
        (t.astra.schedule?.start ?? t.astra.due?.date ?? "").startsWith(month),
      ) ?? tasks[0];
    if (!widget || !task || key === lastNavigation) return;
    lastNavigation = key;
    void tick()
      .then(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      .then(() => {
        if (widget === widgetApi && key === lastNavigation)
          widget.exec("scroll-chart", {
            left: Math.max(0, Number(widget.getTask(task.id!)?.$x ?? 0) - 48),
          });
      });
  });
  function init(widget: IApi) {
    widgetApi = widget;
    void tick().then(() => {
      if (widget !== widgetApi) return;
      const chart = chartRoot?.querySelector<HTMLElement>(".wx-chart");
      // SVAR's queued scroll callback reads a cleared DOM reference after teardown.
      // This target-local capture guard is collected with the detached chart.
      chart?.addEventListener(
        "scroll",
        (event) => {
          if (!chart.isConnected || widget !== widgetApi)
            event.stopImmediatePropagation();
        },
        true,
      );
    });
    widget.on(
      "select-task",
      (ev: { id: string | number }) => (selection = String(ev.id)),
    );
    // The widget is a renderer; Astra's accessible handles and forms own all writes.
    for (const action of [
      "add-task",
      "delete-task",
      "update-task",
      "move-task",
      "indent-task",
      "copy-task",
      "undo",
      "redo",
      "set-display-mode",
    ])
      widget.intercept(action, () => false);
  }
</script>

{#if !project}<p>Select a project to see its planned dates.</p>
{:else}
  <div class="toolbar">
    <label
      >Timeline scale<select aria-label="Timeline scale" bind:value={scale}
        ><option value="days">Days</option><option value="weeks">Weeks</option
        ><option value="months">Months</option></select
      ></label
    >
    <button
      onclick={() => oncreate({ start: `${month}-01`, end: `${month}-01` })}
      >New scheduled card</button
    >
  </div>
  <details class="timeline-help">
    <summary>Timeline shortcuts & editing</summary>
    <p class="hint">
      Drag a card’s bar or its edges. Click the bar to edit its dates. Alt+←/→
      on a handle changes one day; hold Shift for a week.
    </p>
  </details>
  {#if error}<p role="alert">
      {error}
      <button
        onclick={() => {
          history = [null];
          void load(null);
        }}>Reload timeline</button
      >
    </p>{/if}
  {#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
  {#if loading}<p role="status">Loading timeline…</p>{/if}
  {#if pageNotice}<p class="hint" role="status">{pageNotice}</p>{/if}
  <div class="selection-bar" aria-label="Timeline selection">
    <label>
      Selected card<select
        aria-label="Selected card"
        value={selection}
        onchange={(event) => selectCard(event.currentTarget.value)}
      >
        <option value="">Choose a card or milestone</option>
        {#each filtered as row}<option value={row.id}>{row.title}</option
          >{/each}
      </select>
    </label>
    <button disabled={!selected} onclick={() => selected && open(selected)}
      >Open card</button
    >
    {#if selected?.schedule}<button
        onclick={() =>
          selected &&
          onpropose({
            path: resourcePath(selected),
            version: selected.version,
            schedule: selected.schedule,
          })}>Edit planned dates</button
      >{/if}
    {#if selected}<div class="selected-summary" aria-live="polite">
        <strong>{selected.title}</strong>
        <span
          >{selected.type === "milestone"
            ? "Milestone"
            : (selected.status?.replaceAll("_", " ") ?? "Card")}
          {selected.schedule
            ? ` · ${selected.schedule.start} → ${selected.schedule.end}`
            : " · No recorded plan"}
          {selected.due ? ` · ◆ Due: ${selected.due.date}` : ""}
        </span>
      </div>{/if}
  </div>
  <div class="astra-gantt" aria-label="Project Gantt chart">
    <Willow fonts={false} />
    <div
      class="chart wx-theme wx-willow-theme"
      class:compact={chartWidth < 650}
      bind:clientWidth={chartWidth}
      bind:this={chartRoot}
    >
      <Gantt
        {tasks}
        {scales}
        {columns}
        {init}
        taskTemplate={GanttTask}
        readonly={true}
        cellWidth={scale === "days"
          ? chartWidth < 650
            ? 144
            : 48
          : scale === "weeks"
            ? 140
            : 160}
        cellHeight={60}
        scaleHeight={32}
        gridWidth={chartWidth < 650 ? 170 : 230}
        start={axisStart}
        end={axisEnd}
      />
    </div>
  </div>
  <section>
    <h3>Unscheduled cards</h3>
    <div class="unscheduled">
      {#each cards.filter((r) => !r.schedule) as row}<button
          onclick={() => open(row)}>{row.title} · Set planned dates</button
        >{:else}<p>No unscheduled cards on this page.</p>{/each}
    </div>
  </section>
  {#if data?.page.next_cursor || history.length > 1}<nav
      aria-label="Timeline pages"
    >
      <button
        disabled={loading || history.length === 1}
        onclick={() => {
          history = history.slice(0, -1);
          void load(history.at(-1) ?? null);
        }}>Previous page</button
      ><span>Page {history.length} · project totals include other pages</span
      ><button
        disabled={loading || !data?.page.next_cursor}
        onclick={() => {
          const cursor = data!.page.next_cursor;
          history = [...history, cursor];
          void load(cursor);
        }}>Next page of dated resources</button
      >
    </nav>{/if}
{/if}

<style>
  strong {
    font-size: 15px;
  }
  .toolbar,
  .selection-bar,
  nav {
    display: flex;
    gap: 12px;
    align-items: end;
    flex-wrap: wrap;
    margin: 16px 0;
  }
  .selection-bar {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    margin: 12px 0;
  }
  .selection-bar label {
    flex: 1 1 210px;
  }
  .selection-bar select {
    max-width: 100%;
    width: 100%;
  }
  .selected-summary {
    flex-basis: 100%;
    display: grid;
    gap: 4px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .selected-summary span {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
  .timeline-help {
    font-size: 12px;
    color: var(--muted);
    margin: 8px 0;
  }
  label {
    display: grid;
    gap: 5px;
    max-width: 100%;
    min-width: 0;
    font-size: 12px;
  }
  select {
    max-width: 330px;
    min-height: 44px;
  }
  .hint,
  .notice {
    font-size: 13px;
    color: var(--muted);
  }
  .notice {
    border-left: 3px solid #b36b20;
    padding: 8px 12px;
  }
  .chart {
    height: 480px;
    min-width: 0;
    overflow-x: auto;
  }
  /* SVAR 2.7.2 compact chart mode assumes a writable action column.
     Keep its read-only renderer above that breakpoint inside a scroll viewport. */
  .chart :global(.wx-gantt) {
    min-width: 720px;
  }
  .compact :global(.wx-resizer) {
    visibility: hidden;
  }
  .compact :global(.wx-toggle-placeholder) {
    display: none;
  }
  .compact :global(.wx-cell .wx-text) {
    white-space: normal;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .astra-gantt {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .astra-gantt :global(.wx-willow-theme) {
    --wx-font-family: inherit;
    --wx-color-font: var(--ink);
    --wx-color-secondary-font: var(--muted);
    --wx-background: var(--paper);
    --wx-background-alt: var(--paper);
    --wx-gantt-border: 1px solid var(--line);
    --wx-gantt-border-color: var(--line);
    --wx-gantt-select-color: var(--wash);
    --wx-gantt-task-color: var(--paper);
    --wx-gantt-task-font-color: var(--ink);
    --wx-gantt-task-fill-color: transparent;
    --wx-gantt-holiday-background: var(--wash);
    --wx-grid-body-row-background: var(--paper);
  }
  .astra-gantt :global(.weekend) {
    background: var(--wash);
  }
  .astra-gantt :global(.wx-bar .wx-content) {
    overflow: visible;
  }
  .unscheduled {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  section h3 {
    margin-top: 24px;
  }
  @media (max-width: 720px) {
    .chart {
      height: 430px;
    }
    .toolbar {
      gap: 8px;
      margin: 12px 0;
    }
    .selection-bar {
      gap: 8px;
    }
    .selection-bar label {
      flex-basis: 100%;
    }
    select {
      max-width: 100%;
    }
  }
</style>
