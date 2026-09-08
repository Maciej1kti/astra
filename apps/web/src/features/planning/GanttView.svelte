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
  import { partitionEdges } from "./gantt-projection";

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
  let preview = $state(false);
  let predecessor = $state("");
  let successor = $state("");
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
  const analysis = $derived(data?.analysis);
  const forecasts = $derived(
    new Map((data?.forecasts ?? []).map((forecast) => [forecast.id, forecast])),
  );
  const tasks = $derived(ganttTasks(filtered, forecasts, preview));
  const dependencies = $derived(
    partitionEdges(
      data?.edges ?? [],
      tasks.map((task) => String(task.id)),
    ),
  );
  const links = $derived(dependencies.links);
  const hiddenEdges = $derived(dependencies.hiddenEdges);
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
            .map((t) =>
              preview
                ? (forecasts.get(String(t.id))?.schedule.end ??
                  t.astra.due?.date)
                : (t.astra.schedule?.end ?? t.astra.due?.date),
            )
            .filter((value): value is string => !!value),
        ]
          .sort()
          .at(-1)!,
        7,
      ),
    ),
  );
  const editable = () => !preview && (!loading || gesture) && !error;
  setContext<GanttContext>(GANTT_CONTEXT, {
    open: (row) => open(row),
    editable,
    gesture: (active) => {
      gesture = active;
      reads.pause(active);
    },
    link: (row) => {
      selection = row.id;
      if (predecessor && predecessor !== row.id) {
        successor = row.id;
        dependency(predecessor, row.id);
      } else predecessor = predecessor === row.id ? "" : row.id;
    },
    propose: (row, days, operation) => {
      if (preview || !row.schedule || row.availability !== "ready") return;
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
        predecessor = "";
        successor = "";
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
  function dependency(from: string, to: string, remove = false) {
    const row = data?.rows.find((r) => r.id === to);
    if (!row || row.type !== "card" || row.availability !== "ready" || gesture)
      return;
    const previous = (data?.edges ?? [])
      .filter((e) => e.to === to)
      .map((e) => e.from);
    if (from === to) {
      error = "A card cannot depend on itself.";
      return;
    }
    if (!remove && previous.includes(from)) {
      error = "These cards are already connected.";
      return;
    }
    onpropose({
      path: resourcePath(row),
      version: row.version,
      dependencies: remove
        ? previous.filter((id) => id !== from)
        : [...previous, from],
      title: `${remove ? "Disconnect" : "Connect"}: ${name(from)} → ${name(to)}`,
    });
  }
  function name(id: string) {
    return data?.rows.find((r) => r.id === id)?.title ?? id;
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
      "add-link",
      "delete-link",
      "update-link",
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

{#if !project}<p>
    Select one project to see its cards, dependencies and finish forecast.
  </p>
{:else}
  {#if analysis}<section class="project-timing" aria-label="Project timing">
      <div>
        <small>Recorded plan</small><strong
          >{analysis.planned_start ?? "Not scheduled"} → {analysis.planned_end ??
            "—"}</strong
        >
      </div>
      <div>
        <small
          >{analysis.complete
            ? "Finish with dependencies"
            : "Known work · partial forecast"}</small
        ><strong
          >{analysis.forecast_end ?? "Unknown"}{analysis.delay_days
            ? ` · +${analysis.delay_days} days`
            : ""}</strong
        >
      </div>
      <div>
        <small>Coverage</small><strong
          >{analysis.scheduled_cards} dated · {analysis.unscheduled_cards} undated</strong
        >
      </div>
    </section>
    {#if !analysis.complete}<p class="notice">
        Incomplete forecast: {analysis.unresolved_cards} cards have missing dates
        or unresolved dependencies, or the 10,000-card analysis limit was reached.
        The displayed finish is not a complete project estimate.
      </p>{/if}{/if}
  <div class="toolbar">
    <label
      >Timeline scale<select aria-label="Timeline scale" bind:value={scale}
        ><option value="days">Days</option><option value="weeks">Weeks</option
        ><option value="months">Months</option></select
      ></label
    >
    <label class="toggle"
      ><input type="checkbox" bind:checked={preview} disabled={gesture} /> Dependency
      forecast</label
    >
    <button
      onclick={() => oncreate({ start: `${month}-01`, end: `${month}-01` })}
      >New scheduled card</button
    >
  </div>
  {#if predecessor}<p class="notice">
      Connect from <strong>{name(predecessor)}</strong>: click another card’s
      circle or choose a successor below.
      <button onclick={() => (predecessor = "")}>Cancel connection</button>
    </p>{/if}
  {#if preview}<p class="hint">
      Read-only forecast · Saved dates are unchanged.
    </p>{/if}
  <details class="timeline-help">
    <summary>Timeline shortcuts & editing</summary>
    <p class="hint">
      Drag a card’s bar or its edges. Click the bar to edit its dates. Alt+←/→
      on a handle changes one day; hold Shift for a week. The forecast preserves
      durations and moves each successor after its predecessors. The amber
      underline marks one chain determining the finish.
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
          {selected.due
            ? ` · ◆ ${selected.due.kind} deadline: ${selected.due.date}`
            : ""}
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
        {links}
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
  <section class="dependencies" aria-label="Connect cards">
    <h3>Connect cards</h3>
    <p>
      Finish-to-start: the successor waits for the predecessor. Parallel
      branches can share a predecessor.
    </p>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        dependency(predecessor, successor);
      }}
    >
      <label
        >Predecessor<select
          aria-label="Predecessor"
          required
          bind:value={predecessor}
          ><option value="">Finishes first…</option>{#each cards as row}<option
              value={row.id}>{row.title}</option
            >{/each}</select
        ></label
      >
      <span aria-hidden="true">→</span>
      <label
        >Successor<select aria-label="Successor" required bind:value={successor}
          ><option value="">Starts next…</option>{#each cards as row}<option
              value={row.id}
              disabled={row.id === predecessor}>{row.title}</option
            >{/each}</select
        ></label
      >
      <button disabled={!predecessor || !successor || loading || gesture}
        >Connect cards</button
      >
    </form>
    {#if hiddenEdges.length}<p>
        {hiddenEdges.length} connections involve cards outside the visible chart.
        See the dependency list.
      </p>{/if}
    <details>
      <summary>Dependencies · {data?.edges.length ?? 0}</summary>
      {#each data?.edges ?? [] as edge}<div class="connection">
          <span
            >{name(edge.from)} → {name(edge.to)}{edge.outside_page
              ? " · predecessor outside this page"
              : ""}{edge.warning ? ` · ${edge.warning}` : ""}</span
          ><button
            disabled={loading || gesture}
            aria-label={`Disconnect ${name(edge.from)} from ${name(edge.to)}`}
            onclick={() => dependency(edge.from, edge.to, true)}
            >Disconnect</button
          >
        </div>{/each}
    </details>
  </section>
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
  .project-timing {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 16px;
    background: var(--paper);
    margin-bottom: 12px;
  }
  small {
    display: block;
    color: var(--muted);
    margin-bottom: 6px;
  }
  strong {
    font-size: 15px;
  }
  .toolbar,
  .selection-bar,
  form,
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
  .toggle {
    display: flex;
    align-items: center;
    min-height: 44px;
  }
  .hint,
  .notice,
  .dependencies p {
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
    --wx-gantt-link-color: var(--muted);
    --wx-grid-body-row-background: var(--paper);
  }
  .astra-gantt :global(.weekend) {
    background: var(--wash);
  }
  .astra-gantt :global(.wx-bar .wx-content) {
    overflow: visible;
  }
  .connection {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--line);
    padding: 8px 0;
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
    .project-timing {
      gap: 10px;
      padding: 12px;
    }
    .project-timing > div {
      flex: 1 1 140px;
    }
    .project-timing strong {
      font-size: 13px;
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
    form label {
      width: 100%;
    }
    select {
      max-width: 100%;
    }
    .connection {
      align-items: start;
    }
  }
</style>
