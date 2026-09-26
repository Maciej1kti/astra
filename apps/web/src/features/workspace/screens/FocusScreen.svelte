<script lang="ts">
  import EmptyState from "../../../lib/ui/EmptyState.svelte";

  import ResourceCard from "../../../lib/ui/ResourceCard.svelte";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";
  import Icon from "../../../lib/ui/Icon.svelte";

  import type { Summary } from "../../../lib/api/api";
  import type { FocusRef } from "../../../lib/contracts/api.generated";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import type { Attention } from "../view-queries";
  import {
    attentionKey,
    focusSections,
    type FocusAttention,
    type FocusCard,
  } from "./focus-sections";
  import { focusOrderGesture } from "../focus-order-gesture";

  let {
    route,
    projects,
    cards,
    events,
    focusCards,
    focusCount,
    focusOrder,
    focusVersion,
    focusPending,
    focusBusy,
    focusConflict,
    focusRefreshing,
    focusError,
    focusCopyMessage,
    focusCanRetry,
    focusCanReload,
    focusRequestId,
    attentionRows,
    attentionCursor,
    attentionPaged,
    activeCardCursor,
    activeCardPaged,
    eventCursor,
    eventPaged,
    loadingMore,
    open,
    onreorder,
    onretry,
    onretrynew,
    onreload,
    oncopycommand,
    moreAttention,
    moreActiveCards,
    moreEvents,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    events: Summary[];
    focusCards: Summary[];
    focusCount: number;
    focusOrder: FocusRef[];
    focusVersion: string;
    focusPending: boolean;
    focusBusy: boolean;
    focusConflict: boolean;
    focusRefreshing: boolean;
    focusError: string;
    focusCopyMessage: string;
    focusCanRetry: boolean;
    focusCanReload: boolean;
    focusRequestId: string;
    attentionRows: Attention[];
    attentionCursor: string | null;
    attentionPaged: boolean;
    activeCardCursor: string | null;
    activeCardPaged: boolean;
    eventCursor: string | null;
    eventPaged: boolean;
    loadingMore: boolean;
    open: OpenResource;
    onreorder: (
      visible: Summary[],
      fullOrder: FocusRef[],
      version: string,
    ) => void;
    onretry: () => void;
    onretrynew: () => void;
    onreload: () => void;
    oncopycommand: () => void;
    moreAttention: (first?: boolean) => Promise<void>;
    moreActiveCards: (back?: boolean) => Promise<void>;
    moreEvents: (back?: boolean) => Promise<void>;
  } = $props();

  const sections = $derived(
    focusSections(cards, focusCards, attentionRows, route, projects, events),
  );
  let gestureFocus = $state<FocusCard[] | null>(null);
  const visibleFocus = $derived<FocusCard[]>(sections.focusCards);
  const displayedFocus = $derived(gestureFocus ?? visibleFocus);
  const reorderableFocus = $derived(
    visibleFocus.filter((item) => item.availability !== "unavailable"),
  );
  const attention = $derived<FocusAttention[]>(sections.attention);
  const activeCards = $derived(sections.activeCards);

  function focusGestureOptions() {
    return {
      cards: () => reorderableFocus,
      fullOrder: () => focusOrder,
      version: () => focusVersion,
      scope: () => `${route.project}\n${route.search.trim()}`,
      disabled: () =>
        !focusVersion ||
        focusBusy ||
        focusPending ||
        focusCanReload ||
        focusRefreshing,
      active: (active: boolean) => {
        gestureFocus = active ? [...visibleFocus] : null;
      },
      commit: onreorder,
    };
  }

  function openAttention(item: FocusAttention) {
    return open({
      project_id: item.project_id,
      type: item.report_id ? "update" : item.target.type,
      id: item.report_id ?? item.target.id,
    });
  }
</script>

<section
  class="focus-section"
  aria-labelledby="focus-section-title"
  data-focus-section="focus"
