<script lang="ts">
  import { dayDistance } from "../../lib/ui/calendar-dates";
  import {
    countedDays,
    formatCivilDate,
    formatCivilRange,
  } from "../../lib/ui/locale";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
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

{#if item.kind === "milestone"}
  <button
    class="timeline-milestone"
    style:left={`${left + width / 2}px`}
    data-card-id={row.id}
    aria-label={`Termin kamienia milowego: ${row.title}`}
    title={`${row.title} · ${range}`}
    onclick={onopen}
  >
    <span class="diamond" aria-hidden="true"></span>
    <span class="beside-title">{row.title}</span>
  </button>
{:else}
  <div
    class="timeline-bar"
    class:beside
    data-kind={item.kind}
    data-status={row.status}
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
        : `Karta: ${row.title}, ${range}`}
      aria-keyshortcuts={plan ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
      title={plan ? `${hint} · przeciągnij, aby przenieść · Alt+←/→` : hint}
      onclick={onopen}
      onkeydown={(event) => keyboard(event, "move")}
      onkeyup={keyup}
      onblur={onnudgeend}
    >
      <span class={beside ? "beside-title" : "inside-title"}>{title}</span>
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
{/if}

<style>
  .timeline-bar {
    --tone: color-mix(in srgb, var(--ink) 9%, var(--paper));
    --tone-hover: color-mix(in srgb, var(--ink) 13%, var(--paper));
    --rule: var(--line-strong);
    position: absolute;
    top: var(--timeline-bar-inset);
    bottom: var(--timeline-bar-inset);
    display: flex;
    border-radius: var(--radius-sm);
    background: var(--tone);
    box-shadow: inset var(--calendar-rule) 0 0 var(--rule);
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
  .timeline-bar[data-status="active"],
  .timeline-bar[data-kind="event"] {
    --tone: var(--accent);
    --tone-hover: color-mix(in srgb, var(--accent-ink) 10%, var(--accent));
    --rule: var(--accent-ink);
  }
  .timeline-bar[data-status="review"] {
    --tone: var(--review-bg);
    --tone-hover: color-mix(in srgb, var(--ink) 6%, var(--review-bg));
    --rule: color-mix(in srgb, var(--ink) 45%, var(--review-bg));
  }
  .timeline-bar[data-status="done"] {
    --tone: var(--plan-bg);
    --tone-hover: color-mix(in srgb, var(--success) 10%, var(--plan-bg));
    --rule: var(--success);
  }
  .timeline-bar[data-status="cancelled"] {
    --tone: color-mix(in srgb, var(--ink) 5%, var(--paper));
    --rule: var(--line);
    color: var(--muted);
  }
  .timeline-bar[data-status="cancelled"] .bar-body {
    text-decoration: line-through;
  }
  .timeline-bar[data-movable] {
    cursor: grab;
    touch-action: pan-x pan-y;
  }
  .timeline-bar:hover,
  .timeline-bar:focus-within {
    background: var(--tone-hover);
  }
  .timeline-bar:global([data-dragging]) {
    z-index: var(--layer-raised);
    background: var(--tone-hover);
    box-shadow:
      inset var(--calendar-rule) 0 0 var(--rule),
      var(--shadow-floating);
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
    padding-inline: calc(var(--calendar-rule) + var(--space-5)) var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: var(--leading-tight);
    text-align: left;
    white-space: nowrap;
  }
  .timeline-bar:not([data-movable]) .bar-body {
    cursor: pointer;
  }
  .inside-title {
    /* A long bar keeps its title in view while its start is scrolled away. */
    position: sticky;
    left: calc(var(--timeline-label) + var(--space-5));
    flex-shrink: 0;
    /* A row holds one bar, so a title longer than its bar runs on past it. */
    max-width: max(100%, var(--timeline-beside));
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .beside-title {
    position: absolute;
    left: calc(100% + var(--space-4));
    top: 50%;
    translate: 0 -50%;
    max-width: var(--timeline-beside);
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }
  .timeline-bar[data-status="cancelled"] .beside-title {
    color: var(--muted);
  }
  .timeline-bar[data-previewing] .beside-title {
    visibility: hidden;
  }
  /* The dates a gesture would save stand where a long title would run on. */
  .timeline-bar[data-previewing] .inside-title {
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
    left: 0;
  }
  .edge.end {
    right: 0;
  }
  /* A grip appears where the pointer can take hold of an end. */
  .edge::after {
    content: "";
    position: absolute;
    top: 25%;
    bottom: 25%;
    left: 50%;
    width: var(--calendar-rule);
    margin-left: calc(var(--calendar-rule) / -2);
    border-radius: var(--radius-pill);
    background: var(--ink);
    opacity: 0;
    transition: opacity var(--motion-quick) var(--motion-ease);
  }
  .edge.start::after {
    left: calc(var(--calendar-rule) + var(--space-2));
    margin-left: 0;
  }
  .edge.end::after {
    left: auto;
    right: var(--space-2);
  }
  .edge:hover::after,
  .edge:focus-visible::after,
  .timeline-bar:global([data-dragging="start"]) .edge.start::after,
  .timeline-bar:global([data-dragging="end"]) .edge.end::after {
    opacity: var(--timeline-grip-held);
  }
  button:focus-visible {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-width);
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
    right: calc(100% + var(--space-3));
  }
  .flank.after {
    left: calc(100% + var(--space-3));
  }

  .timeline-milestone {
    position: absolute;
    top: var(--timeline-bar-inset);
    bottom: var(--timeline-bar-inset);
    width: var(--timeline-diamond-hit);
    margin-left: calc(var(--timeline-diamond-hit) / -2);
    display: grid;
    place-items: center;
    cursor: pointer;
    scroll-margin-inline: calc(var(--timeline-label) + var(--space-8))
      var(--space-8);
  }
  .diamond {
    width: var(--timeline-diamond);
    height: var(--timeline-diamond);
    border-radius: var(--space-1);
    background: var(--notice-ink);
    rotate: 45deg;
    transition: scale var(--motion-quick) var(--motion-spring);
  }
  .timeline-milestone:hover .diamond {
    scale: var(--timeline-diamond-hover);
  }

  @media (pointer: coarse) {
    .edge {
      width: min(var(--timeline-edge-coarse), var(--timeline-edge-share));
    }
  }
</style>
