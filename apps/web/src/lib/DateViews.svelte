<script lang="ts">
  import { onMount } from "svelte";
  import { api, resourcePath, type Summary } from "./api";
  import { dateGesture } from "./date-gesture";
  import { dayDistance, shiftedSchedule, shiftDate } from "./dates";
  import type { DateProposal } from "./proposals";
  type CalendarItem = {
    item_id: string;
    kind: string;
    project_id: string;
    resource_id: string;
    version: string;
    title: string;
    start: string;
    end: string;
    due_kind?: string;
  };
  type Edge = {
    from: string;
    to: string;
    outside_page: boolean;
    warning: string | null;
  };
  let {
    project,
    month,
    view,
    revision,
    weekStart = "monday",
    search = "",
    open,
    onpropose,
  }: {
    project: string;
    month: string;
    view: "calendar" | "gantt";
    revision: number;
    weekStart?: string;
    search?: string;
    open: (item: Pick<Summary, "type" | "id" | "project_id">) => void;
    onpropose: (proposal: DateProposal) => void;
  } = $props();
  let items = $state<CalendarItem[]>([]),
    rows = $state<Summary[]>([]),
    edges = $state<Edge[]>([]),
    cursor = $state<string | null>(null),
    paged = $state(false),
    error = $state(""),
    loading = $state(false),
    mode = $state("month"),
    week = $state(0),
    scale = $state("days");
  let generation = 0,
    deferredRefresh = false;
  onMount(() => {
    const released = () => {
      if (deferredRefresh) {
        deferredRefresh = false;
        void load(false);
      }
    };
    window.addEventListener("planning-gesture-ended", released);
    return () => window.removeEventListener("planning-gesture-ended", released);
  });
  let days = $derived.by(() => {
    const [year, m] = month.split("-").map(Number);
    return Array.from(
      { length: new Date(Date.UTC(year, m, 0)).getUTCDate() },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    );
  });

  let padding = $derived(
    (new Date(`${days[0]}T12:00:00Z`).getUTCDay() +
      (weekStart === "monday" ? 6 : 0)) %
      7,
  );
  let calendarDays = $derived(
    Array.from({ length: Math.ceil((days.length + padding) / 7) * 7 }, (_, i) =>
      shiftDate(days[0], i - padding),
    ),
  );
  let shownDays = $derived(
    mode === "week"
      ? calendarDays.slice(
          Math.min(week, calendarDays.length / 7 - 1) * 7,
          (Math.min(week, calendarDays.length / 7 - 1) + 1) * 7,
        )
      : days,
  );
  let matchingItems = $derived(
    items.filter((item) =>
      item.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  let matchingRows = $derived(
    rows.filter((item) =>
      item.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  let scheduledRows = $derived(
    matchingRows.filter(
      (row) =>
        row.schedule &&
        row.schedule.start <= days.at(-1)! &&
        row.schedule.end >= days[0],
    ),
  );
  let visibleEdges = $derived(
    edges.filter(
      (edge) =>
        scheduledRows.some((row) => row.id === edge.from) &&
        scheduledRows.some((row) => row.id === edge.to),
    ),
  );
  function edgePath(edge: Edge) {
    const from = scheduledRows.findIndex((row) => row.id === edge.from),
      to = scheduledRows.findIndex((row) => row.id === edge.to);
    const x1 =
      200 +
      Math.max(
        0,
        Math.min(
          days.length,
          dayDistance(days[0], scheduledRows[from].schedule!.end) + 1,
        ),
      ) *
        unit;
    const x2 =
      200 +
      Math.max(
        0,
        Math.min(
          days.length,
          dayDistance(days[0], scheduledRows[to].schedule!.start),
        ),
      ) *
        unit;
    const y1 = 64 + from * 64,
      y2 = 64 + to * 64;
    const bend = Math.max(x1 + 12, x2 + 12);
    return `M ${x1} ${y1} H ${bend} V ${y2} H ${x2}`;
  }
  let unit = $derived(scale === "days" ? 48 : scale === "weeks" ? 28 : 16);
  $effect(() => {
    void project;
    void month;
    void view;
    void revision;
    void weekStart;
    void load(false);
  });
  async function load(more: boolean) {
    const current = ++generation;
    loading = true;
    error = "";
    try {
      if (view === "gantt" && !project) {
        rows = [];
        edges = [];
        cursor = null;
        return;
      }
      const path =
        view === "calendar"
          ? `/api/v1/views/calendar?from=${calendarDays[0]}&to=${calendarDays.at(-1)}${project ? `&project_id=${project}` : ""}`
          : `/api/v1/views/gantt?project_id=${project}`;
      const data = await api<{
        items?: CalendarItem[];
        rows?: Summary[];
        edges?: Edge[];
        page: { next_cursor: string | null };
      }>(
        `${path}&limit=200${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (current !== generation) return;
      if (document.querySelector("[data-dragging]")) {
        deferredRefresh = true;
        return;
      }
      items = data.items ?? [];
      paged = more;
      rows = data.rows ?? [];
      edges = data.edges ?? [];
      cursor = data.page.next_cursor;
    } catch (e) {
      if (current === generation)
        error = e instanceof Error ? e.message : String(e);
    } finally {
      if (current === generation) loading = false;
    }
  }
  function target(item: CalendarItem) {
    return {
      id: item.resource_id,
      project_id: item.project_id,
      type: item.kind.startsWith("milestone")
        ? ("milestone" as const)
        : item.kind.startsWith("project")
          ? ("project" as const)
          : ("card" as const),
    };
  }
  function label(item: CalendarItem) {
    return item.kind.endsWith("due")
      ? `${item.due_kind} deadline`
      : item.kind.endsWith("review")
        ? "Review"
        : "Planned work";
  }
  function propose(
    item: CalendarItem,
    delta: number,
    operation: "move" | "start" | "end",
  ) {
    try {
      onpropose({
        path: resourcePath(target(item)),
        version: item.version,
        schedule: shiftedSchedule(
          { start: item.start, end: item.end },
          delta,
          operation,
        ),
      });
    } catch (e) {
      error = String(e);
    }
  }
  function calendarDelta(x: number, y: number, startX: number, startY: number) {
    const dayAt = (x: number, y: number) =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-calendar-day]"),
      ).find((node) => {
        const rect = node.getBoundingClientRect();
        return (
          x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
        );
      })?.dataset.calendarDay;
    const from = dayAt(startX, startY),
      to = dayAt(x, y);
    return from && to ? dayDistance(from, to) : 0;
  }
  function itemFor(row: Summary): CalendarItem {
    return {
      item_id: row.id,
      kind: "card_schedule",
      resource_id: row.id,
      project_id: row.project_id,
      title: row.title,
      version: row.version,
      start: row.schedule!.start,
      end: row.schedule!.end,
    };
  }
</script>

<div class="date-toolbar">
  {#if view === "calendar"}<label
      >Calendar layout<select aria-label="Calendar layout" bind:value={mode}
        ><option value="month">Month</option><option value="week">Week</option
        ><option value="agenda">Agenda</option></select
      ></label
    >{#if mode === "week"}<label
        >Week in month<select aria-label="Week in month" bind:value={week}
          >{#each Array.from({ length: calendarDays.length / 7 }, (_, i) => i) as n}<option
              value={n}>{n + 1}</option
            >{/each}</select
        ></label
      >{/if}
  {:else}<label
      >Timeline scale<select bind:value={scale}
        ><option value="days">Days</option><option value="weeks">Weeks</option
        ><option value="months">Month overview</option></select
      ></label
    >{/if}
</div>
{#if error}<p role="alert">{error}</p>{/if}
{#if loading}<p role="status">Loading dates…</p>{/if}
{#if view === "calendar"}
  {#if mode === "agenda"}<div class="agenda">
      {#each matchingItems as item}<button onclick={() => open(target(item))}
          ><strong>{item.title}</strong> · {label(item)} · {item.start}{item.end !==
          item.start
            ? ` – ${item.end}`
            : ""}</button
        >{:else}{#if !loading && !error}<p>
            No dated items in this month.
          </p>{/if}{/each}
    </div>
  {:else}<div class="date-scroll">
      <div class="month-grid">
        {#if mode === "month"}{#each Array.from({ length: padding }) as _}<div
              class="padding"
            ></div>{/each}{/if}
        {#each shownDays as day}{@const events = matchingItems.filter(
            (item) => item.start <= day && item.end >= day,
          )}
          <section class="day" data-calendar-day={day}>
            <header>
              {new Date(`${day}T12:00:00Z`).toLocaleDateString("en", {
                weekday: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </header>
            {#each events.slice(0, 4) as item}<div
                class="event"
                data-kind={item.kind}
              >
                <button class="event-title" onclick={() => open(target(item))}
                  ><small>{label(item)}</small>{item.title}</button
                >
                {#if item.kind === "card_schedule"}<button
                    class="handle"
                    aria-label={`Move plan: ${item.title}`}
                    use:dateGesture={{
                      delta: calendarDelta,
                      commit: (days) => propose(item, days, "move"),
                    }}
                    onclick={() => propose(item, 0, "move")}>↔</button
                  >{/if}
              </div>{/each}
            {#if events.length > 4}<button onclick={() => (mode = "agenda")}
                >+{events.length - 4} more · agenda</button
              >{/if}
          </section>{/each}
      </div>
    </div>{/if}
{:else if !project}<p>
    Select one project to see its timeline and dependencies.
  </p>
{:else}<div class="date-scroll">
    <div
      class="gantt"
      style={`--unit:${unit}px;--span:${days.length * unit}px`}
    >
      <div class="gantt-header">
        <strong>Scheduled work</strong>
        <div class="ticks">
          {#each days as day}<span>{Number(day.slice(-2))}</span>{/each}
        </div>
      </div>
      {#each scheduledRows as row}{@const item = itemFor(row)}{@const first =
          Math.max(0, dayDistance(days[0], item.start))}{@const last = Math.min(
          days.length,
          dayDistance(days[0], item.end) + 1,
        )}
        <div class="gantt-row">
          <button class="row-title" onclick={() => open(row)}
            >{row.title}</button
          >
          <div class="track">
            <div
              class="bar"
              style={`left:${first * unit}px;width:${Math.max(unit, (last - first) * unit)}px`}
            >
              <button
                class="handle"
                aria-label={`Resize start: ${row.title}`}
                use:dateGesture={{
                  delta: (x, _y, startX) => Math.round((x - startX) / unit),
                  commit: (days) => propose(item, days, "start"),
                }}
                onclick={() => propose(item, 0, "start")}>‹</button
              ><button
                class="handle move"
                aria-label={`Move plan: ${row.title}`}
                use:dateGesture={{
                  delta: (x, _y, startX) => Math.round((x - startX) / unit),
                  commit: (days) => propose(item, days, "move"),
                }}
                onclick={() => propose(item, 0, "move")}>{row.title}</button
              ><button
                class="handle"
                aria-label={`Resize end: ${row.title}`}
                use:dateGesture={{
                  delta: (x, _y, startX) => Math.round((x - startX) / unit),
                  commit: (days) => propose(item, days, "end"),
                }}
                onclick={() => propose(item, 0, "end")}>›</button
              >
            </div>
            {#if row.due && row.due.date >= days[0] && row.due.date <= days.at(-1)!}<button
                class="deadline"
                style={`left:${dayDistance(days[0], row.due.date) * unit}px`}
                onclick={() => open(row)}
                aria-label={`${row.due.kind} deadline: ${row.title}`}>◆</button
              >{/if}
          </div>
        </div>{/each}
      {#each matchingRows.filter((row) => row.type === "milestone" && row.due && row.due.date >= days[0] && row.due.date <= days.at(-1)!) as row}
        <div class="gantt-row">
          <button class="row-title" onclick={() => open(row)}
            >Milestone · {row.title}</button
          >
          <div class="track">
            <button
              class="deadline"
              style={`left:${dayDistance(days[0], row.due!.date) * unit}px`}
              onclick={() => open(row)}
              aria-label={`${row.due!.kind} milestone deadline: ${row.title}`}
              >◆</button
            >
          </div>
        </div>
      {/each}
      {#if visibleEdges.length}<svg
          class="dependency-lines"
          width={200 + days.length * unit}
          height={32 + scheduledRows.length * 64}
          role="img"
          aria-label="Finish-to-start dependencies"
        >
          <defs
            ><marker
              id="dependency-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto-start-reverse"
              ><path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" /></marker
            ></defs
          >
          {#each visibleEdges as edge}<path
              d={edgePath(edge)}
              fill="none"
              stroke={edge.warning ? "#b34d3b" : "currentColor"}
              stroke-width="1.5"
              marker-end="url(#dependency-arrow)"
            />{/each}
        </svg>{/if}
    </div>
  </div>
  <section>
    <h3>Unscheduled cards</h3>
    {#each matchingRows.filter((row) => row.type === "card" && !row.schedule) as row}<button
        onclick={() => open(row)}>{row.title} · Set planned dates</button
      >{:else}<p>No unscheduled cards in this page.</p>{/each}
  </section>
  {#if edges.length}<details>
      <summary>Dependencies · {edges.length}</summary>{#each edges as edge}<p>
          {rows.find((row) => row.id === edge.from)?.title ?? edge.from} → {rows.find(
            (row) => row.id === edge.to,
          )?.title ?? edge.to}{edge.outside_page
            ? " · outside this page"
            : ""}{edge.warning ? ` · ${edge.warning}` : ""}
        </p>{/each}
    </details>{/if}
{/if}
{#if cursor}<button disabled={loading} onclick={() => load(true)}
    >Next page of dated resources</button
  >{/if}
{#if paged}<button disabled={loading} onclick={() => load(false)}
    >First page</button
  >{/if}

<style>
  .date-toolbar {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
  }
  .date-toolbar label {
    display: grid;
    gap: 6px;
  }
  .date-scroll {
    overflow: auto;
    max-width: 100%;
    overscroll-behavior: contain;
  }
  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(100px, 1fr));
    min-width: 760px;
    background: var(--line);
    gap: 1px;
    border: 1px solid var(--line);
  }
  .day,
  .padding {
    background: var(--paper);
    min-height: 140px;
    padding: 6px;
  }
  .day header {
    font-size: 12px;
    margin-bottom: 8px;
  }
  .event {
    background: #e4eee7;
    border-left: 3px solid #44765b;
    margin: 4px 0;
    padding: 3px;
    display: flex;
    align-items: center;
  }
  .event[data-kind$="due"] {
    border-color: #a64a3f;
    background: #f6e7df;
  }
  .event[data-kind$="review"] {
    border-color: #7b6597;
    background: var(--review-bg);
  }
  .event-title {
    border: 0;
    background: none;
    text-align: left;
    min-width: 0;
    overflow-wrap: anywhere;
    flex: 1;
  }
  .event-title small {
    display: block;
    font-size: 10px;
  }
  .handle {
    touch-action: none;
    min-width: 44px;
    min-height: 44px;
    padding: 4px;
    cursor: grab;
    border: 0;
    background: transparent;
    position: relative;
    z-index: 1;
  }
  .handle:global([data-dragging]) {
    z-index: 10;
    background: var(--paper);
    box-shadow: 0 2px 8px #0003;
  }
  .agenda {
    display: grid;
    gap: 8px;
  }
  .agenda button {
    text-align: left;
  }
  .dependency-lines {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 2;
    color: var(--muted);
  }
  .gantt-row {
    height: 64px;
  }
  .row-title {
    overflow: hidden;
  }
  .gantt {
    position: relative;
    width: calc(200px + var(--span));
    min-width: 100%;
  }
  .gantt-row,
  .gantt-header {
    display: grid;
    grid-template-columns: 200px var(--span);
    min-height: 64px;
    border-bottom: 1px solid var(--line);
  }
  .gantt-header {
    min-height: 32px;
  }
  .row-title,
  .gantt-header > strong {
    position: sticky;
    left: 0;
    z-index: 3;
    background: var(--paper);
    text-align: left;
    padding: 12px;
  }
  .ticks {
    display: flex;
  }
  .ticks span {
    width: var(--unit);
    flex-shrink: 0;
    text-align: center;
    font-size: 11px;
  }
  .track {
    position: relative;
    background: repeating-linear-gradient(
      to right,
      transparent 0,
      transparent calc(var(--unit) - 1px),
      var(--line) calc(var(--unit) - 1px),
      var(--line) var(--unit)
    );
  }
  .bar {
    position: absolute;
    top: 8px;
    display: flex;
    min-height: 44px;
    background: #c8ddcf;
    border: 1px solid #8ca998;
    border-radius: 6px;
  }
  .bar .move {
    flex: 1;
    min-width: 44px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .deadline {
    position: absolute;
    bottom: 0;
    color: #a64a3f;
    border: 0;
    padding: 0;
    background: none;
  }
  .gantt-row {
    overflow: visible;
  }
  section > button {
    margin: 4px;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
    }
  }
</style>
