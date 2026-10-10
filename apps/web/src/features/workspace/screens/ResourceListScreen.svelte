<script lang="ts">
  import EmptyState from "../../../lib/ui/EmptyState.svelte";

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
  const items = $derived(visibleCards(cards, route));
</script>

{#if items.length}
  <div class="table">
    {#each items as item}<button class="listrow" onclick={() => open(item)}
        ><div>
          <strong>{item.title}</strong>{#if !route.project}<small
              >{projectLabel(projects, item.project_id)}</small
            >{/if}
        </div>
        <div class="row-metadata">
          <ResourceMetadata {item} showStatus compact />
        </div></button
      >{/each}
  </div>
{:else}<EmptyState>
    {route.archived
      ? "Brak zarchiwizowanych kart pasujących do wyboru. Wyczyść filtry, aby zobaczyć więcej zarchiwizowanych kart."
      : "Brak kart pasujących do wyboru. Wybierz inny cel lub wyczyść filtry."}
  </EmptyState>{/if}
