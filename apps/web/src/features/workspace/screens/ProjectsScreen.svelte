<script lang="ts">
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import Badge from "../../../lib/ui/Badge.svelte";
  import EmptyState from "../../../lib/ui/EmptyState.svelte";
  import ActionMenu from "../../../lib/ui/ActionMenu.svelte";

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
    onremove,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    updates: Summary[];
    open: OpenResource;
    addProject: () => void;
    onremove: (project: Summary) => void;
  } = $props();
  const visibleProjects = $derived(
    projects.filter((item) =>
      item.title.toLowerCase().includes(route.search.trim().toLowerCase()),
    ),
  );
</script>

<div class="grid">
  {#each visibleProjects as item}<article class="card projectcard">
      <button class="projectopen" onclick={() => open(item)}>
        <div class="projectinitial">
          {item.title.slice(0, 2).toUpperCase()}
        </div>
        <span class="projectcopy">
          <h2>{item.title}</h2>
          <p>
            {cards.filter(
              (c) =>
                c.project_id === item.id &&
                !["done", "cancelled"].includes(c.status ?? ""),
            ).length} cards shown · {updates.filter(
              (c) => c.project_id === item.id,
            ).length} updates
          </p>
        </span>
        <span class="projectopen-icon" aria-hidden="true">↗</span>
      </button>
      <div class="project-meta">
        {#if item.folder}<Badge>{item.folder}</Badge>{/if}
        <Badge data-state={item.status}
          >{resourceLabel(item.status ?? "")}</Badge
        >
        {#if item.availability !== "ready"}<span class="project-availability"
            >{item.availability}</span
          >{/if}
        <ActionMenu label={`More actions for ${item.title}`}>
          {#snippet children(close)}
            <button
              class="project-delete quiet"
              onclick={() => {
                close();
                onremove(item);
              }}>Delete project</button
            >
          {/snippet}
        </ActionMenu>
      </div>
    </article>{:else}<EmptyState>
      <strong>Start with a folder.</strong>
      <p>Add a project from an approved directory to begin.</p>
      <button onclick={addProject}>Add your first project</button>
    </EmptyState>{/each}
</div>
