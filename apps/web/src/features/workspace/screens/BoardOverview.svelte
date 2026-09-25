<script lang="ts">
  import ResourceCard from "../../../lib/ui/ResourceCard.svelte";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";

  import type { Summary } from "../../../lib/api/api";
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
  const statuses = ["planned", "active", "review", "done", "cancelled"];
  const filtered = $derived(visibleCards(cards, route));
</script>

<p role="status">
  All projects is an overview. Select a project above to drag and reorder cards.
</p>
<div class="board">
  {#each statuses as status}<section class="column">
      <SectionHeading
        title={status}
        count={filtered.filter((c) => c.status === status).length}
      />
      {#each filtered
        .filter((c) => c.status === status)
        .sort( (a, b) => (a.position ?? "").localeCompare(b.position ?? "") ) as item}<ResourceCard
          {item}
          projectName={projectLabel(projects, item.project_id)}
          onclick={() => open(item)}
        />{:else}<p class="columnempty">Nothing here yet</p>{/each}
    </section>{/each}
</div>
