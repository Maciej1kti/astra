<script lang="ts">
  import { resourceLabel } from "../../../lib/resources/resource-presentation.ts";
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
  const counts = $derived(
    Object.fromEntries(
      statuses.map((status) => [
        status,
        filtered.filter((card) => card.status === status).length,
      ]),
    ),
  );
  const hasCards = $derived(filtered.length > 0);
</script>

<p role="status" class="board-overview-hint">
  Wybierz projekt powyżej, aby przenosić karty.
</p>
<div class="board board-overview">
  {#each statuses as status}<section
      class="column"
      class:mobile-empty={hasCards && !counts[status]}
    >
      <SectionHeading title={resourceLabel(status)} count={counts[status]} />
      {#each filtered
        .filter((c) => c.status === status)
        .sort( (a, b) => (a.position ?? "").localeCompare(b.position ?? "") ) as item}<ResourceCard
          {item}
          projectName={projectLabel(projects, item.project_id)}
          onclick={() => open(item)}
        />{:else}<p class="columnempty">Jeszcze nic tu nie ma</p>{/each}
    </section>{/each}
</div>
