<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
  import type { WorkspaceRoute } from "../navigation";
  import { type OpenResource } from "./screen-data";
  let {
    route,
    projects,
    cards,
    updates,
    open,
    addProject,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    updates: Summary[];
    open: OpenResource;
    addProject: () => void;
  } = $props();
  const visibleProjects = $derived(
    projects.filter((item) =>
      item.title.toLowerCase().includes(route.search.trim().toLowerCase()),
    ),
  );
</script>

<div class="grid">
  {#each visibleProjects as item}<button
      class="card projectcard"
      onclick={() => open(item)}
      ><div class="projectinitial">
        {item.title.slice(0, 2).toUpperCase()}
      </div>
      <span class="badge">{item.status}</span>
      <h2>{item.title}</h2>
      <p>
        {cards.filter(
          (c) =>
            c.project_id === item.id &&
            !["done", "cancelled"].includes(c.status ?? ""),
        ).length} loaded open cards · {updates.filter(
          (c) => c.project_id === item.id,
        ).length} updates
      </p>
      <footer>
        <span>{item.availability}</span><span>Open project ↗</span>
      </footer></button
    >{:else}<div class="empty">
      <strong>Start with a folder.</strong>
      <p>Add a project from an approved directory to begin.</p>
      <button onclick={addProject}>Add your first project</button>
    </div>{/each}
</div>
