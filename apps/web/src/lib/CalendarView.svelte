<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Calendar, DayGrid, List, Interaction } from "@event-calendar/core";
  import "@event-calendar/core/index.css";
  import { cursorPage, type Page } from "./pagination";
  import { isAbortError } from "./read-requests";
  import { projectionNotice } from "./projection-state";
  import { api, resourcePath, type Summary } from "./api";
  import { shiftDate, shiftedSchedule } from "./dates";
  import {
    calendarTarget,
    calendarLabel,
    dateOnly,
    inclusiveSchedule,
    type CalendarItem,
  } from "./planning";
  import type { DateProposal } from "./proposals";
  import {
    calendarWidgetView,
    isCalendarDate,
    navigateCalendar,
    type CalendarLayout,
  } from "./planning-navigation";
  let {
    project,
    calendarDate,
    calendarLayout,
    workspaceToday,
    onCalendarNavigate,
    revision,
    weekStart,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    calendarDate: string;
    calendarLayout: CalendarLayout;
    workspaceToday: string;
    onCalendarNavigate: (date: string, layout: CalendarLayout) => void;
    revision: number;
    weekStart: string;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (s: { start: string; end: string }) => void;
  } = $props();
  const mode = $derived(calendarLayout),
    date = $derived(calendarDate);
  let compact = $state(false),
    mobileMonthGrid = $state(false);
  const widgetView = $derived(
    calendarWidgetView(mode, compact, mobileMonthGrid),
  );
  const monthAgenda = $derived(widgetView === "listMonth");
  const monthGrid = $derived(widgetView === "dayGridMonth");
  let items = $state<CalendarItem[]>([]),
    range = $state({
      start: untrack(() => calendarDate),
      end: untrack(() => calendarDate),
    });
  let loading = $state(false),
    error = $state(""),
    cursor = $state<string | null>(null),
    paged = $state(false),
    active = $state(false);
  let freshness = $state(""), pageNotice = $state("");
  let readController: AbortController | undefined;
  let readKey = "", pageStart: string | null = null;
  let loadedScope = $state("");
  const queryScope = $derived(`${project}:${range.start}:${range.end}`);
  // A background read keeps the displayed, versioned projection interactive.
  // Scope changes still disable old events until their own page arrives.
  const ready = $derived(loadedScope === queryScope && !error);
  let generation = 0,
    deferred = false,
    cancelled = false,
    pointer: number | null = null,
    reset = $state(0);
  let options = $state<Calendar.Options>({
    view: untrack(() => calendarWidgetView(calendarLayout, false, false)),
    date: untrack(() => calendarDate),
    headerToolbar: { start: "", center: "", end: "" },
    height: "auto",
    locale: "en-GB",
    firstDay: 1,
    editable: true,
    eventResizableFromStart: true,
    eventLongPressDelay: 350,
    longPressDelay: 350,
    dragScroll: true,
    dayMaxEvents: true,
    noEventsContent: "No dated items in this period.",
    eventDurationEditable: true,
    selectable: false,
    buttonText: { today: "Today", close: "Close" },
    datesSet: (info) => {
      const next = {
        start: dateOnly(info.start),
        end: shiftDate(dateOnly(info.end), -1),
      };
      if (next.start !== range.start || next.end !== range.end) range = next;
    },
    dateClick: (info) => {
      if (project && !cancelled)
        oncreate({ start: dateOnly(info.date), end: dateOnly(info.date) });
    },
    select: (info) => {
      if (project && !cancelled) {
        oncreate(inclusiveSchedule(info.start, info.end));
        reset++;
      }
    },
    eventClick: (info) => {
      const item = info.event.extendedProps.astra as CalendarItem;
      if (!cancelled) open(calendarTarget(item));
    },
    eventDrop: change,
    eventResize: change,
  });
  $effect(() => {
    options.view = widgetView;
    // EventCalendar limits stacked events to the day cell's measured height.
    // An auto-height uniform month instead grows every week to its busiest day.
    options.height = monthGrid
      ? compact
        ? "740px"
        : "clamp(600px, calc(100dvh - 260px), 820px)"
      : monthAgenda
        ? "clamp(400px, calc(100dvh - 240px), 680px)"
        : "auto";
    options.dayMaxEvents = monthGrid;
  });
  $effect(() => {
    if (isCalendarDate(date)) options.date = date;
  });
  $effect(() => {
    options.firstDay = weekStart === "sunday" ? 0 : 1;
  });
  $effect(() => {
    options.selectable = !!project && ready;
  });
  $effect(() => {
    if (active) return;
    options.events = items
      .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
      .map((item) => ({
        id: `${item.project_id}:${item.item_id}`,
        start: item.start,
        end: shiftDate(item.end, 1),
        allDay: true,
        title: item.title,
        editable: item.kind === "card_schedule" && ready,
        startEditable: item.kind === "card_schedule" && ready,
        durationEditable: item.kind === "card_schedule" && ready,
        extendedProps: { astra: item },
        backgroundColor: item.kind.endsWith("due")
          ? "var(--calendar-due-bg)"
          : item.kind.endsWith("review")
            ? "var(--calendar-review-bg)"
            : "var(--calendar-plan-bg)",
        textColor: "var(--ink)",
      }));
  });
  $effect(() => {
    void project;
    void revision;
    void range;
    untrack(() => void load(false));
  });
  async function load(more: boolean) {
    const key = queryScope;
    if (loading && key === readKey && !more) { deferred = true; return; }
    if (active) { deferred = true; return; }
    const current = ++generation;
    const target = more ? cursor : key === readKey ? pageStart : null;
    readController?.abort();
    readController = new AbortController();
    const signal = readController.signal;
    readKey = key;
    loading = true; error = "";
    try {
      const result = await cursorPage((page) => api<Page<CalendarItem>>(
        `/api/v1/views/calendar?from=${range.start}&to=${range.end}${project ? `&project_id=${project}` : ""}&limit=1000${page ? `&cursor=${encodeURIComponent(page)}` : ""}`,
        "GET", undefined, {}, { signal },
      ), target);
      if (current !== generation) return;
      if (active) { deferred = true; return; }
      items = result.value.items;
      loadedScope = key;
      cursor = result.value.page.next_cursor;
      pageStart = result.reset ? null : target;
      paged = pageStart !== null;
      freshness = projectionNotice(result.value);
      pageNotice = result.reset ? "The calendar changed. Showing the first page of the latest results." : "";
    } catch (e) {
      if (current === generation && !isAbortError(e)) error = String(e);
    } finally {
      if (current === generation) {
        loading = false;
        if (deferred && !active) { deferred = false; void load(false); }
      }
    }
  }
  function change(info: Calendar.EventDropInfo | Calendar.EventResizeInfo) {
    const item = info.oldEvent.extendedProps.astra as CalendarItem;
    try {
      const schedule = inclusiveSchedule(info.event.start, info.event.end);
      info.revert();
      if (
        !cancelled &&
        item.kind === "card_schedule" &&
        (schedule.start !== item.start || schedule.end !== item.end)
      )
        onpropose({
          path: resourcePath(calendarTarget(item)),
          version: item.version,
          schedule,
        });
    } catch (e) {
      info.revert();
      error = String(e);
    }
  }
  function navigate(delta: number) {
    if (active) return;
    try {
      onCalendarNavigate(navigateCalendar(date, mode, delta), mode);
    } catch (e) {
      error = String(e);
    }
  }
  function today() {
    if (!active && isCalendarDate(workspaceToday))
      onCalendarNavigate(workspaceToday, mode);
  }
  function changeDate(input: HTMLInputElement) {
    if (isCalendarDate(input.value)) onCalendarNavigate(input.value, mode);
    else input.value = date;
  }
  function changeLayout(value: CalendarLayout) {
    if (!active) onCalendarNavigate(date, value);
  }
  function shortcutRegion(node: HTMLElement) {
    node.addEventListener("keydown", shortcuts);
    return { destroy: () => node.removeEventListener("keydown", shortcuts) };
  }
  function shortcuts(event: KeyboardEvent) {
    if (
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
    }
    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      today();
    }
    if (["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      changeLayout(
        (["day", "week", "month", "agenda"] as const)[Number(event.key) - 1],
      );
    }
  }
  function eventAccess(node: HTMLElement, item: CalendarItem) {
    const parent = node.closest<HTMLElement>("article, [role=button]");
    const label = () => {
      parent?.setAttribute(
        "aria-label",
        `${calendarLabel(item)}: ${item.title}`,
      );
      parent?.setAttribute("data-source-version", item.version);
    };
    const key = (event: KeyboardEvent) => eventKey(event, item);
    label();
    parent?.addEventListener("keydown", key, true);
    return {
      update: (next: CalendarItem) => {
        item = next;
        label();
      },
      destroy: () => parent?.removeEventListener("keydown", key, true),
    };
  }
  function eventKey(event: KeyboardEvent, item: CalendarItem) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopImmediatePropagation();
      open(calendarTarget(item));
    }
    if (
      ready &&
      !error &&
      event.altKey &&
      ["ArrowLeft", "ArrowRight"].includes(event.key) &&
      item.kind === "card_schedule"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onpropose({
        path: resourcePath(calendarTarget(item)),
        version: item.version,
        schedule: shiftedSchedule(
          item,
          (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1),
          "move",
        ),
      });
    }
  }
  function guard(node: HTMLElement) {
    const down = (event: PointerEvent) => {
      if (pointer !== null && pointer !== event.pointerId) {
        cancel();
        return;
      }
      if (!node.contains(event.target as Node) || event.button !== 0) return;
      pointer = event.pointerId;
      cancelled = false;
      active = true;
    };
    const release = () => {
      queueMicrotask(() => {
        pointer = null;
        active = false;
        if (deferred) {
          deferred = false;
          void load(false);
        }
      });
    };
    const cancel = () => {
      if (pointer === null) return;
      cancelled = true;
      reset++;
      release();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("orientationchange", cancel);
    window.addEventListener("keydown", key, true);
    return {
      destroy: () => {
        window.removeEventListener("pointerdown", down, true);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", cancel, true);
        window.removeEventListener("orientationchange", cancel);
        window.removeEventListener("keydown", key, true);
      },
    };
  }
  onMount(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => (compact = media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      generation++;
      readController?.abort();
      media.removeEventListener("change", update);
    };
  });