>
  <SectionHeading
    id="focus-section-title"
    title="In focus"
    count={`${displayedFocus.length} visible cards`}
  />
  {#if focusCount > 1}<p class="sr" id="focus-order-help">
      Drag a card to reorder it, or focus it and press Alt+↑ / Alt+↓. Click a
      card to open it.
    </p>{/if}
  <div class="focus-stack" use:focusOrderGesture={focusGestureOptions()}>
    {#each displayedFocus as item (item.project_id + ":" + item.id)}<ResourceCard
        {item}
        showStatus
        pinned
        projectName={projectLabel(projects, item.project_id)}
        class="title focus-card"
        data-focus-card={item.id}
        data-focus-project={item.project_id}
        data-focus-key={`${item.project_id}:${item.id}`}
        data-focus-reorderable={item.availability === "unavailable"
          ? undefined
          : ""}
        title={item.title}
        aria-describedby={focusCount > 1 ? "focus-order-help" : undefined}
        aria-keyshortcuts={item.availability === "unavailable"
          ? undefined
          : "Alt+ArrowUp Alt+ArrowDown"}
        onclick={() => open(item)}
      >
        {#if item.attentionReasons.length}<span
            class="attention-reasons"
            aria-label="Attention reasons"
            >{#each item.attentionReasons as reason}<span class="badge"
                >{resourceLabel(reason)}</span
              >{/each}</span
          >{/if}</ResourceCard
      >{:else}<EmptyState>
        {route.project || route.search
          ? "No pinned cards match this selection. Change the project or clear the title filter."
          : "No pinned cards yet. Open a card and pin it to keep it here."}
      </EmptyState>{/each}
  </div>
  {#if focusBusy}<p role="status" class="focus-order-status">
      Saving focus order…
    </p>{/if}
  {#if focusPending && !focusBusy}<p role="alert" class="focus-order-status">
      {focusError ||
        "The focus order is awaiting confirmation. The same command is retained."}
    </p>
    <button onclick={onretry} disabled={focusRefreshing}
      >Retry same command</button
    >
    <details class="focus-save-details">
      <summary>Save details</summary>
      <code>{focusRequestId}</code>
      <button onclick={oncopycommand}>Copy pending command</button>
      {#if focusCopyMessage}<p role="status">{focusCopyMessage}</p>{/if}
    </details>{/if}
  {#if focusConflict}<p role="alert" class="focus-order-status">
      {focusError ||
        "The focus order changed elsewhere. Reload to discard this proposal."}
    </p>
    <button onclick={onreload} disabled={focusRefreshing}>
      {focusRefreshing ? "Reloading focus order…" : "Reload focus order"}
    </button>{/if}
  {#if focusError && !focusPending && !focusConflict}<p
      role="alert"
      class="focus-order-status"
    >
      {focusError}
    </p>
    {#if focusCanRetry}<button onclick={onretrynew}>Try this order again</button
      >{/if}{#if focusCanReload}<button
        onclick={onreload}
        disabled={focusRefreshing}
      >
        {focusRefreshing ? "Reloading focus order…" : "Reload focus order"}
      </button>{/if}{/if}
  {#if focusRefreshing && !focusConflict}<p
      role="status"
      class="focus-order-status"
    >
      Reloading focus order…
    </p>{/if}
</section>

<section
  aria-labelledby="attention-section-title"
  data-focus-section="attention"
>
  <SectionHeading
    id="attention-section-title"
    title="Needs my attention"
    count={`${attention.length} visible items`}
  />
  {#each attention as item (attentionKey(item))}<button
      class="listrow"
      onclick={() => openAttention(item)}
      ><span class="priority"><Icon name="flag" /></span>
      <div>
        <strong>{item.label}</strong><small
          >{projectLabel(projects, item.project_id)}</small
        >
      </div>
      <span class="attention-reasons" aria-label="Attention reasons"
        >{#each item.reasons as reason}<span class="badge"
            >{resourceLabel(reason)}</span
          >{/each}</span
      ><Icon name="arrow" /></button
    >{:else}<EmptyState>
      <strong>A little breathing room.</strong>
      <p>No additional items need attention on this page.</p>
    </EmptyState>{/each}
  {#if attentionCursor}<button
      disabled={loadingMore}
      onclick={() => moreAttention()}>Next attention page</button
    >{/if}
  {#if attentionPaged}<button
      disabled={loadingMore}
      onclick={() => moreAttention(true)}>First attention page</button
    >{/if}
</section>

<section aria-labelledby="motion-section-title" data-focus-section="motion">
  <SectionHeading
    id="motion-section-title"
    title="In motion"
    count={`${activeCards.length} visible plans`}
  />
  <div class="grid">
    {#each activeCards as item (item.project_id + ":" + item.id)}<ResourceCard
        {item}
        showStatus
        projectName={projectLabel(projects, item.project_id)}
        onclick={() => open(item)}
      />{:else}<EmptyState>
        No other plans are scheduled for today on this page.
      </EmptyState>{/each}
  </div>
  {#if activeCardCursor}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards()}>Next plans</button
    >{/if}
  {#if activeCardPaged}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards(true)}>Previous plans</button
    >{/if}
</section>

<section aria-labelledby="events-section-title" data-focus-section="events">
  <SectionHeading
    id="events-section-title"
    title="Events"
    count={`${sections.eventCards.length} visible events`}
  />
  <div class="grid">
    {#each sections.eventCards as item (item.project_id + ":" + item.id)}
      <ResourceCard
        {item}
        showStatus
        projectName={projectLabel(projects, item.project_id)}
        onclick={() => open(item)}
      />
    {:else}<EmptyState
        >No other events are scheduled for today on this page.</EmptyState
      >{/each}
  </div>
  {#if eventCursor}<button disabled={loadingMore} onclick={() => moreEvents()}
      >Next events</button
    >{/if}
  {#if eventPaged}<button
      disabled={loadingMore}
      onclick={() => moreEvents(true)}>Previous events</button
    >{/if}
</section>
