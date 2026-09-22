<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
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
  let {
    route,
    projects,
    cards,
    focusCards,
    focusCount,
    attentionRows,
    attentionCursor,
    attentionPaged,
    activeCardCursor,
    activeCardPaged,
    loadingMore,
    open,
    onarrange,
    moreAttention,
    moreActiveCards,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    focusCards: Summary[];
    focusCount: number;
    attentionRows: Attention[];
    attentionCursor: string | null;
    attentionPaged: boolean;
    activeCardCursor: string | null;
    activeCardPaged: boolean;
    loadingMore: boolean;
    open: OpenResource;
    onarrange: () => void;
    moreAttention: (first?: boolean) => Promise<void>;
    moreActiveCards: (back?: boolean) => Promise<void>;
  } = $props();
  const sections = $derived(
    focusSections(cards, focusCards, attentionRows, route),
  );
  const visibleFocus = $derived<FocusCard[]>(sections.focusCards);
  const attention = $derived<FocusAttention[]>(sections.attention);
  const activeCards = $derived(sections.activeCards);

  function openAttention(item: FocusAttention) {
    return open({
      project_id: item.project_id,
      type: item.target.type,
      id: item.target.id,
    });
  }
</script>

<section aria-labelledby="focus-section-title" data-focus-section="focus">
  <div class="sectiontitle">
    <h2 id="focus-section-title">In focus</h2>
    <span>{visibleFocus.length} visible cards</span>
    {#if focusCount > 1}<button onclick={onarrange}>Arrange focus</button>{/if}
  </div>
  <div class="grid">
    {#each visibleFocus as item (item.project_id + ":" + item.id)}<button
        class="card"
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
