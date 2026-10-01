<script lang="ts">
  import type { CardCreate } from "../../lib/contracts/api.generated";
  import { eventFromDates } from "../../lib/resources/timed-event.ts";
  import {
    calendarMetrics,
    compactCalendarQuery,
  } from "../../lib/ui/planning-metrics";
  import { onMount, untrack } from "svelte";
  import {
    Calendar,
    DayGrid,
    TimeGrid,
    List,
    Interaction,
  } from "@event-calendar/core";
  import "@event-calendar/core/index.css";
  import CalendarToolbar from "./CalendarToolbar.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { cursorPage } from "../../lib/api/pagination";
  import { calendarEventProjection } from "./calendar-events";
  import { getCalendar } from "../../lib/api/planning";
  import { PlanningRead } from "./planning-read";
  import { projectionNotice } from "../../lib/api/projection-state";
  import { resourcePath, type Summary } from "../../lib/api/api";
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
    workspaceTimezone,
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
    workspaceTimezone: string;
    onCalendarNavigate: (date: string, layout: CalendarLayout) => void;
    revision: number;
    weekStart: string;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (initial: Partial<CardCreate>) => void;
  } = $props();
  const mode = $derived(calendarLayout);
  const date = $derived(calendarDate);
  let compact = $state(window.matchMedia(compactCalendarQuery).matches);
  let mobileMonthGrid = $state(false);
  const widgetView = $derived(
    calendarWidgetView(mode, compact, mobileMonthGrid),
  );
  const monthAgenda = $derived(widgetView === "listMonth");
  const monthGrid = $derived(widgetView === "dayGridMonth");
  // Agenda repeats each multi-day item on every occupied day. Keep its page
  // bounded like other lists; the grid retains its broader period overview.
  const pageSize = $derived(monthAgenda || mode === "agenda" ? 200 : 1000);
  let items = $state.raw<CalendarItem[]>([]);
  let range = $state({
    start: untrack(() => calendarDate),
    end: untrack(() => calendarDate),
  });
  let loading = $state(false);
  let error = $state("");
  let cursor = $state<string | null>(null);
  let paged = $state(false);
  let active = $state(false);
  let freshness = $state("");
  let pageNotice = $state("");
  let readKey = "";
  let pageStart: string | null = null;
  let loadedScope = $state("");
  const queryScope = $derived(
    `${project}:${range.start}:${range.end}:${pageSize}`,
  );
  // A background read keeps the displayed, versioned projection interactive.
  // Scope changes still disable old events until their own page arrives.
  const ready = $derived(loadedScope === queryScope && !error);
  const reads = new PlanningRead((value) => {
    loading = value;
  });
  let cancelled = false;
  let pointer: number | null = null;
  let reset = $state(0);
  let displayedDate = $state(untrack(() => calendarDate));
  let events = $state.raw<Calendar.EventInput[]>([]);
  const projectEvents = calendarEventProjection();
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
  const callbacks: Calendar.Options = {
    headerToolbar: { start: "", center: "", end: "" },
    locale: "en-GB",
    scrollTime: "08:00:00",
    editable: true,
    eventResizableFromStart: true,
    eventLongPressDelay: 350,
    longPressDelay: 350,
    dragScroll: true,
    noEventsContent: "No dated items in this period.",
    eventDurationEditable: true,
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
        oncreate(
          info.allDay
            ? {
                schedule: {
                  start: dateOnly(info.date),
                  end: dateOnly(info.date),
                },
              }
            : { event: eventFromDates(info.date) },
        );
    },
    select: (info) => {
      if (project && !cancelled) {
        oncreate(
          info.allDay
            ? { schedule: inclusiveSchedule(info.start, info.end) }
            : { event: eventFromDates(info.start, info.end) },
        );
        reset++;
      }
    },
    eventClick: (info) => {
      const item = info.event.extendedProps.astra as CalendarItem;
      if (!cancelled) open(calendarTarget(item));
    },
    eventDrop: change,
    eventResize: change,
  };
  const options = $derived<Calendar.Options>({
    ...callbacks,
    view: widgetView,
    date: displayedDate,
    dayHeaderFormat: monthGrid
      ? { weekday: "short" }
      : { weekday: "short", day: "numeric" },
    listDaySideFormat: { month: "short" },
    slotEventOverlap: false,
    columnWidth:
      compact && mode === "week"
        ? `${calendarMetrics.compactHourColumn}px`
        : undefined,
    // EventCalendar limits stacked events to the day cell's measured height.
    // An auto-height uniform month instead grows every week to its busiest day.
    height: monthGrid
      ? compact
        ? "var(--calendar-mobile-grid-height)"
        : "var(--calendar-grid-height)"
      : monthAgenda
        ? "var(--calendar-agenda-height)"
        : mode === "day" || mode === "week"
          ? "var(--calendar-grid-height)"
          : "auto",
    dayMaxEvents: monthGrid,
    firstDay: weekStart === "sunday" ? 0 : 1,
    selectable: !!project && ready,
    events,
  });
  $effect(() => {
    if (isCalendarDate(date)) displayedDate = date;
  });
  $effect(() => {
    if (active) return;
    events = projectEvents(items, search, ready);
  });
  $effect(() => {
    void project;
    void revision;
    void range;
    void pageSize;
    untrack(() => void load(false));
  });
  async function load(more: boolean) {
    const key = queryScope;
    const scope = {
      project,
      from: range.start,
      to: range.end,
      limit: pageSize,
    };
    const target = more ? cursor : key === readKey ? pageStart : null;
    readKey = key;
    error = "";
    await reads.run({
      key: `${key}:${target ?? ""}`,
      read: (signal) =>
        cursorPage((page) => getCalendar(scope, page, { signal }), target),
      apply: (result) => {
        items = result.value.items;
        loadedScope = key;
        cursor = result.value.page.next_cursor;
        pageStart = result.reset ? null : target;
        paged = pageStart !== null;
        freshness = projectionNotice(result.value);
        pageNotice = result.reset
          ? "The calendar changed. Showing the first page of the latest results."
          : "";
      },
      failed: (cause) => {
        error = String(cause);
      },
    });
  }
  function change(info: Calendar.EventDropInfo | Calendar.EventResizeInfo) {
    const item = info.oldEvent.extendedProps.astra as CalendarItem;
    try {
      if (item.event) {
        const event = !info.event.allDay
          ? eventFromDates(info.event.start, info.event.end)
          : null;
        info.revert();
        if (
          !cancelled &&
          event &&
          JSON.stringify(event) !== JSON.stringify(item.event)
        )
          onpropose({
            path: resourcePath(calendarTarget(item)),
            version: item.version,
            event,
            title: item.title,
          });
        return;
      }
      if (!info.event.allDay) {
        info.revert();
        return;
      }
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
      (item.kind === "card_schedule" || item.kind === "card_event")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onpropose({
        path: resourcePath(calendarTarget(item)),
        version: item.version,
        ...(item.event
          ? {
              event: {
                ...item.event,
                start: `${shiftDate(item.event.start.slice(0, 10), (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1))}T${item.event.start.slice(11)}`,
              },
            }
          : {
              schedule: shiftedSchedule(
                item,
                (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1),
                "move",
              ),
            }),
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
      reads.pause(true);
    };
    const release = () => {
      queueMicrotask(() => {
        pointer = null;
        active = false;
        reads.pause(false);
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
    const media = window.matchMedia(compactCalendarQuery);
    const update = () => (compact = media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      reads.dispose();
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
  <CalendarToolbar
    {date}
    {mode}
    {compact}
    {monthGrid}
    {project}
    {navigate}
    {today}
    {changeDate}
    {changeLayout}
    changeMonthGrid={(grid) => (mobileMonthGrid = grid)}
    create={() => oncreate({ schedule: { start: date, end: date } })}
  />
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
    {#if loading}<p class="loading-indicator" role="status">
        Loading calendar…
      </p>{/if}
    {#key reset}<Calendar
        plugins={[DayGrid, TimeGrid, List, Interaction]}
        {options}
      >
        {#snippet dayCellContent({ date: day })}
          <span
            class="calendar-day-label"
            data-workspace-today={dateOnly(day) === workspaceToday}
            aria-current={dateOnly(day) === workspaceToday ? "date" : undefined}
          >
            {#if monthAgenda || mode === "agenda"}
              <span class="day-number">{day.getDate()}</span>
              <span>{weekday.format(day)}</span>
              {#if dateOnly(day) === workspaceToday}<span class="today-label"
                  >Today</span
                >{/if}
            {:else if mode === "month"}
              <span class="day-number">{day.getDate()}</span>
            {/if}
          </span>
        {/snippet}
        {#snippet moreLinkContent({ num })}
          <span class="more-count">+{num}</span><span class="more-label">
            more</span
          >
        {/snippet}
        {#snippet eventContent({ event })}
          {@const item = event.extendedProps.astra as CalendarItem | undefined}
          {#if item}
            <div
              class="calendar-item"
              class:timed={!!item.event && (mode === "day" || mode === "week")}
              class:event={!!item.event}
              class:short={!!item.event && item.event.duration_minutes <= 30}
              class:due={item.kind.endsWith("due")}
              title={`${calendarLabel(item)}: ${item.title}`}
              data-calendar-item={item.item_id}
              use:eventAccess={item}
            >
              <span class="item-time" aria-hidden="true"
                >{item.event
                  ? item.event.start.slice(11)
                  : item.kind.endsWith("due")
                    ? "Due"
                    : "All day"}{#if item.event}<span class="time-duration">
                    · {item.event.duration_minutes} min</span
                  >{/if}</span
              >
              <div class="item-copy">
                <strong>{item.title}</strong>
                <small
                  >{item.event
                    ? `${item.event.duration_minutes} min`
                    : item.kind.endsWith("due")
                      ? "Due"
                      : item.start !== item.end
                        ? "Multi-day plan"
                        : "Planned work"}</small
                >
              </div>
            </div>
          {/if}
        {/snippet}
      </Calendar>{/key}
  </div>
  <div class="view-meta">
    <p class="legend">
      <span><Icon name="planned" small />Event</span><span
        ><i class="plan-mark"></i>Plan</span
      ><span><Icon name="flag" small />Due</span>
    </p>
    <details class="help">
      <summary>Calendar shortcuts & editing</summary>
      <p>
        Event times use {workspaceTimezone}. Select an hour in Day or Week to
        create an event. Date-only cards stay in the all-day row.
      </p>
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
  {#if cursor || paged}<p class="hint">
      Showing {items.length} dated items on this page.
    </p>{/if}
  {#if cursor}<button disabled={loading} onclick={() => load(true)}
      >Next page of dated resources</button
    >{/if}
  {#if paged}<button
      disabled={loading}
      onclick={() => {
        pageStart = null;
        void load(false);
      }}>First page</button
    >{/if}
</section>

<style>
  .calendar-region {
    --calendar-plan-bg: var(--plan-bg);
    --calendar-due-bg: var(--notice-bg);
    --calendar-mobile-grid-height: clamp(600px, calc(100dvh - 180px), 700px);
    min-width: 0;
  }
  .calendar-surface {
    position: relative;
    overflow: auto;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
  }
  .loading-indicator {
    position: absolute;
    top: var(--space-2);
    right: var(--space-4);
    z-index: 5;
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--paper);
    color: var(--muted);
    font-size: var(--text-sm);
    pointer-events: none;
  }
  .calendar-surface :global(.ec) {
    --ec-bg-color: var(--paper);
    --ec-text-color: var(--ink);
    --ec-border-color: var(--line);
    /* Workspace civil dates own Today, independently of the device's clock. */
    --ec-today-bg-color: transparent;
    --ec-event-bg-color: var(--calendar-plan-bg);
    --ec-event-text-color: var(--ink);
    --ec-button-bg-color: var(--paper);
    --ec-button-text-color: var(--ink);
    --ec-list-day-bg-color: var(--soft);
    --ec-popup-bg-color: var(--paper);
    --ec-event-col-gap: var(--space-2);
    font: inherit;
    min-width: 0;
    min-height: var(--agenda-min-height);
  }
  .calendar-surface :global(.ec-toolbar) {
    display: none;
  }
  .calendar-surface :global(.ec-main) {
    border: 0;
  }
  .calendar-surface :global(.ec-col-head) {
    padding-block: var(--space-6);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--muted);
    background: var(--paper);
  }
  .calendar-surface :global(.ec-col-head time),
  .calendar-surface :global(.ec-day-head time) {
    font-family: var(--font-sans);
  }
  .calendar-surface :global(.ec-day.ec-sat),
  .calendar-surface :global(.ec-day.ec-sun) {
    --ec-day-bg-color: color-mix(in srgb, var(--soft) 50%, var(--paper));
  }
  .calendar-surface :global(.ec-day:has([data-workspace-today="true"])) {
    --ec-day-bg-color: color-mix(in srgb, var(--accent) 25%, var(--paper));
  }
  .calendar-day-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-5);
  }
  .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-11);
    height: var(--space-11);
    border-radius: var(--radius-pill);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }
  [data-workspace-today="true"] .day-number {
    background: var(--accent-ink);
    color: var(--paper);
    font-weight: var(--weight-semibold);
  }
  .today-label {
    color: var(--accent-ink);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
  .month :global(.ec-day) {
    min-height: 0;
  }
  .month :global(.ec-day-head) {
    padding: var(--space-2);
  }
  .month :global(.ec-day-foot) {
    padding: 0 var(--space-2);
  }
  .month :global(.ec-day-foot a) {
    display: flex;
    width: 100%;
    min-height: var(--tap-target);
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    color: var(--muted);
    font-weight: var(--weight-medium);
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }
  .month :global(.ec-day-foot a:hover) {
    background: var(--soft);
    color: var(--accent-ink);
  }
  .calendar-surface :global(.ec-popup) {
    min-inline-size: min(var(--card-min-width), 80vw);
    max-inline-size: min(var(--dialog-small), 90vw);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-floating);
    padding: var(--space-4) var(--space-6) var(--space-6);
    z-index: 5;
  }
  .calendar-surface :global(.ec-popup .ec-day-head) {
    align-items: center;
    font-size: var(--text-label);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-3);
  }
  .calendar-surface :global(.ec-popup .ec-day-head a) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    border-radius: var(--radius-control);
  }
  .calendar-surface :global(.ec-event) {
    border-radius: var(--radius-sm);
    box-shadow: none;
    border-left: var(--space-1) solid var(--success);
    padding: var(--space-1) var(--space-2);
  }
  .calendar-surface :global(.ec-event:has(.event)) {
    --calendar-plan-bg: var(--accent);
    border-left-color: var(--accent-ink);
  }
  .calendar-surface :global(.ec-event:has(.due)) {
    border-left-color: var(--notice-ink);
  }
  .calendar-surface :global(.ec-event-body) {
    min-width: 0;
    width: 100%;
  }
  .calendar-item {
    min-height: var(--space-14);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
    overflow: hidden;
    cursor: pointer;
  }
  .item-copy {
    min-width: 0;
    flex: 1;
  }
  .item-time {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--muted);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }
  .calendar-item strong {
    display: block;
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    line-height: var(--leading-body);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .calendar-item small {
    display: block;
    color: var(--muted);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }
  /* calendar-layout.ts groups these month shapes by their measured single-line
     title and optional time line. Re-review grouping when this structure changes. */
  .month .calendar-item {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0;
  }
  .month .item-copy {
    flex: initial;
    width: 100%;
  }
  .month .calendar-item small {
    display: none;
  }
  .month .calendar-item:not(.event):not(.due) > .item-time,
  .calendar-surface :global(.ec-all-day .item-time),
  .calendar-surface :global(.ec-all-day .calendar-item small) {
    display: none;
  }
  .time-duration {
    display: none;
  }
  .calendar-item.timed {
    min-height: 0;
    height: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
  /* A short event still needs one legible title line; its civil times stay exact. */
  .calendar-surface :global(.ec-time-grid .ec-body .ec-event) {
    min-block-size: var(--space-10) !important;
  }
  .timed.short strong {
    white-space: nowrap;
  }
  .timed.short .item-time {
    display: none;
  }
  .timed .item-time {
    color: var(--accent-ink);
    font-size: var(--text-compact);
  }
  .timed .item-copy {
    flex: initial;
    width: 100%;
    order: -1;
  }
  .timed .time-duration {
    display: inline;
  }
  .timed small {
    display: none;
  }
  .timed strong {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: var(--leading-tight);
  }
  .agenda :global(.ec-day) {
    min-height: 0;
    padding-bottom: var(--space-4);
  }
  .agenda :global(.ec-day-head) {
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--paper);
    font-size: var(--text-label);
    font-weight: var(--weight-semibold);
    border-bottom-color: var(--line);
    margin: 0;
  }
  .agenda .day-number {
    width: var(--space-12);
    height: var(--space-12);
    border-radius: var(--radius-control);
    background: var(--soft);
    font-size: var(--text-lg);
  }
  .agenda [data-workspace-today="true"] .day-number {
    background: var(--accent-ink);
    color: var(--paper);
  }
  .agenda :global(.ec-day-head .ec-day-side) {
    font-size: var(--text-xs);
    font-weight: var(--weight-normal);
    color: var(--muted);
  }
  .agenda :global(.ec-main) {
    display: block;
    min-height: 0;
    overflow-y: auto;
    scroll-padding-block: var(--space-16);
  }
  .agenda :global(.ec-event-tag) {
    display: none;
  }
  .agenda :global(.ec-event) {
    margin: 0 var(--space-6);
    padding: var(--space-4) 0;
    width: auto;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .agenda :global(.ec-event + .ec-event) {
    border-top: var(--stroke) solid var(--line);
  }
  .agenda :global(.ec-event:hover) {
    background: var(--soft);
  }
  .agenda :global(.ec-event-title) {
    padding: 0;
  }
  .agenda .calendar-item {
    align-items: flex-start;
    gap: var(--space-8);
    min-height: var(--tap-target);
  }
  .agenda .item-time {
    width: var(--space-16);
    padding-top: var(--space-1);
    font-size: var(--text-sm);
  }
  .agenda .event .item-time {
    color: var(--accent-ink);
  }
  .agenda .calendar-item strong {
    font-size: var(--text-base);
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .agenda .calendar-item small {
    margin-top: var(--space-1);
  }
  .calendar-surface :global(.ec-popup .calendar-item) {
    flex-direction: row;
    align-items: center;
    gap: var(--space-6);
  }
  .calendar-surface :global(.ec-popup .calendar-item > .item-time) {
    display: inline;
  }
  .calendar-surface :global(.ec-popup .item-time) {
    width: var(--space-16);
  }
  .calendar-surface :global(.ec-popup strong) {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .calendar-surface :global(.ec-popup small) {
    display: block;
  }
  .calendar-surface :global(.ec-no-events) {
    padding: var(--space-20) var(--space-8);
    color: var(--muted);
    font-size: var(--text-label);
  }
  .calendar-surface :global(.ec-event:focus-visible) {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: calc(-1 * var(--focus-width));
  }
  .view-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-8);
    margin-top: var(--space-6);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
    margin: 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .plan-mark {
    width: var(--space-4);
    height: var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--success);
  }
  .help {
    font-size: var(--text-sm);
    color: var(--muted);
    margin: 0;
  }
  .help summary {
    min-height: var(--tap-target);
    align-content: center;
    cursor: pointer;
  }
  .help p {
    max-width: var(--reading-width);
    line-height: var(--leading-body);
  }
  @media (max-width: 720px) {
    .month :global(.ec-col-head) {
      padding-inline: 0;
      font-size: var(--text-xs);
    }
    .month :global(.ec-day-head) {
      justify-content: center;
      padding-inline: 0;
    }
    .month :global(.ec-day-foot) {
      padding-inline: 0;
    }
    .month .more-label {
      position: absolute;
      width: var(--stroke);
      height: var(--stroke);
      overflow: hidden;
      clip-path: inset(50%);
    }
    .month .more-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-2) var(--space-3);
      background: var(--soft);
      border-radius: var(--radius-pill);
    }
    .month .calendar-item strong {
      font-size: var(--text-xs);
    }
    .month .item-time {
      font-size: var(--text-compact);
    }
    .view-meta {
      gap: 0 var(--space-8);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .agenda :global(.ec-event) {
      transition: background-color var(--motion-quick) ease;
    }
    .calendar-surface :global(.ec-popup) {
      animation: astra-fade var(--motion-quick) ease;
    }
  }
</style>
