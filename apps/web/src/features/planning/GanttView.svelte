<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import WidgetLocale from "../../lib/ui/WidgetLocale.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { revealScene } from "../../lib/ui/motion";
  import { controlsLayers, revealLayers } from "../../lib/ui/motion-layers";
  import { timelineMetrics as metrics } from "../../lib/ui/planning-metrics";
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
  import TimelineRow from "./TimelineRow.svelte";
  import {
    orderedTimelineRows,
    readTimelineOrder,
    writeTimelineOrder,
    moveTimelineRow,
  } from "./timeline-order";
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
    writePending,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    month: string;
    revision: number;
    writePending: boolean;
    search: string;
    open: (row: Summary) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (s: { start: string; end: string }) => void;
  } = $props();
  let data = $state.raw<GanttPage | null>(null);
  let loading = $state(false);
  let error = $state("");
  let pageNotice = $state("");
  let freshness = $state("");
  let gesture = $state(false);
  let rowOrder = $state<string[]>([]);
  let orderNotice = $state("");
  let scale = $state("days");
  let selection = $state("");
  let history = $state<(string | null)[]>([null]);
  let chartWidth = $state(1000);
  let widgetApi = $state.raw<IApi | null>(null);
  let chartRoot = $state<HTMLDivElement>();
  let lastNavigation = "";
  let loadedProject: string | null = null;
  const readScope = $derived(`${project}:${revision}`);
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
  const baseTasks = $derived(
    ganttTasks(orderedTimelineRows(filtered, rowOrder)),
  );
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
    chartWidth < metrics.compactWidth
      ? [
          {
            id: "text",
            header: "Element",
            cell: TimelineRow,
            width: metrics.compactGrid,
          },
        ]
      : [
          {
            id: "text",
            header: "Element",
            cell: TimelineRow,
            width: metrics.grid,
          },
          {
            id: "plannedStart",
            header: "Początek",
            width: metrics.startColumn,
          },
          { id: "plannedEnd", header: "Koniec", width: metrics.endColumn },
        ],
  );
  const axisStart = $derived(
    widgetDate(
      shiftDate(
        [
          `${month}-01`,
          ...baseTasks
            .map((t) => t.plannedStart ?? t.astra.due?.date)
            .filter((value): value is string => !!value),
        ].reduce((earliest, day) => (day < earliest ? day : earliest)),
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
          ...baseTasks
            .map((t) => t.plannedEnd ?? t.astra.due?.date)
            .filter((value): value is string => !!value),
        ].reduce((latest, day) => (day > latest ? day : latest)),
        7,
      ),
    ),
  );
  const tasks = $derived([
    ...baseTasks,
    {
      id: "astra-create-row",
      text: "",
      type: "task",
      start: axisStart,
      end: axisEnd,
      astraCreate: true,
      astraCreateDate: `${month}-01`,
    },
  ]);
  const editable = () => (!loading || gesture) && !error && !writePending;
  setContext<GanttContext>(GANTT_CONTEXT, {
    order: () => baseTasks.map((task) => String(task.id)),
    reorder: reorderRow,
    create: (date) => oncreate({ start: date, end: date }),
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
        error = errorMessage(e);
      }
    },
  });
  $effect(() => {
    void readScope;
    untrack(() => {
      const nextProject = project;
      if (loadedProject !== nextProject) {
        loadedProject = nextProject;
        history = [null];
        rowOrder = readTimelineOrder(nextProject);
        orderNotice = "";
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
            "Oś czasu się zmieniła. Wyświetlono pierwszą stronę aktualnego planu.";
        }
        data = result.value;
        freshness = result.value ? projectionNotice(result.value) : "";
      },
      failed: (cause) => {
        error = errorMessage(cause);
      },
    });
  }
  function reorderRow(id: string, destination: number) {
    if (!editable()) return;
    const order = baseTasks.map((task) => String(task.id));
    const moved = moveTimelineRow(order, id, destination);
    const visible = new Set(order);
    const retained = rowOrder.filter((key) => !visible.has(key));
    rowOrder = [...moved, ...retained];
    orderNotice = writeTimelineOrder(project, rowOrder)
      ? ""
      : "Przeglądarka nie mogła zapisać kolejności na osi czasu.";
    void tick().then(() =>
      chartRoot
        ?.querySelector<HTMLButtonElement>(`[data-timeline-row="${id}"] button`)
        ?.focus({ preventScroll: true }),
    );
  }
  function selectCard(id: string) {
    selection = id;
    const task = tasks.find((item) => item.id === id);
    if (!task || !widgetApi) return;
    widgetApi.exec("select-task", { id });
    widgetApi.exec("scroll-chart", {
      left: Math.max(0, Number(widgetApi.getTask(id)?.$x ?? 0) - metrics.day),
      top: tasks.indexOf(task) * metrics.row,
    });
  }
  $effect(() => {
    const widget = widgetApi;
    const key = `${project}:${month}:${scale}:${chartWidth < metrics.compactWidth}`;
    const task =
      baseTasks.find((t) =>
        (t.plannedStart ?? t.astra.due?.date ?? "").startsWith(month),
      ) ?? baseTasks[0];
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
            left: Math.max(
              0,
              Number(widget.getTask(task.id!)?.$x ?? 0) - metrics.day,
            ),
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

{#if !project}<p>Wybierz projekt, aby zobaczyć jego zaplanowane daty.</p>
{:else}
  <div class="toolbar" use:revealLayers={controlsLayers}>
    <label
      >Skala osi czasu<select aria-label="Skala osi czasu" bind:value={scale}
        ><option value="days">Dni</option><option value="weeks">Tygodnie</option
        ><option value="months">Miesiące</option></select
      ></label
    >
  </div>
  {#if orderNotice}<p role="status">{orderNotice}</p>{/if}
  {#if error}<p>
      <span role="alert">{error}</span>
      <button
        onclick={() => {
          history = [null];
          void load(null);
        }}>Wczytaj oś czasu ponownie</button
      >
    </p>{/if}
  {#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
  {#if loading}<p role="status">Ładowanie osi czasu…</p>{/if}
  {#if pageNotice}<p class="hint" role="status">{pageNotice}</p>{/if}
  <div class="selection-bar" aria-label="Wybór na osi czasu">
    <label>
      Wybrany element<select
        aria-label="Wybrana karta"
        value={selection}
        onchange={(event) => selectCard(event.currentTarget.value)}
      >
        <option value="">Wybierz element</option>
        {#each filtered as row}<option value={row.id}>{row.title}</option
          >{/each}
      </select>
    </label>
    <button disabled={!selected} onclick={() => selected && open(selected)}
      >Otwórz element</button
    >
    {#if selected?.schedule}<button
        onclick={() =>
          selected &&
          onpropose({
            path: resourcePath(selected),
            version: selected.version,
            schedule: selected.schedule,
          })}>Edytuj zaplanowane daty</button
      >{/if}
    {#if selected}<div class="selected-summary" aria-live="polite">
        <strong>{selected.title}</strong>
        <span
          >{selected.type === "milestone"
            ? "Kamień milowy"
            : selected.status
              ? resourceLabel(selected.status)
              : "Karta"}
          {selected.schedule
            ? ` · ${selected.schedule.start} → ${selected.schedule.end}`
            : "· Brak zapisanego planu"}
          {selected.due ? ` · ◆ Termin: ${selected.due.date}` : ""}
        </span>
      </div>{/if}
  </div>
  <div
    use:revealScene={{
      ready: !loading && !!data,
      key: `${project}:${month}:${scale}`,
      selector: ":scope > .chart",
      distance: "0px",
    }}
    class="astra-gantt"
    aria-label="Wykres Gantta projektu"
  >
    <WidgetLocale>
      <Willow fonts={false} />
      <div
        class="chart wx-theme wx-willow-theme"
        class:compact={chartWidth < metrics.compactWidth}
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
            ? chartWidth < metrics.compactWidth
              ? metrics.compactDay
              : metrics.day
            : scale === "weeks"
              ? metrics.week
              : metrics.month}
          cellHeight={metrics.row}
          scaleHeight={metrics.scale}
          gridWidth={chartWidth < metrics.compactWidth
            ? metrics.compactGrid
            : metrics.grid}
          start={axisStart}
          end={axisEnd}
        />
      </div>
    </WidgetLocale>
  </div>
  <section>
    <h3>Karty bez harmonogramu</h3>
    <div class="unscheduled">
      {#each cards.filter((r) => !r.schedule && !r.event) as row}<button
          onclick={() => open(row)}>{row.title} · Ustaw zaplanowane daty</button
        >{:else}<p>Brak kart bez harmonogramu na tej stronie.</p>{/each}
    </div>
  </section>
  {#if data?.page.next_cursor || history.length > 1}<nav
      aria-label="Strony osi czasu"
    >
      <button
        disabled={loading || history.length === 1}
        onclick={() => {
          history = history.slice(0, -1);
          void load(history.at(-1) ?? null);
        }}>Poprzednia strona</button
      ><span>Strona {history.length} · sumy projektu obejmują inne strony</span
      ><button
        disabled={loading || !data?.page.next_cursor}
        onclick={() => {
          const cursor = data!.page.next_cursor;
          history = [...history, cursor];
          void load(cursor);
        }}>Następna strona elementów z datą</button
      >
    </nav>{/if}
{/if}

<style>
  strong {
    font-size: var(--text-card);
  }
  .toolbar,
  .selection-bar,
  nav {
    display: flex;
    gap: var(--space-6);
    align-items: end;
    flex-wrap: wrap;
    margin: var(--space-8) 0;
  }
  .selection-bar {
    padding: var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--paper);
    margin: var(--space-6) 0;
  }
  .selection-bar label {
    flex: 1 1 var(--field-width);
  }
  .selection-bar select {
    max-width: 100%;
    width: 100%;
  }
  .selected-summary {
    flex-basis: 100%;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .selected-summary span {
    font-size: var(--text-sm);
    color: var(--muted);
    line-height: var(--leading-body);
  }
  label {
    display: grid;
    gap: var(--space-3);
    max-width: 100%;
    min-width: 0;
    font-size: var(--text-sm);
  }
  select {
    max-width: var(--field-max-width);
    min-height: var(--tap-target);
  }
  .hint,
  .notice {
    font-size: var(--text-label);
    color: var(--muted);
  }
  .notice {
    border-left: var(--space-2) solid var(--notice-ink);
    padding: var(--space-4) var(--space-6);
  }
  .chart {
    height: var(--chart-height);
    min-width: 0;
    overflow-x: auto;
  }
  /* SVAR 2.7.2 compact chart mode assumes a writable action column.
     Keep its read-only renderer above that breakpoint inside a scroll viewport. */
  .chart :global(.wx-gantt) {
    min-width: var(--gantt-min-width);
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
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    overflow: hidden;
  }
  .astra-gantt :global(.wx-willow-theme) {
    --wx-font-family: inherit;
    --wx-color-font: var(--ink);
    --wx-color-secondary-font: var(--muted);
    --wx-background: var(--paper);
    --wx-background-alt: var(--paper);
    --wx-gantt-border: var(--stroke) solid var(--line);
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
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  section h3 {
    margin-top: var(--space-10);
  }
  @media (max-width: 720px) {
    .chart {
      height: var(--chart-mobile-height);
    }
    .toolbar {
      gap: var(--space-4);
      margin: var(--space-6) 0;
    }
    .selection-bar {
      gap: var(--space-4);
    }
    .selection-bar label {
      flex-basis: 100%;
    }
    select {
      max-width: 100%;
    }
  }
</style>
