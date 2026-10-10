<script lang="ts">
  import { resourceLabel } from "../../../lib/resources/resource-presentation.ts";
  import ResourceMetadata from "../../../lib/ui/ResourceMetadata.svelte";
  import type { Summary } from "../../../lib/api/api";
  import KanbanBoard from "../../board/KanbanBoard.svelte";
  import type { KanbanColumn } from "../../board/board-context";
  import { cardBoardShape } from "../../board/board-view";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import { visibleCards } from "./screen-data";

  let {
    route,
    projects,
    cards,
    open,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    open: OpenResource;
  } = $props();

  const filtered = $derived(visibleCards(cards, route));
  // Cards of every project, read only: a move needs one project's order.
  const columns = $derived<KanbanColumn[]>(
    cardBoardShape.columns.map((status) => {
      const items = filtered
        .filter((card) => card.status === status)
        .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));
      return {
        id: status,
        label: resourceLabel(status),
        total: items.length,
        items,
        firstPage: true,
        lastPage: true,
        locked: true,
      };
    }),
  );
  let kanban = $state<ReturnType<typeof KanbanBoard>>();
  let restored = false;
  $effect(() => {
    if (restored || !kanban || !filtered.length) return;
    restored = true;
    kanban.holdView(true);
    void kanban.restoreView();
  });
</script>

{#snippet details(item: Summary)}
  <span class="card-context">{projectLabel(projects, item.project_id)}</span>
  <ResourceMetadata {item} compact />
{/snippet}

<p role="status" class="board-overview-hint">
  Wybierz cel powyżej, aby przenosić karty.
</p>
<KanbanBoard
  bind:this={kanban}
  viewKey="overview"
  {columns}
  ready={filtered.length > 0}
  {open}
  canMove={() => false}
  onmove={(_item, _column, _placement, settle) => settle(false)}
  {details}
/>

<style>
  .card-context {
    display: block;
    margin-top: var(--space-1);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    line-height: var(--leading-body);
    overflow-wrap: anywhere;
  }
</style>
