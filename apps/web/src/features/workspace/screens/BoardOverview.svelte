<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import ResourceMetadata from "../../../lib/ui/ResourceMetadata.svelte";
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
  const statuses = ["planned", "active", "review", "done", "cancelled"];
  const filtered = $derived(visibleCards(cards, route));
</script>

<p role="status">
  All projects is an overview. Select a project above to drag and reorder cards.
</p>
<div class="board">
  {#each statuses as status}<section class="column">
      <div class="sectiontitle">
        <h2>{status}</h2>
        <span>{filtered.filter((c) => c.status === status).length}</span>
      </div>
      {#each filtered
        .filter((c) => c.status === status)
        .sort( (a, b) => (a.position ?? "").localeCompare(b.position ?? "") ) as item}<button
          class="card"
          onclick={() => open(item)}
          ><small>{projectLabel(projects, item.project_id)}</small>
          <h3>{item.title}</h3>
          <ResourceMetadata {item} compact /></button
        >{:else}<p class="columnempty">Nothing here yet</p>{/each}
    </section>{/each}
</div>
