<script lang="ts">
  import { revealLayers } from "../../lib/ui/motion-layers";
  import { calendarLayers, metaLayers } from "./calendar-motion";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { countedDatedItems, formatCivilRange } from "../../lib/ui/locale.ts";
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
  import { shiftDate } from "./dates";
  import {
    calendarTarget,
    calendarLabel,
    goalItems,
    inclusiveSchedule,
    type CalendarItem,
  } from "./planning";
  import { dateOnly, isCalendarDate } from "./widget-dates";
  import type { DateProposal } from "./proposals";
  import {
    calendarEventAccess,
    calendarGestureGuard,
    calendarShortcuts,
  } from "./calendar-keyboard";
  import {
    calendarWidgetView,
    navigateCalendar,
    type CalendarLayout,
    type PlanningScope,
  } from "./planning-navigation";

  let {
    project,
    goals,
    scope,
    onscope,
    calendarDate,
    calendarLayout,
    workspaceToday,
    workspaceTimezone,
    onCalendarNavigate,
    revision,
    writePending,
    weekStart,
    search,
    open,
    onpropose,
    oncreate,
  }: {
    project: string;
    goals: Summary[];
    scope: PlanningScope;
    onscope: (scope: PlanningScope) => void;
    calendarDate: string;
    calendarLayout: CalendarLayout;
    workspaceToday: string;
    workspaceTimezone: string;
    onCalendarNavigate: (date: string, layout: CalendarLayout) => void;
    revision: number;
    writePending: boolean;
    weekStart: string;
    search: string;
    open: (row: Pick<Summary, "id" | "type" | "project_id">) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (initial: Partial<CardCreate>) => void;
  } = $props();
  const mode = $derived(calendarLayout);
  // Goals come with the workspace's goal list; only cards are read per period.
  const goalScope = $derived(scope === "goals");
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
  let cardItems = $state.raw<CalendarItem[]>([]);
  const items = $derived(goalScope ? goalItems(goals) : cardItems);
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
  // Route publication can rerun prop getters without changing this query.
  const readScope = $derived(`${scope}:${queryScope}:${revision}`);
  // A background read keeps the displayed, versioned projection interactive.
  // Scope changes still disable old events until their own page arrives.
  const ready = $derived(
    goalScope || (loadedScope === queryScope && !error && !writePending),
  );
  const reads = new PlanningRead((value) => {
    loading = value;
  });
  let cancelled = false;
  let reset = $state(0);
  let gestureRevision = $state(0);
  let projectedGesture = -1;
  let displayedDate = $state(untrack(() => calendarDate));
  let events = $state.raw<Calendar.EventInput[]>([]);
  const projectEvents = calendarEventProjection();
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long" });
  const callbacks: Calendar.Options = {
    headerToolbar: { start: "", center: "", end: "" },
    locale: "pl-PL",
    scrollTime: "08:00:00",
    editable: true,
    eventResizableFromStart: true,
    eventLongPressDelay: 350,
    longPressDelay: 350,
    dragScroll: true,
    allDayContent: "Cały dzień",
    moreLinkContent: ({ num }) => `+${num} więcej`,
    noEventsContent: "Brak elementów z datą w tym okresie.",
    eventDurationEditable: true,
    buttonText: { today: "Dzisiaj", close: "Zamknij" },
    datesSet: (info) => {
      const next = {
        start: dateOnly(info.start),
        end: shiftDate(dateOnly(info.end), -1),
      };
      if (next.start !== range.start || next.end !== range.end) range = next;
    },
    dateClick: (info) => {
      if (project && !goalScope && !cancelled)
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
      if (project && !goalScope && !cancelled) {
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
    selectable: !!project && !goalScope && ready,
    events,
  });
  $effect(() => {
    if (isCalendarDate(date)) displayedDate = date;
  });
  $effect(() => {
    if (active) return;
    events = projectEvents(
      items,
      search,
      ready,
      projectedGesture !== gestureRevision,
    );
    projectedGesture = gestureRevision;
  });
  $effect(() => {
    void readScope;
    untrack(() => void load(false));
  });
  async function load(more: boolean) {
    if (goalScope) {
      // A card read still under way would publish into the goal view.
      void reads.run({
        key: "goals",
        read: () => Promise.resolve(),
        apply: () => {},
        failed: () => {},
      });
      error = freshness = pageNotice = "";
      return;
    }
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
        cardItems = result.value.items;
        loadedScope = key;
        cursor = result.value.page.next_cursor;
        pageStart = result.reset ? null : target;
        paged = pageStart !== null;
        freshness = projectionNotice(result.value);
        pageNotice = result.reset
          ? "Kalendarz się zmienił. Wyświetlono pierwszą stronę aktualnych wyników."
          : "";
      },
      failed: (cause) => {
        error = errorMessage(cause);
      },
    });
  }
  function change(info: Calendar.EventDropInfo | Calendar.EventResizeInfo) {
    const item = info.oldEvent.extendedProps.astra as CalendarItem;
    // Native gestures mutate the widget projection; republish owned source snapshots.
    gestureRevision++;
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
            autoCommit: true,
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
          title: item.title,
          autoCommit: true,
        });
    } catch (e) {
      info.revert();
      error = errorMessage(e);
    }
  }
  function navigate(delta: number) {
    if (active) return;
    try {
      onCalendarNavigate(navigateCalendar(date, mode, delta), mode);
    } catch (e) {
      error = errorMessage(e);
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
  const shortcutActions = { navigate, today, layout: changeLayout };
  const eventAccess = calendarEventAccess({
    open: (item) => open(calendarTarget(item)),
    movable: () => ready && !error,
    propose: (proposal) => onpropose(proposal),
  });
  const gestureHooks = {
    started: () => {
      cancelled = false;
      active = true;
      reads.pause(true);
    },
    released: () => {
      active = false;
      reads.pause(false);
    },
    cancelled: () => {
      cancelled = true;
      reset++;
      gestureRevision++;
    },
  };
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
  aria-label="Planowanie w kalendarzu"
  tabindex="-1"
  use:calendarShortcuts={shortcutActions}
>
  <CalendarToolbar
    {date}
    {mode}
    {compact}
    {monthGrid}
    {navigate}
    {today}
    {changeDate}
    {changeLayout}
    {scope}
    changeScope={onscope}
    changeMonthGrid={(grid) => (mobileMonthGrid = grid)}
  />
  {#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
  {#if pageNotice}<p role="status" class="hint">{pageNotice}</p>{/if}
  {#if error}<p>
      <span role="alert">{error}</span>
      <button onclick={() => load(false)}>Wczytaj kalendarz ponownie</button>
    </p>{/if}
  <div
    class="calendar-surface"
    use:revealLayers={{
      ready: ready && !loading,
      key: `${scope}:${project}:${date}:${widgetView}`,
      layers: calendarLayers,
    }}
    aria-busy={loading}
    class:month={monthGrid}
    class:agenda={monthAgenda || mode === "agenda"}
    use:calendarGestureGuard={gestureHooks}
  >
    {#if loading}<p class="loading-indicator" role="status">
        Ładowanie kalendarza…
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
                  >Dzisiaj</span
                >{/if}
            {:else if mode === "month"}
              <span class="day-number">{day.getDate()}</span>
            {/if}
          </span>
        {/snippet}
        {#snippet moreLinkContent({ num })}
          <span class="more-count">+{num}</span><span class="more-label">
            więcej</span
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
              class:goal={item.kind === "project_span"}
              title={`${calendarLabel(item)}: ${item.title}`}
              data-calendar-item={item.item_id}
              use:eventAccess={item}
            >
              <span class="item-time" aria-hidden="true"
                >{item.event
                  ? item.event.start.slice(11)
                  : item.kind.endsWith("due")
                    ? "Termin"
                    : item.kind === "project_span"
                      ? "Cel"
                      : "Cały dzień"}{#if item.event}<span
                    class="time-duration"
                  >
                    · {item.event.duration_minutes} min</span
                  >{/if}</span
              >
              <div class="item-copy">
                <strong
                  ><span class="item-kind" aria-hidden="true"
                    ><Icon
                      name={item.event
                        ? "planned"
                        : item.kind.endsWith("due")
                          ? "flag"
                          : item.kind === "project_span"
                            ? "projects"
                            : "calendar"}
                      small
                    /></span
                  >{item.title}</strong
                >
                <small
                  >{item.event
                    ? `${item.event.duration_minutes} min`
                    : item.kind.endsWith("due")
                      ? "Termin"
                      : item.kind === "project_span"
                        ? formatCivilRange(item.start, item.end)
                        : item.start !== item.end
                          ? "Plan wielodniowy"
                          : "Zaplanowana praca"}</small
                >
              </div>
            </div>
          {/if}
        {/snippet}
      </Calendar>{/key}
  </div>
  <div
    class="view-meta"
    use:revealLayers={{
      ready: ready && !loading,
      key: `${scope}:${project}`,
      layers: metaLayers,
    }}
  >
    {#if goalScope}
      <p class="legend">
        <span><Icon name="projects" small />Cel</span>
      </p>
      <p class="hint goal-hint">
        Cel trwa od najwcześniejszej do najpóźniejszej daty na swoich kartach.
        Zmienia się razem z nimi; tutaj otwiera się go kliknięciem lub Enterem.
        {#if !items.length}Żaden cel nie ma jeszcze kart z datą.{/if}
      </p>
    {:else}
      <p class="legend">
        <span><Icon name="planned" small />Wydarzenie</span><span
          ><Icon name="calendar" small />Plan</span
        ><span><Icon name="flag" small />Termin</span>
      </p>
      <details class="help">
        <summary>Skróty i edycja kalendarza</summary>
        <p>
          Godziny wydarzeń według strefy {workspaceTimezone}. Wybierz godzinę w
          widoku dnia lub tygodnia, aby utworzyć wydarzenie. Karty z samą datą
          pozostają w wierszu całodniowym.
        </p>
        <p>
          Przeciągnij zaplanowaną pracę, aby ją przenieść; przeciągnij krawędź,
          aby zmienić czas trwania. Na ekranie dotykowym przytrzymaj plan, aby
          go wybrać. Kliknij dzień lub zaznacz zakres, aby utworzyć kartę. Enter
          otwiera zaznaczony element. Alt+←/→ przesuwa plan o dzień; Shift
          zmienia tydzień. Poza planem Alt+←/→ zmienia okres, Alt+T otwiera
          dzisiaj, a Alt+1/2/3/4 wybiera dzień/tydzień/miesiąc/agendę. Escape
          anuluje gest.
        </p>
      </details>
    {/if}
  </div>
  {#if !goalScope && (cursor || paged)}<p class="hint">
      Wyświetlono {countedDatedItems(items.length)} z datą na tej stronie.
    </p>{/if}
  {#if cursor && !goalScope}<button
      disabled={loading}
      onclick={() => load(true)}>Następna strona elementów z datą</button
    >{/if}
  {#if paged && !goalScope}<button
      disabled={loading}
      onclick={() => {
        pageStart = null;
        void load(false);
      }}>Pierwsza strona</button
    >{/if}
</section>

<style>
  .item-kind {
    display: inline-flex;
    flex-shrink: 0;
    vertical-align: middle;
    margin-right: var(--space-2);
  }
  .calendar-region {
    --calendar-plan-bg: var(--plan-bg);
    --calendar-due-bg: var(--notice-bg);
    /* One line of an item: compact under a pointer, a full target under a finger. */
    --calendar-chip: var(--calendar-chip-height);
    --calendar-more: var(--space-9);
    min-width: 0;
  }
  @media (pointer: coarse) {
    .calendar-region {
      --calendar-chip: var(--space-14);
      --calendar-more: var(--tap-target);
    }
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
    z-index: var(--layer-raised);
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
    /* The all-day rows arrive after the hours are scrolled to; anchoring would
       slide the first hours under them. */
    overflow-anchor: none;
  }
  .calendar-surface :global(.ec-col-head) {
    padding-block: var(--space-5);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--muted);
    background: var(--paper);
  }
  .calendar-surface :global(.ec-time-grid .ec-col-head) {
    color: var(--ink);
  }
  /* Hours and the all-day label are a quiet scale beside the plan. */
  .calendar-surface :global(.ec-sidebar) {
    color: var(--muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .calendar-surface :global(.ec-col-head time),
  .calendar-surface :global(.ec-day-head time) {
    font-family: var(--font-sans);
  }
  .calendar-surface :global(.ec-day.ec-sat),
  .calendar-surface :global(.ec-day.ec-sun) {
    --ec-day-bg-color: var(--wash);
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
    width: var(--space-10);
    height: var(--space-10);
    border-radius: var(--radius-pill);
    font-size: var(--text-sm);
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
    padding: var(--space-2) var(--space-2) var(--space-1);
  }
  .month :global(.ec-day.ec-other-month .day-number) {
    color: var(--muted);
  }
  .month :global(.ec-day-foot) {
    padding: 0 var(--space-2);
  }
  .month :global(.ec-day-foot a) {
    display: flex;
    width: 100%;
    min-height: var(--calendar-more);
    align-items: center;
    padding-inline: var(--space-3);
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
    margin-block: 0;
    min-inline-size: min(var(--card-min-width), 80vw);
    max-inline-size: min(var(--dialog-small), 90vw);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-floating);
    padding: var(--space-4) var(--space-6) var(--space-6);
    z-index: var(--layer-raised);
  }
  .calendar-surface :global(.ec-popup .ec-day-head) {
    align-items: center;
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-3);
  }
  .calendar-surface :global(.ec-popup .ec-events) {
    padding-inline-end: var(--space-8);
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
    border-left: var(--calendar-rule) solid var(--success);
    padding: 0 var(--space-3);
  }
  .calendar-surface :global(.ec-event:has(.event)) {
    --calendar-plan-bg: var(--accent);
    border-left-color: var(--accent-ink);
  }
  .calendar-surface :global(.ec-event:has(.due)) {
    --calendar-plan-bg: var(--calendar-due-bg);
    border-left-color: var(--notice-ink);
  }
  .item-kind {
    color: var(--success);
  }
  .event .item-kind {
    color: var(--accent-ink);
  }
  .due .item-kind {
    color: var(--notice-ink);
  }
  .item-kind :global(.ui-icon) {
    width: var(--space-7);
    height: var(--space-7);
  }
  /* In a month a timed event is a line of the day, not a bar across it. */
  .month :global(.ec-event:has(.event)) {
    --calendar-plan-bg: transparent;
    border-left-color: transparent;
  }
  .month :global(.ec-event:has(.event):hover) {
    --calendar-plan-bg: var(--soft);
  }
  .calendar-surface :global(.ec-event-body) {
    min-width: 0;
    width: 100%;
  }
  .calendar-item {
    min-height: var(--calendar-chip);
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
    font-size: var(--text-sm);
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
    gap: var(--space-3);
  }
  .month .event > .item-time {
    order: 1;
    color: var(--accent-ink);
  }
  .month .calendar-item small {
    display: none;
  }
  .month .calendar-item:not(.event) > .item-time,
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
    font-size: var(--text-xs);
  }
  .calendar-item.timed {
    padding-block: var(--space-1);
  }
  .timed strong {
    font-weight: var(--weight-semibold);
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
    font-size: var(--text-base);
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
  /* The toolbar already names the month being shown. */
  .agenda :global(.ec-day-head .ec-day-side) {
    display: none;
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
    width: var(--space-20);
    padding-top: var(--space-1);
    font-size: var(--text-sm);
    white-space: nowrap;
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
    font-size: var(--text-base);
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
  @media (max-width: 700px) {
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
      font-size: var(--text-xs);
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
      animation: astra-fade var(--motion-content) var(--motion-emerge);
    }
    .calendar-surface :global(.ec-popup > .ec-day-head) {
      animation: astra-fade var(--motion-heading) var(--motion-emerge)
        var(--motion-popup-heading) backwards;
    }
    .calendar-surface :global(.ec-popup > .ec-events) {
      animation: astra-fade var(--motion-content) var(--motion-emerge)
        var(--motion-popup-content) backwards;
    }
  }
</style>
