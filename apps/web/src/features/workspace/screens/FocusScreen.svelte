<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
  import type { FocusRef } from "../../../lib/contracts/api.generated";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import ResourceMetadata from "../../../lib/ui/ResourceMetadata.svelte";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import type { Attention } from "../view-queries";
  import {
    focusSections,
    type FocusAttention,
    type FocusCard,
  } from "./focus-sections";
  import { focusOrderGesture } from "../focus-order-gesture";

  let {
    route,
    projects,
    cards,
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
    loadingMore,
    open,
    onreorder,
    onretry,
    onretrynew,
    onreload,
    oncopycommand,
    moreAttention,
    moreActiveCards,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
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
  } = $props();

  const sections = $derived(
    focusSections(cards, focusCards, attentionRows, route),
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
      type: item.target.type,
      id: item.target.id,
    });
  }
</script>

<section
  class="focus-section"
  aria-labelledby="focus-section-title"
  data-focus-section="focus"
>
  <div class="sectiontitle">
    <h2 id="focus-section-title">In focus</h2>
    <span>{displayedFocus.length} visible cards</span>
  </div>
  {#if focusCount > 1}<p class="sr" id="focus-order-help">
      Drag a card to reorder it, or focus it and press Alt+↑ / Alt+↓. Click a
      card to open it.
    </p>{/if}
  <div class="focus-stack" use:focusOrderGesture={focusGestureOptions()}>
    {#each displayedFocus as item (item.project_id + ":" + item.id)}<button
        class="card title focus-card"
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
        ><small>{projectLabel(projects, item.project_id)}</small>
        <h3>{item.title}</h3>
        <ResourceMetadata {item} showStatus />
        {#if item.attentionReasons.length}<span
            class="attention-reasons"
            aria-label="Attention reasons"
            >{#each item.attentionReasons as reason}<span class="badge"
                >{resourceLabel(reason)}</span
              >{/each}</span
          >{/if}</button
      >{:else}<div class="empty">
        {route.project || route.search
          ? "No pinned cards match this selection. Change the project or clear the title filter."
          : "No pinned cards yet. Open a card and pin it to keep it here."}
      </div>{/each}
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
  <div class="sectiontitle">
    <h2 id="attention-section-title">Needs my attention</h2>
    <span>{attention.length} visible items</span>
  </div>
  {#each attention as item (item.project_id + ":" + item.target.type + ":" + item.target.id)}<button
      class="listrow"
      onclick={() => openAttention(item)}
      ><span class="priority"></span>
      <div>
        <strong>{item.label}</strong><small
          >{projectLabel(projects, item.project_id)}</small
        >
      </div>
      <span class="attention-reasons" aria-label="Attention reasons"
        >{#each item.reasons as reason}<span class="badge"
            >{resourceLabel(reason)}</span
          >{/each}</span
      ><span aria-hidden="true">↗</span></button
    >{:else}<div class="empty">
      <strong>A little breathing room.</strong>
      <p>No additional items need attention on this page.</p>
    </div>{/each}
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
  <div class="sectiontitle">
    <h2 id="motion-section-title">In motion</h2>
    <span>{activeCards.length} visible active cards</span>
  </div>
  <div class="grid">
    {#each activeCards as item (item.project_id + ":" + item.id)}<button
        class="card"
        onclick={() => open(item)}
        ><small>{projectLabel(projects, item.project_id)}</small>
        <h3>{item.title}</h3>
        <ResourceMetadata {item} showStatus /></button
      >{:else}<div class="empty">
        No other active cards on this page.
      </div>{/each}
  </div>
  {#if activeCardCursor}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards()}>Next active cards</button
    >{/if}
  {#if activeCardPaged}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards(true)}>Previous active cards</button
    >{/if}
</section>

<style>
  .focus-stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    width: min(100%, 900px);
  }
  .focus-card {
    min-width: 0;
    width: 100%;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    color: var(--ink);
    touch-action: pan-y;
    user-select: none;
    cursor: grab;
    text-align: left;
  }
  .focus-card small {
    color: var(--muted);
    font-size: 10px;
  }
  .focus-card:active,
  :global(.focus-card[data-dragging="true"]) {
    cursor: grabbing;
  }
  :global(.focus-card[data-dragging="true"]) {
    opacity: 0.28;
  }
  .focus-card h3 {
    margin: 8px 0 12px;
    font-size: 15px;
    line-height: 1.45;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .focus-order-status {
    width: min(100%, 900px);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .focus-order-status {
    margin: 12px 0 8px;
  }
  .focus-save-details {
    display: grid;
    justify-items: start;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
  }
  .focus-save-details code {
    overflow-wrap: anywhere;
  }
  :global([data-focus-drop-indicator]) {
    transform: translateY(-1px);
  }
</style>