</script>

<!-- Shortcuts are scoped to the planning region and never intercept text editing. -->
<section
  class="calendar-region"
  aria-label="Calendar planning"
  tabindex="-1"
  use:shortcutRegion
>
  <div class="toolbar">
    <div class="navigation">
      <button aria-label="Previous calendar period" onclick={() => navigate(-1)}
        >←</button
      ><button onclick={today}>Today</button><button
        aria-label="Next calendar period"
        onclick={() => navigate(1)}>→</button
      >
    </div>
    <label class="date-control"
      >Go to date<input
        type="date"
        value={date}
        onchange={(e) => changeDate(e.currentTarget)}
        required
      /></label
    >
    <label
      >Calendar layout<select
        aria-label="Calendar layout"
        value={mode}
        onchange={(e) => changeLayout(e.currentTarget.value as CalendarLayout)}
        ><option value="day">Day</option><option value="week">Week</option
        ><option value="month">Month</option><option value="agenda"
          >Agenda</option
        ></select
      ></label
    >
    <button
      class="create-scheduled"
      disabled={!project || !isCalendarDate(date)}
      onclick={() => oncreate({ start: date, end: date })}
      >New scheduled card</button
    >
  </div>
  <div class="view-meta">
    <p class="legend">
      <span>▬ Plan</span><span>◆ Deadline</span><span>◉ Review</span>
    </p>
    <details class="help">
      <summary>Calendar shortcuts & editing</summary>
      <p>
        Drag planned work to move it; drag either edge to resize. On touch, hold
        a plan to select it. Click a day or select a range to create a card.
        Enter opens a focused item. Alt+←/→ on a plan moves it one day; Shift
        changes a week. Elsewhere in this view, Alt+←/→ navigates, Alt+T opens
        today, and Alt+1/2/3/4 selects day/week/month/agenda. Escape cancels a
        gesture.
      </p>
    </details>
  </div>
  {#if compact && mode === "month"}<div class="mobile-month-mode">
      <span>{monthAgenda ? "Month agenda" : "Month grid"}</span>
      <button onclick={() => (mobileMonthGrid = !mobileMonthGrid)}>
        {monthAgenda ? "Show month grid" : "Show month agenda"}
      </button>
    </div>{/if}
  {#if !project}<p>
      Select a project to create a card. Existing items from all projects can be
      edited.
    </p>{/if}
{#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
  {#if pageNotice}<p role="status" class="hint">{pageNotice}</p>{/if}
    {#if error}<p role="alert">
      {error} <button onclick={() => load(false)}>Reload calendar</button>
    </p>{/if}
  <div
    class="calendar-surface"
    aria-busy={loading}
    class:month={monthGrid}
    class:agenda={monthAgenda || mode === "agenda"}
    use:guard
  >
    {#if loading}<p class="loading-indicator" role="status">Loading calendar…</p>{/if}
    {#key reset}<Calendar plugins={[DayGrid, List, Interaction]} {options}>
        {#snippet dayCellContent({ date: day })}
          <span
            data-workspace-today={dateOnly(day) === workspaceToday}
            aria-current={dateOnly(day) === workspaceToday ? "date" : undefined}
          >
            {monthAgenda || mode === "agenda"
              ? new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(
                  day,
                )
              : day.getDate()}
          </span>
        {/snippet}
        {#snippet eventContent({ event })}
          {@const item = event.extendedProps.astra as CalendarItem | undefined}
          {#if item}
          <div
            class="calendar-item"
            data-calendar-item={item.item_id}
            use:eventAccess={item}
          >
            <small
              >{item.kind.endsWith("due")
                ? "◆"
                : item.kind.endsWith("review")
                  ? "◉"
                  : "▬"}
              {calendarLabel(item)}</small
            ><strong>{item.title}</strong>
          </div>
          {/if}
        {/snippet}
      </Calendar>{/key}
  </div>
  {#if cursor}<button disabled={loading} onclick={() => load(true)}
      >Next page of dated resources</button
    >{/if}
  {#if paged}<button disabled={loading} onclick={() => { pageStart = null; void load(false); }}
      >First page</button
    >{/if}
</section>

<style>
  .calendar-region {
    --calendar-plan-bg: color-mix(in srgb, var(--accent) 18%, var(--paper));
    --calendar-due-bg: color-mix(in srgb, #ad6b35 18%, var(--paper));
    --calendar-review-bg: color-mix(in srgb, #8866aa 18%, var(--paper));
  }
  .toolbar,
  .navigation,
  .legend {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: end;
  }
  .toolbar {
    margin-bottom: 10px;
  }
  .navigation {
    gap: 4px;
    flex-wrap: nowrap;
  }
  .navigation button {
    min-width: 44px;
  }
  .create-scheduled {
    margin-left: auto;
  }
  .view-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-bottom: 12px;
  }
  label {
    display: grid;
    gap: 5px;
    font-size: 12px;
    min-width: 0;
  }
  input,
  select {
    min-width: 0;
    max-width: 100%;
  }
  input,
  select,
  button {
    min-height: 44px;
  }
  .legend {
    color: var(--muted);
    font-size: 12px;
    gap: 14px;
    margin: 0;
  }
  .help {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
  }
  .help p {
    max-width: 850px;
    line-height: 1.6;
  }
  .mobile-month-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .calendar-surface {
    position: relative;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
  }
  .loading-indicator {
    position: absolute;
    top: 4px;
    right: 8px;
    z-index: 5;
    margin: 0;
    padding: 4px 8px;
    background: var(--paper);
    color: var(--muted);
    font-size: 12px;
    pointer-events: none;
  }
  .calendar-surface :global(.ec) {
    --ec-bg-color: var(--paper);
    --ec-text-color: var(--ink);
    --ec-border-color: var(--line);
    /* The library's local-clock Today class must not contradict workspace dates. */
    --ec-today-bg-color: transparent;
    --ec-event-bg-color: var(--calendar-plan-bg);
    --ec-event-text-color: var(--ink);
    --ec-button-bg-color: var(--paper);
    --ec-button-text-color: var(--ink);
    --ec-list-day-bg-color: var(--wash);
    font: inherit;
    min-height: 400px;
  }
  .calendar-surface :global(.ec-day:has([data-workspace-today="true"])) {
    background-color: color-mix(in srgb, var(--accent) 7%, var(--paper));
  }
  .calendar-surface :global([data-workspace-today="true"]) {
    color: var(--ink);
    font-weight: 700;
  }
  .month :global(.ec) {
    min-width: 640px;
  }
  .calendar-surface :global(.ec-day) {
    min-height: 115px;
  }
  .month :global(.ec-day) {
    min-height: 0;
  }
  .month :global(.ec-day-foot a) {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    padding: 0 4px;
    color: var(--ink);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .calendar-surface :global(.ec-popup) {
    min-inline-size: min(300px, 80vw);
    max-inline-size: min(440px, 90vw);
    border-radius: 8px;
    z-index: 5;
  }
  .calendar-surface :global(.ec-popup .ec-day-head a) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }
  .calendar-surface :global(.ec-event) {
    border-radius: 5px;
    box-shadow: none;
    border-left: 3px solid color-mix(in srgb, var(--accent) 65%, var(--paper));
  }
  .calendar-surface :global(.ec-event-title) {
    padding: 2px 4px;
  }
  .calendar-item {
    min-height: 38px;
    overflow: hidden;
    cursor: pointer;
  }
  small {
    display: block;
    font-size: 10px;
    opacity: 0.8;
  }
  strong {
    font-size: 12px;
    font-weight: 550;
    white-space: nowrap;
  }
  .agenda strong,
  .calendar-surface :global(.ec-popup strong) {
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .agenda :global(.ec-day) {
    min-height: 0;
  }
  .agenda :global(.ec-main) {
    display: block;
    min-height: 0;
    overflow-y: auto;
  }
  .agenda :global(.ec-event-tag) {
    display: none;
  }
  .calendar-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  @media (max-width: 720px) {
    .toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }
    .navigation {
      order: 0;
    }
    .create-scheduled {
      order: 1;
      margin-left: 0;
      padding-inline: 8px;
    }
    .toolbar label {
      order: 2;
    }
    .toolbar input,
    .toolbar select {
      width: 100%;
    }
    .view-meta {
      gap: 8px;
    }
    .legend {
      gap: 12px;
    }
    .calendar-surface:not(.month) :global(.ec) {
      min-width: 0;
    }
    .calendar-item {
      min-height: 44px;
    }
    .month :global(.ec-day-foot a) {
      min-height: 44px;
    }
  }
</style>
