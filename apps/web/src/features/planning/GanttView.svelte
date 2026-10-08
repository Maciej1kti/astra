<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { revealLayers } from "../../lib/ui/motion-layers";
  import { groupLayers, timelineLayers } from "./calendar-motion";
  import { errorMessage } from "../../lib/api/messages.ts";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import {
    countedDatedItems,
    formatCivilRange,
    uiLocale,
  } from "../../lib/ui/locale";
  import { dayDistance, isCivilDate } from "../../lib/ui/calendar-dates";
  import { timelineMetrics as metrics } from "../../lib/ui/planning-metrics";
  import { resourcePath, type Summary } from "../../lib/api/api";
  import { shiftedSchedule } from "./dates";
  import type { GanttPage } from "./planning";
  import type { DateProposal } from "./proposals";
  import type { DateOperation } from "./date-gesture";
  import TimelineBar from "./TimelineBar.svelte";
  import TimelineRow from "./TimelineRow.svelte";
  import TimelineToolbar from "./TimelineToolbar.svelte";
  import { timelineItems, type TimelineItem } from "./timeline-items";
  import {
    arrivedDates,
    chooseDates,
    settleDates,
    shownDates,
    type DateProposalStep,
    type PendingDates,
  } from "./timeline-pending";
  import {
    axisDate,
    axisSpan,
    calendarSegments,
    dayOffset,
    monthLength,
    shiftMonth,
    timelineAxis,
    timelineScales,
    weekSegments,
    weekday,
    type TimelineScale,
  } from "./timeline-scale";
  import {
    orderedTimelineRows,
    readTimelineOrder,
    writeTimelineOrder,
    moveTimelineRow,
  } from "./timeline-order";
  import { cursorPage } from "../../lib/api/pagination";
  import { getGantt } from "../../lib/api/planning";
  import { PlanningRead } from "./planning-read";
  import { projectionNotice } from "../../lib/api/projection-state";

  let {
    project,
    month,
    revision,
    writePending,
    search,
    weekStart,
    today,
    open,
    onpropose,
    oncreate,
    onmonth,
  }: {
    project: string;
    month: string;
    revision: number;
    writePending: boolean;
    search: string;
    weekStart: string;
    today: string;
    open: (row: Summary) => void;
    onpropose: (p: DateProposal) => void;
    oncreate: (s: { start: string; end: string }) => void;
    onmonth: (month: string) => void;
  } = $props();

  const scaleKey = "astra-timeline-scale:v1";
  function storedScale(): TimelineScale {
    try {
      const value = localStorage.getItem(scaleKey);
      return timelineScales.find((scale) => scale === value) ?? "days";
    } catch {
      return "days";
    }
  }

  let data = $state.raw<GanttPage | null>(null);
  let loading = $state(false);
  let error = $state("");
  let pageNotice = $state("");
  let freshness = $state("");
  let gesture = $state(false);
  let rowOrder = $state<string[]>([]);
  let orderNotice = $state("");
  let scale = $state<TimelineScale>(storedScale());
  let history = $state<(string | null)[]>([null]);
  let width = $state(1000);
  let scroller = $state<HTMLDivElement>();
  let chartRoot = $state<HTMLDivElement>();
  /** The first visible day, as whole days from the axis start. */
  let leftDay = $state(0);
  /** Dates bars show before their saved rows arrive, by row. */
  let pending = $state<Record<string, PendingDates>>({});
  /** Date changes waiting for their turn to be saved. */
  let outbox = $state<({ row: Summary } & DateProposalStep)[]>([]);
  /** Date changes this view has proposed and not yet heard the outcome of. */
  let saving = $state(0);
  /** The change a pointer or the keyboard is making right now. */
  let change = $state<{
    id: string;
    operation: DateOperation;
    days: number;
    keys: boolean;
    version: string;
  } | null>(null);
  let draft = $state<{ anchor: string; day: string; held: boolean } | null>(
    null,
  );
  let trayOpen = $state(false);
  let trayOverflows = $state(false);
  let tray = $state<HTMLDivElement>();
  let loadedProject: string | null = null;
  let placed = "";
  let anchored: { start: string; unit: number; lead: number } | null = null;
  let nudgeTimer = 0;
  let draftDropped = false;
  let scrollFrame = 0;
  let scrollPosition = 0;

  const readScope = $derived(`${project}:${revision}`);
  const reads = new PlanningRead((value) => {
    loading = value;
  });
  const compact = $derived(width < metrics.compactWidth);
  const unit = $derived((compact ? metrics.compactUnit : metrics.unit)[scale]);
  const label = $derived(compact ? metrics.compactLabel : metrics.label);
  const filtered = $derived(
    (data?.rows ?? []).filter((r) =>
      r.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const unscheduled = $derived(
    filtered.filter((r) => r.type === "card" && !r.schedule && !r.event),
  );
  const items = $derived(
    timelineItems(orderedTimelineRows(filtered, rowOrder)).map((item) => {
      const shown =
        item.kind === "plan" ? shownDates(pending[item.row.id]) : null;
      return shown ? { ...item, start: shown.start, end: shown.end } : item;
    }),
  );
  const visibleDays = $derived(Math.max(1, Math.ceil((width - label) / unit)));
  const axis = $derived(
    timelineAxis(
      month,
      items.flatMap((item) => [item.start, item.end]),
      visibleDays + 1,
    ),
  );
  const rightDay = $derived(leftDay + visibleDays);
  const months = $derived(calendarSegments(axis, "month"));
  const years = $derived(calendarSegments(axis, "year"));
  const weeks = $derived(
    scale === "weeks" ? weekSegments(axis, weekStart === "sunday" ? 6 : 0) : [],
  );
  const dayCells = $derived.by(() => {
    if (scale !== "days") return [];
    const first = Math.max(0, Math.floor(leftDay / 7) * 7 - metrics.overscan);
    const last = Math.min(
      axis.days - 1,
      first + visibleDays + 7 + 2 * metrics.overscan,
    );
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
      const date = axisDate(axis, first + index);
      return { date, offset: first + index, weekday: weekday(date) };
    });
  });
  const todayOffset = $derived(
    isCivilDate(today) ? dayOffset(axis, today) : -1,
  );
  const todayShown = $derived(todayOffset >= 0 && todayOffset < axis.days);
  /**
   * Days between the left edge and the day the toolbar names the month of.
   * Today opens at the same distance, so both always agree.
   */
  const lead = $derived(
    Math.min(Math.floor(visibleDays * metrics.todayLead), metrics.leadDays),
  );
  const visibleMonth = $derived(axisDate(axis, leftDay + lead).slice(0, 7));
  const changed = $derived.by(() => {
    if (!change) return null;
    const item = items.find((entry) => entry.row.id === change!.id);
    if (!item) return null;
    try {
      return {
        id: item.row.id,
        keys: change.keys,
        ...shiftedSchedule(item, change.days, change.operation),
      };
    } catch {
      return null;
    }
  });
  const changedSpan = $derived(
    changed ? axisSpan(axis, changed.start, changed.end) : null,
  );
  const draftRange = $derived(
    draft
      ? draft.anchor < draft.day
        ? { start: draft.anchor, end: draft.day }
        : { start: draft.day, end: draft.anchor }
      : null,
  );

  const monthTitle = new Intl.DateTimeFormat(uiLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthShort = new Intl.DateTimeFormat(uiLocale, {
    month: "short",
    timeZone: "UTC",
  });
  const weekdayShort = new Intl.DateTimeFormat(uiLocale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const utc = (date: string) => new Date(`${date}T12:00:00Z`);
  const px = (value: number) => `${value}px`;
  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const editable = () => (!loading || gesture) && !error && !writePending;
  /** A plan whose dates a gesture may change, even while an earlier change is saved. */
  const interactive = (item: TimelineItem) =>
    item.kind === "plan" && item.row.availability === "ready" && !error;

  /** A bar leaves a hair between itself and its days' edges. */
  function barBox(span: { offset: number; span: number }) {
    const gap = unit >= metrics.unit.weeks ? metrics.barGap : 0;
    return {
      left: span.offset * unit + gap,
      width: Math.max(metrics.barMin, span.span * unit - 2 * gap),
    };
  }

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
        pageNotice = "";
        pending = {};
        outbox = [];
        change = null;
        placed = "";
      }
      void load(history.at(-1) ?? null);
    });
  });
  onMount(() => () => {
    reads.dispose();
    window.clearTimeout(nudgeTimer);
    cancelAnimationFrame(scrollFrame);
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
        // A row that arrived saved, or changed elsewhere, shows what was read.
        const versions = new Map(
          (result.value?.rows ?? []).map((row) => [row.id, row.version]),
        );
        for (const [id, entry] of Object.entries(pending))
          if (!arrivedDates(entry, versions.get(id))) delete pending[id];
      },
      failed: (cause) => {
        error = errorMessage(cause);
      },
    });
  }

  /** Records what a step decided for a row and lines up what it proposes. */
  function advance(
    row: Summary,
    step: { entry?: PendingDates; propose?: DateProposalStep },
  ) {
    if (step.entry) pending[row.id] = step.entry;
    else delete pending[row.id];
    if (step.propose) outbox.push({ row, ...step.propose });
  }
  /**
   * A finished gesture names the dates its row should have. The bar shows them
   * at once and they are saved without a dialog, against the version the
   * gesture observed.
   */
  function commit(
    item: TimelineItem,
    operation: DateOperation,
    days: number,
    version = item.row.version,
  ) {
    if (!interactive(item) || !days) return;
    try {
      const { start, end } = shiftedSchedule(item, days, operation);
      if (start !== item.start || end !== item.end)
        advance(
          item.row,
          chooseDates(pending[item.row.id], version, { start, end }),
        );
    } catch (cause) {
      error = errorMessage(cause);
    }
  }
  // One date change is saved at a time; the others wait in the order chosen.
  $effect(() => {
    if (!outbox.length || saving || writePending) return;
    untrack(() => {
      const { row, version, dates } = outbox.shift()!;
      saving++;
      onpropose({
        path: resourcePath(row),
        version,
        schedule: dates,
        title: row.title,
        autoCommit: true,
        onsettled: (saved, produced) => {
          saving--;
          // A refused change is never forced: the bar returns to the saved days.
          advance(row, settleDates(pending[row.id], saved, produced));
          // The saved row may have been read before this answer came.
          const read = data?.rows.find((entry) => entry.id === row.id);
          if (!arrivedDates(pending[row.id], read?.version))
            delete pending[row.id];
        },
      });
    });
  });
  function preview(
    item: TimelineItem,
    operation: DateOperation,
    days: number | null,
  ) {
    if (days === null) {
      if (change?.id === item.row.id && !change.keys) change = null;
    } else
      change = {
        id: item.row.id,
        operation,
        days,
        keys: false,
        version: item.row.version,
      };
  }
  /** Keyboard steps move the bar at once and are saved together when they rest. */
  function nudge(item: TimelineItem, operation: DateOperation, days: number) {
    if (!interactive(item)) return;
    const same =
      change?.keys &&
      change.id === item.row.id &&
      change.operation === operation;
    if (change?.keys && !same) settleNudge();
    change = {
      id: item.row.id,
      operation,
      days: (same ? change!.days : 0) + days,
      keys: true,
      // The steps build on the row as it was when the first one was taken.
      version: same ? change!.version : item.row.version,
    };
    window.clearTimeout(nudgeTimer);
    nudgeTimer = window.setTimeout(settleNudge, metrics.nudgeRest);
  }
  function settleNudge() {
    window.clearTimeout(nudgeTimer);
    const steps = change;
    if (!steps?.keys) return;
    const item = items.find((entry) => entry.row.id === steps.id);
    change = null;
    if (item) commit(item, steps.operation, steps.days, steps.version);
  }

  function reorderRow(id: string, destination: number) {
    if (!editable()) return;
    const order = items.map((item) => item.row.id);
    const moved = moveTimelineRow(order, id, destination);
    const visible = new Set(order);
    const retained = rowOrder.filter((key) => !visible.has(key));
    rowOrder = [...moved, ...retained];
    orderNotice = writeTimelineOrder(project, rowOrder)
      ? ""
      : "Przeglądarka nie mogła zapisać kolejności na osi czasu.";
    void tick().then(() =>
      chartRoot
        ?.querySelector<HTMLButtonElement>(
          `[data-timeline-row="${id}"] .row-grip`,
        )
        ?.focus({ preventScroll: true }),
    );
  }

  function syncScroll() {
    scrollFrame = 0;
    if (!scroller) return;
    scrollPosition = scroller.scrollLeft;
    leftDay = Math.floor(scrollPosition / unit);
  }
  function scrolled() {
    if (scroller) scrollPosition = scroller.scrollLeft;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll);
  }
  function scrollToDay(offset: number, lead: number, smooth: boolean) {
    scroller?.scrollTo({
      left: Math.max(0, offset * unit - lead),
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });
  }
  /**
   * The current month opens on today and another month on its first plan, so
   * a narrow screen does not open on empty days.
   */
  function place(target: string, smooth: boolean) {
    if (todayShown && today.startsWith(target))
      return scrollToDay(todayOffset - lead, 0, smooth);
    const opening = dayOffset(axis, `${target}-01`);
    const first = items
      .map((item) => item.start)
      .filter((start) => start.startsWith(target))
      .sort()[0];
    // A month that fits the view whole starts at its first day.
    scrollToDay(
      first && monthLength(target) > visibleDays
        ? Math.max(opening, dayOffset(axis, first) - 1)
        : opening,
      0,
      smooth,
    );
  }
  async function showMonth(target: string) {
    placed = `${project}:${target}`;
    if (target !== month) onmonth(target);
    await tick();
    place(target, true);
  }
  async function showDate(date: string) {
    if (!isCivilDate(date)) return;
    const target = date.slice(0, 7);
    placed = `${project}:${target}`;
    if (target !== month) onmonth(target);
    await tick();
    scrollToDay(dayOffset(axis, date), unit, true);
  }
  function changeScale(next: TimelineScale) {
    scale = next;
    try {
      localStorage.setItem(scaleKey, next);
    } catch {
      /* The scale then lasts for this visit only. */
    }
  }
  // The axis grows with the plan and the scale changes its width: either way
  // the day the toolbar names stays where it is, so changing the scale and
  // back returns to the same days. The position comes from the last scroll,
  // because a narrower axis has already clamped the element's own.
  $effect(() => {
    const next = { start: axis.start, unit, lead };
    untrack(() => {
      if (
        scroller &&
        anchored &&
        (anchored.start !== next.start || anchored.unit !== next.unit)
      ) {
        scroller.scrollLeft =
          (scrollPosition / anchored.unit +
            anchored.lead +
            dayDistance(next.start, anchored.start) -
            next.lead) *
          next.unit;
        syncScroll();
      }
      anchored = next;
    });
  });
  // A month chosen elsewhere, such as the address or a first visit.
  $effect(() => {
    const key = `${project}:${month}`;
    if (!data || !scroller) return;
    untrack(() => {
      if (key === placed) return;
      placed = key;
      place(month, false);
      syncScroll();
    });
  });
  $effect(() => {
    void unscheduled.length;
    void width;
    if (tray) trayOverflows = tray.scrollHeight > tray.clientHeight + 1;
  });

  const single = (day: string) => ({ anchor: day, day, held: false });
  /** Where the keyboard starts choosing a day: today, when it is in view. */
  const keyboardDay = () =>
    todayShown && todayOffset >= leftDay && todayOffset <= rightDay
      ? today
      : axisDate(axis, leftDay + 1);
  function draftDay(event: MouseEvent & { currentTarget: HTMLElement }) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return axisDate(axis, (event.clientX - bounds.left) / unit);
  }
  function pressDraft(event: PointerEvent & { currentTarget: HTMLElement }) {
    // A finger scrolls the axis; its tap still creates a card on that day.
    if (event.button !== 0 || event.pointerType === "touch") return;
    draftDropped = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    draft = { ...single(draftDay(event)), held: true };
  }
  function moveDraft(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (event.pointerType === "touch") return;
    const day = draftDay(event);
    if (draft?.held) draft.day = day;
    else draft = single(day);
  }
  function keyDraft(event: KeyboardEvent) {
    if (event.key === "Escape" && draft?.held) {
      draftDropped = true;
      draft = null;
    }
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    draft = single(
      axisDate(
        axis,
        dayOffset(axis, draft?.day ?? keyboardDay()) +
          (event.key === "ArrowLeft" ? -1 : 1),
      ),
    );
  }
  function createFromDraft(event: MouseEvent & { currentTarget: HTMLElement }) {
    const dropped = draftDropped;
    draftDropped = false;
    const chosen =
      event.detail === 0
        ? single(draft?.day ?? keyboardDay())
        : (draft ?? single(draftDay(event)));
    draft = null;
    if (dropped || !editable()) return;
    oncreate(
      chosen.anchor < chosen.day
        ? { start: chosen.anchor, end: chosen.day }
        : { start: chosen.day, end: chosen.anchor },
    );
  }
