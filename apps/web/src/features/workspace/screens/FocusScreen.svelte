<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import ResourceMetadata from "../../../lib/ui/ResourceMetadata.svelte";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import type { Attention } from "../view-queries";
  import { visibleCards } from "./screen-data";
  let {
    route,
    projects,
    cards,
    milestones,
    focusCards,
    focusCount,
    attentionRows,
    attentionCursor,
    attentionPaged,
    loadingMore,
    open,
    onarrange,
    moreAttention,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    milestones: Summary[];
    focusCards: Summary[];
    focusCount: number;
    attentionRows: Attention[];
    attentionCursor: string | null;
    attentionPaged: boolean;
    loadingMore: boolean;
    open: OpenResource;
    onarrange: () => void;
    moreAttention: (first?: boolean) => Promise<void>;
  } = $props();
  const filtered = $derived(visibleCards(cards, route));
  const visibleFocus = $derived(visibleCards(focusCards, route));
  const attention = $derived.by(() => {
    const grouped = new Map<string, Attention & { reasons: string[] }>();
    for (const item of attentionRows) {
      if (
        (route.project && item.project_id !== route.project) ||
        !item.label.toLowerCase().includes(route.search.trim().toLowerCase())
      )
        continue;
      const key = `${item.project_id}:${item.target.type}:${item.target.id}`;
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.reasons.includes(item.reason))
          existing.reasons.push(item.reason);
      } else grouped.set(key, { ...item, reasons: [item.reason] });
    }
    return [...grouped.values()];
  });
</script>

<div class="stats">
  <div>
    <span>IN MOTION</span><strong
      >{filtered.filter((c) => c.status === "active").length}</strong
    >
    <p>Loaded active cards</p>
  </div>
  <div>
    <span>NEEDS A LOOK</span><strong>{attention.length}</strong>
    <p>Blocked, overdue or up for review</p>
  </div>
  <div>
    <span>ON THE HORIZON</span><strong
      >{milestones.filter(
        (m) => !["achieved", "cancelled"].includes(m.status ?? ""),
      ).length}</strong
    >
    <p>Loaded open milestones</p>
  </div>
</div>
<div class="sectiontitle">
  <h2>In focus</h2>
  <span
    >{visibleFocus.length} pinned{route.project || route.search
      ? " in selection"
      : ""}</span
  >
  {#if focusCount > 1}<button onclick={onarrange}>Arrange focus</button>{/if}
</div>
<div class="grid">
  {#each visibleFocus as item}{#if item}<button
        class="card"
        onclick={() => open(item)}
        ><small>{projectLabel(projects, item.project_id)}</small>
        <h3>{item.title}</h3>
        <ResourceMetadata {item} showStatus /></button
      >{/if}{:else}<div class="empty">
      {route.project || route.search
        ? "No pinned cards match this selection. Change the project or clear the title filter."
        : "No pinned cards yet. Open a card and pin it to keep it here."}
    </div>{/each}
</div>
<div class="sectiontitle">
  <h2>Needs your attention</h2>
  <span>{attention.length} items</span>
</div>
{#each attention as item}<button
    class="listrow"
    onclick={() =>
      open({
        project_id: item.project_id,
        type: item.target.type,
        id: item.target.id,
      })}
    ><span class="priority"></span>
    <div>
      <strong>{item.label}</strong><small
        >{projectLabel(projects, item.project_id)}</small
      >
    </div>
    <span class="attention-reasons"
      >{#each item.reasons as reason}<span class="badge"
          >{resourceLabel(reason)}</span
        >{/each}</span
    ><span aria-hidden="true">↗</span></button
  >{:else}<div class="empty">
    <strong>A little breathing room.</strong>
    <p>No blocked, overdue or review items in this selection.</p>
  </div>{/each}
{#if attentionCursor}<button
    disabled={loadingMore}
    onclick={() => moreAttention()}>Next attention page</button
  >{/if}
{#if attentionPaged}<button
    disabled={loadingMore}
    onclick={() => moreAttention(true)}>First attention page</button
  >{/if}
