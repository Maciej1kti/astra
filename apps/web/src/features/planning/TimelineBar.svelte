<script lang="ts">
  import { dayDistance } from "../../lib/ui/calendar-dates";
  import {
    countedDays,
    formatCivilDate,
    formatCivilRange,
  } from "../../lib/ui/locale";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import Icon from "../../lib/ui/Icon.svelte";
  import { timelineMetrics as metrics } from "../../lib/ui/planning-metrics";
  import { dateGesture, type DateOperation } from "./date-gesture";
  import type { TimelineItem } from "./timeline-items";

  let {
    item,
    left,
    width,
    unit,
    movable,
    preview,
    onopen,
    onpreview,
    oncommit,
    onnudge,
    onnudgeend,
    ongesture,
  }: {
    item: TimelineItem;
    left: number;
    width: number;
    unit: number;
    movable: () => boolean;
    /** The dates a gesture in progress would save. */
    preview: { start: string; end: string } | null;
    onopen: () => void;
    onpreview: (operation: DateOperation, days: number | null) => void;
    oncommit: (operation: DateOperation, days: number) => void;
    /** Keyboard steps gather into one change, saved when the keys rest. */
    onnudge: (operation: DateOperation, days: number) => void;
    onnudgeend: () => void;
    ongesture: (active: boolean) => void;
  } = $props();

  const row = $derived(item.row);
  const plan = $derived(item.kind === "plan");
  const days = $derived(dayDistance(item.start, item.end) + 1);
  const range = $derived(formatCivilRange(item.start, item.end));
  // A short bar cannot hold its title, so the title stands beside it.
  const beside = $derived(width < metrics.titleInside);
  // The same symbols as Calendar: a clock, a flag and a calendar page.
  const icon = $derived(
    item.kind === "event"
      ? "planned"
      : item.kind === "milestone"
        ? "flag"
        : item.kind === "goal"
          ? "projects"
          : "calendar",
  );
  const title = $derived(
    item.kind === "event"
      ? `${row.event!.start.slice(11)} ${row.title}`
      : row.title,
  );
  const hint = $derived(
    [
      row.title,
      item.kind === "event"
        ? "Wydarzenie"
        : item.kind === "milestone"
          ? "Termin"
          : item.kind === "goal"
            ? "Cel"
            : row.status
              ? resourceLabel(row.status)
              : "",
      range,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  function keyboard(event: KeyboardEvent, operation: DateOperation) {
    if (
      !plan ||
      !event.altKey ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    onnudge(
      operation,
      (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1),
    );
  }
  function keyup(event: KeyboardEvent) {
    if (event.key === "Alt") onnudgeend();
  }
</script>

<div
  class="timeline-bar"
  class:beside
  class:slim={width < metrics.iconInside}
  data-kind={item.kind}
  data-card-id={row.id}
  data-movable={plan ? "" : undefined}
  data-previewing={preview ? "" : undefined}
  style:left={`${left}px`}
  style:width={`${width}px`}
  use:dateGesture={{
    unit: () => unit,
    span: () => days,
    disabled: () => !plan || !movable(),
    active: ongesture,
    preview: onpreview,
    commit: oncommit,
  }}
>
  <button
    class="bar-body"
    aria-label={item.kind === "event"
      ? `Wydarzenie: ${row.title}`
      : item.kind === "milestone"
        ? `Termin kamienia milowego: ${row.title}`
        : item.kind === "goal"
          ? `Cel: ${row.title}, ${range}`
          : `Karta: ${row.title}, ${range}`}
    aria-keyshortcuts={plan ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
    title={plan ? `${hint} · przeciągnij, aby przenieść · Alt+←/→` : hint}
    onclick={onopen}
    onkeydown={(event) => keyboard(event, "move")}
    onkeyup={keyup}
    onblur={onnudgeend}
  >
    <span class="bar-copy"
      ><span class="item-kind" aria-hidden="true"
        ><Icon name={icon} small /></span
      >{#if !beside}<span class="inside-title">{title}</span>{/if}</span
    >
    {#if beside}<span class="beside-title">{title}</span>{/if}
  </button>
  {#if plan}
    <button
      class="edge start"
      data-edge="start"
      aria-label={`Zmień początek: ${row.title}`}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      title="Przeciągnij, aby zmienić początek · Alt+←/→"
      onkeydown={(event) => keyboard(event, "start")}
      onkeyup={keyup}
      onblur={onnudgeend}
    ></button>
    <button
      class="edge end"
      data-edge="end"
      aria-label={`Zmień koniec: ${row.title}`}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      title="Przeciągnij, aby zmienić koniec · Alt+←/→"
      onkeydown={(event) => keyboard(event, "end")}
      onkeyup={keyup}
      onblur={onnudgeend}
    ></button>
  {/if}
  {#if preview}
    <span class="flank before" aria-hidden="true"
      >{formatCivilDate(preview.start)}</span
    >
    <span class="flank after" aria-hidden="true"
      >{formatCivilDate(preview.end)} · {countedDays(
        dayDistance(preview.start, preview.end) + 1,
      )}</span
    >
  {/if}
</div>

<style>
  /* Planned time is drawn as in Calendar: one filled line with a rule and a
     symbol in the colour of its kind, as high as a Calendar item. */
  .timeline-bar {
    --fill: var(--plan-bg);
    --rule: var(--success);
    position: absolute;
    top: var(--timeline-bar-inset);
    height: var(--timeline-bar);
    display: flex;
    border-left: var(--calendar-rule) solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--fill);
    color: var(--ink);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    /* Keeps a focused bar clear of the fixed label column. */
    scroll-margin-inline: calc(var(--timeline-label) + var(--space-8))
      var(--space-8);
    transition:
      background var(--motion-quick) var(--motion-ease),
      box-shadow var(--motion-quick) var(--motion-ease);
  }
  .timeline-bar[data-kind="event"] {
    --fill: var(--accent);
    --rule: var(--accent-ink);
  }
  .timeline-bar[data-kind="milestone"] {
    --fill: var(--notice-bg);
    --rule: var(--notice-ink);
  }
  .timeline-bar[data-movable] {
    cursor: grab;
    touch-action: pan-x pan-y;
  }
  .timeline-bar:hover,
  .timeline-bar:focus-within,
  .timeline-bar:global([data-dragging]) {
    background: color-mix(in srgb, var(--rule) 12%, var(--fill));
  }
  .timeline-bar:global([data-dragging]) {
    z-index: var(--layer-raised);
    box-shadow: var(--shadow-floating);
    cursor: grabbing;
    transition: none;
  }
  .timeline-bar[data-previewing] {
    z-index: var(--layer-raised);
  }

  /* The app's button chrome would draw a second, bordered box inside the bar. */
  button {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: inherit;
  }
  button:hover {
    background: transparent;
  }
  .bar-body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: var(--leading-body);
    text-align: left;
    white-space: nowrap;
  }
  .timeline-bar:not([data-movable]) .bar-body {
    cursor: pointer;
  }
  .bar-copy {
    /* A long bar keeps its title in view while its start is scrolled away. */
    position: sticky;
    left: calc(var(--timeline-label) + var(--space-4));
    display: flex;
    align-items: center;
    flex-shrink: 0;
    /* A row holds one bar, so a title longer than its bar runs on past it. */
    max-width: max(100%, var(--timeline-beside));
  }
  .item-kind {
    display: inline-flex;
    flex-shrink: 0;
    margin-right: var(--space-2);
    color: var(--rule);
  }
  .item-kind :global(.ui-icon) {
    width: var(--space-7);
    height: var(--space-7);
  }
  /* Too narrow even for its symbol, as a single day is on the month scale. */
  .slim .bar-body {
    padding: 0;
  }
  .slim .item-kind {
    display: none;
  }
  .inside-title,
  .beside-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .beside-title {
    position: absolute;
    left: calc(100% + var(--space-3));
    top: 50%;
    translate: 0 -50%;
    max-width: var(--timeline-beside);
    color: var(--ink);
  }
  .timeline-bar[data-previewing] .beside-title {
    visibility: hidden;
  }
  /* The dates a gesture would save stand where a long title would run on. */
  .timeline-bar[data-previewing] .bar-copy {
    flex-shrink: 1;
    min-width: 0;
    max-width: 100%;
  }

  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: min(var(--timeline-edge), var(--timeline-edge-share));
    cursor: ew-resize;
  }
  .edge.start {
    left: calc(var(--calendar-rule) * -1);
  }
  .edge.end {
    right: 0;
  }
  /* A grip appears where the pointer can take hold of an end. The start has
     its rule for that. */
  .edge::after {
    content: "";
    position: absolute;
    top: 25%;
    bottom: 25%;
    right: var(--space-2);
    width: var(--calendar-rule);
    border-radius: var(--radius-pill);
    background: var(--ink);
    opacity: 0;
    transition: opacity var(--motion-quick) var(--motion-ease);
  }
  .edge.start::after {
    right: auto;
    left: 0;
  }
  .edge.end:hover::after,
  .timeline-bar:global([data-dragging="end"]) .edge.end::after {
    opacity: var(--timeline-grip-held);
  }
  .bar-body:focus-visible {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-width);
  }
  /* A focused end rings the whole bar and marks which end the keys will move;
     a ring around the end alone would cross the title. */
  .edge:focus-visible {
    outline: none;
  }
  .timeline-bar:has(.edge:focus-visible) {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-width);
  }
  .edge:focus-visible::after {
    top: 0;
    bottom: 0;
    background: var(--accent-ink);
    opacity: 1;
  }

  .flank {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--primary);
    color: var(--on-primary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
    line-height: var(--leading-body);
    white-space: nowrap;
    pointer-events: none;
  }
  .flank.before {
    right: calc(100% + var(--calendar-rule) + var(--space-3));
  }
  .flank.after {
    left: calc(100% + var(--space-3));
  }

  @media (pointer: coarse) {
    .edge {
      width: min(var(--timeline-edge-coarse), var(--timeline-edge-share));
    }
  }
</style>