</script>

{#if !project}<p>Wybierz projekt, aby zobaczyć jego zaplanowane daty.</p>
{:else}
  {#if orderNotice}<p role="status">{orderNotice}</p>{/if}
  {#if error}<p>
      <span role="alert">{error}</span>
      <Button
        onclick={() => {
          history = [null];
          void load(null);
        }}>Wczytaj oś czasu ponownie</Button
      >
    </p>{/if}
  {#if freshness}<p role="status" class="notice">{freshness}</p>{/if}
  {#if loading && !data}<p role="status">Ładowanie osi czasu…</p>{/if}
  {#if pageNotice}<p class="hint" role="status">{pageNotice}</p>{/if}
  {#if unscheduled.length}
    <section
      class="unscheduled"
      aria-label="Karty bez harmonogramu"
      use:revealLayers={{
        ready: !!data,
        key: project,
        layers: groupLayers,
      }}
    >
      <SectionHeading
        title="Bez harmonogramu"
        level={3}
        count={unscheduled.length}
        countLabel={`Kart bez harmonogramu: ${unscheduled.length}`}
      >
        {#snippet actions()}
          {#if trayOverflows || trayOpen}<Button
              variant="quiet"
              aria-expanded={trayOpen}
              onclick={() => (trayOpen = !trayOpen)}
              >{trayOpen ? "Pokaż mniej" : "Pokaż wszystkie"}</Button
            >{/if}
        {/snippet}
      </SectionHeading>
      <div class="cards" class:open={trayOpen} bind:this={tray}>
        {#each unscheduled as row (row.id)}<Button
            class="waiting"
            title="Otwórz kartę i ustaw daty"
            onclick={() => open(row)}><span>{row.title}</span></Button
          >{/each}
      </div>
    </section>
  {/if}
  <TimelineToolbar
    month={visibleMonth}
    title={monthTitle.format(utc(`${visibleMonth}-01`))}
    {scale}
    {today}
    navigate={(delta) => void showMonth(shiftMonth(visibleMonth, delta))}
    showToday={() => void showMonth(today.slice(0, 7))}
    {showDate}
    {changeScale}
  />
  <div
    class="astra-gantt"
    class:compact
    role="group"
    aria-label="Oś czasu projektu"
    data-scale={scale}
    bind:this={chartRoot}
    style:--timeline-unit={px(unit)}
    style:--timeline-label={px(label)}
    style:--timeline-phase={px(-weekday(axis.start) * unit)}
    style:--timeline-week-phase={px(
      -((weekday(axis.start) - (weekStart === "sunday" ? 6 : 0) + 7) % 7) *
        unit,
    )}
    use:revealLayers={{
      ready: !!data,
      key: project,
      layers: timelineLayers,
    }}
  >
    <div
      class="scroller"
      data-timeline-scroll
      data-timeline-lead={label}
      data-axis-start={axis.start}
      bind:this={scroller}
      bind:clientWidth={width}
      onscroll={scrolled}
    >
      <div class="canvas" style:width={px(label + axis.days * unit)}>
        <div class="timeline-head">
          <div class="corner">
            {items.length ? countedDatedItems(items.length) : "Oś czasu"}
          </div>
          <div class="axis" aria-hidden="true">
            <div class="tier spans">
              {#each scale === "months" ? years : months as segment (segment.start)}
                <div
                  class="segment"
                  style:left={px(segment.offset * unit)}
                  style:width={px(segment.span * unit)}
                >
                  <span
                    >{scale === "months"
                      ? segment.start.slice(0, 4)
                      : monthTitle.format(utc(segment.start))}</span
                  >
                </div>
              {/each}
            </div>
            <div class="tier ticks">
              {#if changedSpan}
                <span
                  class="range"
                  style:left={px(changedSpan.offset * unit)}
                  style:width={px(changedSpan.span * unit)}
                ></span>
              {/if}
              {#if scale === "days"}
                {#each dayCells as cell (cell.date)}
                  <div
                    class="tick day"
                    class:weekend={cell.weekday > 4}
                    class:today={cell.date === today}
                    data-day={cell.date}
                    style:left={px(cell.offset * unit)}
                  >
                    <span class="weekday"
                      >{weekdayShort
                        .format(utc(cell.date))
                        .replace(".", "")}</span
                    >
                    <span class="number">{Number(cell.date.slice(8))}</span>
                  </div>
                {/each}
              {:else if scale === "weeks"}
                {#each weeks as segment (segment.start)}
                  <div
                    class="tick"
                    data-day={segment.start}
                    style:left={px(segment.offset * unit)}
                    style:width={px(segment.span * unit)}
                  >
                    {#if segment.span > 3}<span class="number"
                        >{formatCivilRange(
                          segment.start,
                          axisDate(axis, segment.offset + segment.span - 1),
                          Number(segment.start.slice(0, 4)),
                        )}</span
                      >{/if}
                  </div>
                {/each}
              {:else}
                {#each months as segment (segment.start)}
                  <div
                    class="tick"
                    data-day={segment.start}
                    style:left={px(segment.offset * unit)}
                    style:width={px(segment.span * unit)}
                  >
                    {#if segment.span > 14}<span class="number"
                        >{monthShort.format(utc(segment.start))}</span
                      >{/if}
                  </div>
                {/each}
              {/if}
              {#if todayShown && scale !== "days"}
                <span
                  class="today-mark"
                  style:left={px((todayOffset + 0.5) * unit)}
                ></span>
              {/if}
            </div>
          </div>
        </div>
        <div class="timeline-body">
          <div class="backdrop" aria-hidden="true">
            {#each scale === "months" ? years : months as segment (segment.start)}
              <span class="boundary" style:left={px(segment.offset * unit)}
              ></span>
            {/each}
            {#if todayShown}
              <span
                class="today-line"
                style:left={px((todayOffset + 0.5) * unit)}
              ></span>
            {/if}
          </div>
          {#each items as item (item.row.id)}
            {@const moving = changed?.id === item.row.id ? changed : null}
            {@const shown = moving?.keys ? moving : item}
            {@const span = axisSpan(axis, shown.start, shown.end)}
            {@const from = dayOffset(axis, shown.start)}
            {@const to = dayOffset(axis, shown.end)}
            <div
              class="timeline-row"
              animate:flip={{ duration: reducedMotion() ? 0 : metrics.reorder }}
            >
              <TimelineRow
                id={item.row.id}
                title={item.row.title}
                {editable}
                order={() => items.map((entry) => entry.row.id)}
                gesture={(active) => {
                  gesture = active;
                  reads.pause(active);
                }}
                reorder={reorderRow}
                onopen={() => open(item.row)}
              />
              <div class="track">
                {#if to < leftDay}
                  <Button
                    variant="quiet"
                    class="jump earlier"
                    tabindex={-1}
                    aria-label={`Pokaż na osi: ${item.row.title}`}
                    title={`${item.row.title} · ${formatCivilRange(shown.start, shown.end)}`}
                    onclick={() => void showDate(shown.start)}
                    ><Icon name="chevronLeft" small /></Button
                  >
                {/if}
                {#if moving && !moving.keys && changedSpan}
                  {@const slot = barBox(changedSpan)}
                  <span
                    class="slot"
                    style:left={px(slot.left)}
                    style:width={px(slot.width)}
                  ></span>
                {/if}
                {#if span}
                  {@const box = barBox(span)}
                  <TimelineBar
                    item={{ ...item, start: shown.start, end: shown.end }}
                    left={box.left}
                    width={box.width}
                    {unit}
                    movable={() => interactive(item)}
                    preview={moving}
                    onopen={() => open(item.row)}
                    onpreview={(operation, days) =>
                      preview(item, operation, days)}
                    oncommit={(operation, days) =>
                      commit(item, operation, days)}
                    onnudge={(operation, days) => nudge(item, operation, days)}
                    onnudgeend={settleNudge}
                    ongesture={(active) => {
                      gesture = active;
                      reads.pause(active);
                    }}
                  />
                {/if}
                {#if from > rightDay}
                  <Button
                    variant="quiet"
                    class="jump later"
                    tabindex={-1}
                    aria-label={`Pokaż na osi: ${item.row.title}`}
                    title={`${item.row.title} · ${formatCivilRange(shown.start, shown.end)}`}
                    onclick={() => void showDate(shown.start)}
                    ><Icon name="chevronRight" small /></Button
                  >
                {/if}
              </div>
            </div>
          {/each}
          <div class="timeline-row create">
            <div class="row-label create-label">
              <Button
                variant="quiet"
                title="Nowa karta z datą: dziś, gdy jest widoczne, albo pierwszy widoczny dzień"
                onclick={() => {
                  // Not disabled while a save passes, so it does not flicker.
                  const day = keyboardDay();
                  if (editable()) oncreate({ start: day, end: day });
                }}><Icon name="plus" small /><span>Nowa karta</span></Button
              >
            </div>
            <div class="track">
              <button
                class="create-track"
                aria-label="Utwórz kartę na osi czasu"
                title="Kliknij dzień albo przeciągnij po kilku, aby utworzyć kartę · strzałki i Enter"
                onpointerdown={pressDraft}
                onpointermove={moveDraft}
                onpointerleave={() => {
                  if (!draft?.held) draft = null;
                }}
                onpointercancel={() => (draft = null)}
                onfocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible"))
                    draft ??= single(keyboardDay());
                }}
                onblur={() => (draft = null)}
                onkeydown={keyDraft}
                onclick={createFromDraft}
              ></button>
              {#if draftRange}
                {@const span = axisSpan(axis, draftRange.start, draftRange.end)}
                {#if span}
                  {@const box = barBox(span)}
                  <span
                    class="ghost"
                    data-start={draftRange.start}
                    data-end={draftRange.end}
                    style:left={px(box.left)}
                    style:width={px(box.width)}
                  >
                    <span
                      >{formatCivilRange(
                        draftRange.start,
                        draftRange.end,
                      )}</span
                    >
                  </span>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  {#if data?.page.next_cursor || history.length > 1}<nav
      aria-label="Strony osi czasu"
    >
      <Button
        disabled={loading || history.length === 1}
        onclick={() => {
          history = history.slice(0, -1);
          void load(history.at(-1) ?? null);
        }}>Poprzednia strona</Button
      ><span>Strona {history.length} · sumy projektu obejmują inne strony</span
      ><Button
        disabled={loading || !data?.page.next_cursor}
        onclick={() => {
          const cursor = data!.page.next_cursor;
          history = [...history, cursor];
          void load(cursor);
        }}>Następna strona elementów z datą</Button
      >
    </nav>{/if}
{/if}

<style>
  nav {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    flex-wrap: wrap;
    margin: var(--space-6) 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .hint,
  .notice {
    font-size: var(--text-base);
    color: var(--muted);
  }
  .notice {
    border-left: var(--space-2) solid var(--notice-ink);
    padding: var(--space-4) var(--space-6);
  }

  /* Cards waiting for dates stand above the axis they will be placed on. */
  .unscheduled {
    --tray-rows: 2;
    /* One card of the tray: compact under a pointer, a full target under a finger. */
    --tray-chip: var(--space-12);
    margin-bottom: var(--space-9);
  }
  .unscheduled :global(.sectiontitle) {
    margin-top: 0;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    min-width: 0;
    max-height: calc(
      var(--tray-rows) * var(--tray-chip) + (var(--tray-rows) - 1) *
        var(--space-3)
    );
    overflow: hidden;
  }
  .cards.open {
    max-height: none;
  }
  .cards :global(.waiting) {
    max-width: 100%;
    min-height: var(--tray-chip);
    padding-block: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
  }
  .cards :global(.waiting span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .astra-gantt {
    /* A bar is as high as a Calendar item; a row gives it room on both sides. */
    --timeline-bar: var(--calendar-chip-height);
    --timeline-bar-inset: var(--space-5);
    --timeline-row: calc(var(--timeline-bar) + 2 * var(--timeline-bar-inset));
    --timeline-edge: var(--space-6);
    --timeline-edge-coarse: var(--space-9);
    --timeline-edge-share: 34%;
    --timeline-grip-held: 0.6;
    --timeline-beside: var(--field-width);
    /* Header tiers hold text of a fixed size; only the room around it follows
       the spacing. */
    --timeline-head-top: calc(var(--text-sm) + var(--space-8));
    --timeline-head-bottom: calc(
      var(--text-xs) + var(--text-sm) + var(--space-8)
    );
    --timeline-height: clamp(
      calc(var(--timeline-row) * 6),
      calc(100dvh - var(--space-20) * 7),
      calc(var(--timeline-row) * 28)
    );
    --timeline-weekend: var(--wash);
    --timeline-rule: color-mix(in srgb, var(--line) 55%, transparent);
    --timeline-today: var(--accent-ink);
    --timeline-layer-label: calc(var(--layer-raised) + 1);
    --timeline-layer-head: calc(var(--layer-raised) + 2);
    --timeline-layer-corner: calc(var(--layer-raised) + 3);
    --timeline-ghost: 0.7;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-card);
    background: var(--paper);
    overflow: hidden;
  }
  .scroller {
    max-height: var(--timeline-height);
    overflow: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }
  .canvas {
    position: relative;
    min-width: 100%;
  }

  .timeline-head {
    position: sticky;
    top: 0;
    z-index: var(--timeline-layer-head);
    display: flex;
    height: calc(var(--timeline-head-top) + var(--timeline-head-bottom));
    border-bottom: var(--stroke) solid var(--line);
    background: var(--paper);
  }
  .corner,
  .timeline-row :global(.row-label) {
    position: sticky;
    left: 0;
    flex: 0 0 var(--timeline-label);
    width: var(--timeline-label);
    border-right: var(--stroke) solid var(--line);
    background: var(--paper);
  }
  .corner {
    z-index: var(--timeline-layer-corner);
    display: flex;
    align-items: flex-end;
    padding: var(--space-5) var(--space-8);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .axis {
    position: relative;
    flex: 1;
  }
  .tier {
    position: absolute;
    left: 0;
    right: 0;
  }
  .spans {
    top: 0;
    height: var(--timeline-head-top);
  }
  .ticks {
    top: var(--timeline-head-top);
    height: var(--timeline-head-bottom);
  }
  .segment {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    border-left: var(--stroke) solid var(--line);
  }
  .segment span {
    position: sticky;
    left: calc(var(--timeline-label) + var(--space-6));
    padding-inline: var(--space-6);
    line-height: var(--leading-tight);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: var(--timeline-unit);
    color: var(--muted);
    font-size: var(--text-sm);
    line-height: var(--leading-tight);
    white-space: nowrap;
  }
  .tick:not(.day) {
    align-items: flex-start;
    padding-left: var(--space-4);
    border-left: var(--stroke) solid var(--timeline-rule);
  }
  .weekday {
    font-size: var(--text-xs);
  }
  .number {
    color: var(--ink);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }
  .tick:not(.day) .number {
    color: var(--muted);
  }
  [data-scale="days"] .ticks {
    background-image: linear-gradient(
      to right,
      transparent calc(var(--timeline-unit) * 5),
      var(--timeline-weekend) calc(var(--timeline-unit) * 5)
    );
    background-size: calc(var(--timeline-unit) * 7) 100%;
    background-position: var(--timeline-phase) 0;
  }
  .tick.weekend .number {
    color: var(--muted);
  }
  .tick.today .weekday {
    color: var(--timeline-today);
    font-weight: var(--weight-semibold);
  }
  .tick.today .number {
    min-width: var(--space-10);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--timeline-today);
    color: var(--paper);
    text-align: center;
  }
  .today-mark {
    position: absolute;
    bottom: calc(var(--space-2) * -1);
    width: var(--space-4);
    height: var(--space-4);
    margin-left: calc(var(--space-2) * -1);
    border-radius: var(--radius-pill);
    background: var(--timeline-today);
  }
  /* The days a held bar would take, marked on the axis itself. */
  .range {
    position: absolute;
    top: var(--space-2);
    bottom: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--accent);
  }

  .timeline-body {
    position: relative;
  }
  .backdrop {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--timeline-label);
    right: 0;
    pointer-events: none;
  }
  [data-scale="days"] .backdrop {
    background-image:
      linear-gradient(
        to right,
        var(--timeline-rule) var(--stroke),
        transparent var(--stroke)
      ),
      linear-gradient(
        to right,
        transparent calc(var(--timeline-unit) * 5),
        var(--timeline-weekend) calc(var(--timeline-unit) * 5)
      );
    background-size:
      var(--timeline-unit) 100%,
      calc(var(--timeline-unit) * 7) 100%;
    background-position:
      0 0,
      var(--timeline-phase) 0;
  }
  [data-scale="weeks"] .backdrop {
    background-image:
      linear-gradient(
        to right,
        var(--timeline-rule) var(--stroke),
        transparent var(--stroke)
      ),
      linear-gradient(
        to right,
        transparent calc(var(--timeline-unit) * 5),
        var(--timeline-weekend) calc(var(--timeline-unit) * 5)
      );
    background-size: calc(var(--timeline-unit) * 7) 100%;
    background-position:
      var(--timeline-week-phase) 0,
      var(--timeline-phase) 0;
  }
  .boundary {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--stroke);
    background: var(--line);
  }
  .today-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--stroke);
    background: var(--timeline-today);
  }

  .timeline-row {
    display: flex;
    height: var(--timeline-row);
    border-bottom: var(--stroke) solid var(--timeline-rule);
  }
  .timeline-row :global(.row-label) {
    z-index: var(--timeline-layer-label);
  }
  .track {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    transition: background var(--motion-quick) var(--motion-ease);
  }
  .timeline-row:hover .track,
  .timeline-row:focus-within .track {
    background: color-mix(in srgb, var(--ink) 2.5%, transparent);
  }
  .slot {
    position: absolute;
    top: var(--timeline-bar-inset);
    bottom: var(--timeline-bar-inset);
    border: var(--stroke) dashed var(--accent-ink);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 60%, transparent);
    pointer-events: none;
  }
  /* A plan outside the visible days leaves a way to reach it. */
  .track :global(.jump) {
    position: sticky;
    width: var(--space-10);
    min-height: 0;
    height: var(--space-10);
    padding: 0;
    border-radius: var(--radius-pill);
    color: var(--line-strong);
  }
  .track :global(.jump:hover) {
    color: var(--ink);
  }
  .track :global(.jump.earlier) {
    left: calc(var(--timeline-label) + var(--space-3));
  }
  .track :global(.jump.later) {
    right: var(--space-3);
    margin-left: auto;
  }

  .timeline-row.create {
    border-bottom: 0;
  }
  .create-label :global(button) {
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--timeline-row);
    padding: 0 var(--space-8);
    border-radius: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
  }
  .create-label :global(button:hover) {
    color: var(--ink);
  }
  .create-track {
    position: absolute;
    inset: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: copy;
  }
  .create-track:hover {
    background: transparent;
  }
  .create-track:focus-visible {
    outline-offset: calc(var(--focus-width) * -1);
  }
  .ghost {
    position: absolute;
    top: var(--timeline-bar-inset);
    bottom: var(--timeline-bar-inset);
    display: flex;
    align-items: center;
    border: var(--stroke) dashed var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--paper);
    opacity: var(--timeline-ghost);
    pointer-events: none;
  }
  .ghost span {
    padding-inline: var(--space-4);
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }

  .compact .corner {
    padding-inline: var(--space-5);
  }
  .compact .create-label :global(button) {
    padding-inline: var(--space-5);
  }
  @media (pointer: coarse) {
    .astra-gantt {
      --timeline-bar: var(--space-14);
    }
    .unscheduled {
      --tray-chip: var(--tap-target);
    }
  }
  @media (max-width: 700px) {
    .astra-gantt {
      --timeline-height: clamp(
        calc(var(--timeline-row) * 6),
        calc(100dvh - var(--space-20) * 4),
        calc(var(--timeline-row) * 20)
      );
    }
    .unscheduled {
      --tray-rows: 1;
    }
    .cards :global(.waiting) {
      font-size: var(--text-base);
    }
  }
</style>
