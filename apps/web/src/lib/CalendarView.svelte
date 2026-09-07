<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Calendar, DayGrid, List, Interaction } from "@event-calendar/core";
  import "@event-calendar/core/index.css";
  import { api, resourcePath, type Summary } from "./api";
  import { shiftDate, shiftedSchedule } from "./dates";
  import {
    calendarTarget,
    calendarLabel,
    dateOnly,
    widgetDate,
    inclusiveSchedule,
    type CalendarItem,
  } from "./planning";
  import type { DateProposal } from "./proposals";
  let {
    project,
    month,
    revision,
    weekStart,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    month: string;
    revision: number;
    weekStart: string;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (s: { start: string; end: string }) => void;
  } = $props();
  let mode = $state("month"),
    date = $state(untrack(() => `${month}-01`));
  let items = $state<CalendarItem[]>([]),
    range = $state({
      start: untrack(() => `${month}-01`),
      end: untrack(() => `${month}-28`),
    });
  let loading = $state(false),
    error = $state(""),
    cursor = $state<string | null>(null),
    paged = $state(false),
    active = $state(false);
  let generation = 0,
    deferred = false,
    cancelled = false,
    pointer: number | null = null,
    reset = $state(0);
  const viewNames: Record<string, string> = {
    day: "dayGridDay",
    week: "dayGridWeek",
    month: "dayGridMonth",
    agenda: "listWeek",
  };
  let options = $state<Calendar.Options>({
    view: "dayGridMonth",
    date: untrack(() => `${month}-01`),
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
    eventDurationEditable: true,
    selectable: false,
    buttonText: { today: "Today" },
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
    options.view = viewNames[mode];
  });
  $effect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) options.date = date;
  });
  $effect(() => {
    options.firstDay = weekStart === "sunday" ? 0 : 1;
  });
  $effect(() => {
    options.selectable = !!project;
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
        editable: item.kind === "card_schedule" && !loading && !error,
        startEditable: item.kind === "card_schedule" && !loading && !error,
        durationEditable: item.kind === "card_schedule" && !loading && !error,
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
    if (active) {
      deferred = true;
      return;
    }
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const result = await api<{
        items: CalendarItem[];
        page: { next_cursor: string | null };
      }>(
        `/api/v1/views/calendar?from=${range.start}&to=${range.end}${project ? `&project_id=${project}` : ""}&limit=1000${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (current !== generation) return;
      if (active) {
        deferred = true;
        return;
      }
      items = result.items;
      cursor = result.page.next_cursor;
      paged = more;
    } catch (e) {
      if (current === generation) error = String(e);
    } finally {
      if (current === generation) loading = false;
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      today();
      return;
    }
    if (mode === "month") {
      const next = widgetDate(date);
      next.setDate(1);
      next.setMonth(next.getMonth() + delta);
      date = dateOnly(next);
    } else date = shiftDate(date, delta * (mode === "day" ? 1 : 7));
  }
  function today() {
    date = dateOnly(new Date());
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
      mode = ["day", "week", "month", "agenda"][Number(event.key) - 1];
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
      !loading &&
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
  onMount(() => () => {
    generation++;
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
    <label>Go to date<input type="date" bind:value={date} required /></label>
    <label
      >Calendar layout<select aria-label="Calendar layout" bind:value={mode}
        ><option value="day">Day</option><option value="week">Week</option
        ><option value="month">Month</option><option value="agenda"
          >Agenda</option
        ></select
      ></label
    >
    <button
      disabled={!project}
      onclick={() => oncreate({ start: date, end: date })}
      >New scheduled card</button
    >
  </div>
  <p class="legend">
    <span>▬ Planned work</span><span>◆ Deadline</span><span>◉ Review</span><span
      >All-day dates</span
    >
  </p>
  <details class="help">
    <summary>Calendar shortcuts & editing</summary>
    <p>
      Drag planned work to move it; drag either edge to resize. On touch, hold a
      plan to select it. Click a day or select a range to create a card. Enter
      opens a focused item. Alt+←/→ on a plan moves it one day; Shift changes a
      week. Elsewhere in this view, Alt+←/→ navigates, Alt+T opens today, and
      Alt+1/2/3/4 selects day/week/month/agenda. Escape cancels a gesture.
    </p>
  </details>
  {#if !project}<p>
      Select a project to create a card. Existing items from all projects can be
      edited.
    </p>{/if}
  {#if error}<p role="alert">
      {error} <button onclick={() => load(false)}>Reload calendar</button>
    </p>{/if}
  {#if loading}<p role="status">Loading calendar…</p>{/if}
  <div class="calendar-surface" class:month={mode === "month"} use:guard>
    {#key reset}<Calendar plugins={[DayGrid, List, Interaction]} {options}>
        {#snippet eventContent({ event })}
          {@const item = event.extendedProps.astra as CalendarItem}
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
        {/snippet}
      </Calendar>{/key}
  </div>
  {#if cursor}<button disabled={loading} onclick={() => load(true)}
      >Next page of dated resources</button
    >{/if}
  {#if paged}<button disabled={loading} onclick={() => load(false)}
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
    margin-bottom: 16px;
  }
  label {
    display: grid;
    gap: 5px;
  }
  input,
  select,
  button {
    min-height: 44px;
  }
  .legend {
    color: var(--muted);
    font-size: 12px;
    gap: 20px;
  }
  .help {
    font-size: 13px;
    color: var(--muted);
    margin: 12px 0;
  }
  .help p {
    max-width: 850px;
    line-height: 1.6;
  }
  .calendar-surface {
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper);
  }
  .calendar-surface :global(.ec) {
    --ec-bg-color: var(--paper);
    --ec-text-color: var(--ink);
    --ec-border-color: var(--line);
    --ec-today-bg-color: color-mix(in srgb, var(--accent) 7%, var(--paper));
    --ec-event-bg-color: var(--calendar-plan-bg);
    --ec-event-text-color: var(--ink);
    --ec-button-bg-color: var(--paper);
    --ec-button-text-color: var(--ink);
    --ec-list-day-bg-color: var(--wash);
    font: inherit;
    min-height: 400px;
  }
  .month :global(.ec) {
    min-width: 640px;
  }
  .calendar-surface :global(.ec-day) {
    min-height: 115px;
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
  .calendar-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  @media (max-width: 720px) {
    .toolbar {
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
  }
</style>
