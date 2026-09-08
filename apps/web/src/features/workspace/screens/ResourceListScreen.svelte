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
    milestones,
    open,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    milestones: Summary[];
    open: OpenResource;
  } = $props();
  const items = $derived(
    route.collection === "cards"
      ? visibleCards(cards, route)
      : milestones.filter(
          (item) => !route.project || item.project_id === route.project,
        ),
  );
</script>

<div class="table">
  <div class="tablehead">
    <span>Title / project</span><span>Card details</span>
  </div>
  {#each items as item}<button class="listrow" onclick={() => open(item)}
      ><div>
        <strong>{item.title}</strong><small
          >{projectLabel(projects, item.project_id)}</small
        >
      </div>
      <div class="row-metadata">
        <ResourceMetadata {item} showStatus compact />
      </div></button
    >{:else}<div class="empty">
      {route.archived && route.collection === "cards"
        ? "No archived cards match this selection. Clear filters to see more archived cards."
        : "No items match this selection. Try another project or clear the filters."}
    </div>{/each}
</div>
