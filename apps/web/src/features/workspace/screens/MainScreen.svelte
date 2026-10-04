<script lang="ts">
  import type { Summary } from "../../../lib/api/api";
  import ActionMenu from "../../../lib/ui/ActionMenu.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";
  import EmptyState from "../../../lib/ui/EmptyState.svelte";
  import Icon from "../../../lib/ui/Icon.svelte";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";
  import type { WorkspaceRoute } from "../navigation";
  import { mainProjectGesture } from "./main-project-gesture";
  import {
    canMoveMainProject,
    mainProjectState,
    mainProjectStateLabels,
    mainProjectStates,
    visibleMainProjects,
    type MainProjectState,
  } from "./main-projects";
  import type { OpenResource } from "./screen-data";

  let {
    route,
    projects,
    open,
    addProject,
    onmove,
    disabled = false,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    open: OpenResource;
    addProject: () => void;
    onmove: (item: Summary, state: MainProjectState) => void;
    disabled?: boolean;
  } = $props();

  const visibleProjects = $derived(visibleMainProjects(projects, route));
  const columns = $derived(
    mainProjectStates.map((state) => ({
      state,
      projects: visibleProjects.filter((item) => item.status === state),
    })),
  );
  const unavailable = $derived(
    visibleProjects.filter((item) => !mainProjectState(item)),
  );
  let announcement = $state("");
  const id = $props.id();
  const helpId = `${id}-help`;

  function move(item: Summary, state: MainProjectState) {
    if (disabled || !canMoveMainProject(item) || item.status === state) return;
    onmove(item, state);
  }

  function gestureOptions() {
    return {
      projects: () => visibleProjects,
      scope: () => `${route.folder}\n${route.search.trim()}`,
      disabled: () => disabled,
      commit: move,
      announce: (message: string) => {
        announcement = message;
      },
    };
  }
</script>

{#snippet projectTile(item: Summary)}
  <article class="card projectcard main-project" data-main-project={item.id}>
    <button
      type="button"
      class="projectopen"
      data-main-project-open
      aria-label={item.title}
      onclick={() => open(item)}
    >
      <span class="projectinitial" aria-hidden="true"
        >{item.title.slice(0, 2).toUpperCase()}</span
      >
      <span class="projectcopy"
        ><span class="card-title" role="heading" aria-level="3"
          >{item.title}</span
        ></span
      >
      <span class="projectopen-icon" aria-hidden="true">↗</span>
    </button>
    {#if item.folder || (item.availability && item.availability !== "ready")}
      <div class="resource-metadata main-project-meta">
        {#if item.folder}<Badge>{item.folder}</Badge>{/if}
        {#if item.availability && item.availability !== "ready"}
          <span class="main-availability">{item.availability}</span>
        {/if}
      </div>
    {/if}
    <div class="main-project-actions">
      <button
        type="button"
        class="quiet icon-button main-project-handle"
        data-main-project-handle
        aria-label={`Drag ${item.title} to change project status`}
        aria-describedby={helpId}
        aria-pressed="false"
        title="Drag to change status"
        disabled={disabled || !canMoveMainProject(item)}
        ><Icon name="grip" /></button
      >
      <ActionMenu
        placement="auto"
        label={`Move ${item.title}`}
        disabled={disabled || !canMoveMainProject(item)}
      >
        {#snippet children(close)}
          {#each mainProjectStates.filter((state) => state !== item.status) as state}
            <button
              class="quiet"
              onclick={() => {
                close();
                move(item, state);
              }}
            >
              Move to {mainProjectStateLabels[state]}
            </button>
          {/each}
        {/snippet}
      </ActionMenu>
    </div>
  </article>
{/snippet}

<div class="main-screen">
  <p class="main-help" id={helpId}>
    Drag a project by its handle, or use its move menu to change status.
  </p>
  <span class="sr" aria-live="polite" aria-atomic="true">{announcement}</span>
  {#if !visibleProjects.length}
    <EmptyState
      title={projects.length
        ? "No projects match this selection."
        : "Start with a project."}
    >
      <p>
        {projects.length
          ? "Choose another folder or clear the title filter."
          : "Add a project from an approved directory to begin."}
      </p>
      {#if !projects.length}<button onclick={addProject}
          >Add your first project</button
        >{/if}
    </EmptyState>
  {/if}
  <div
    class="main-board"
    role="region"
    aria-label="Project status board"
    use:mainProjectGesture={gestureOptions()}
  >
    {#each columns as column (column.state)}
      <section
        class="main-column"
        data-main-state={column.state}
        aria-label={`${mainProjectStateLabels[column.state]} projects`}
      >
        <SectionHeading
          title={mainProjectStateLabels[column.state]}
          count={column.projects.length}
          countLabel={`${column.projects.length} projects`}
        />
        {#each column.projects as item (item.id)}
          {@render projectTile(item)}
        {:else}<p class="columnempty">No {column.state} projects</p>{/each}
      </section>
    {/each}
  </div>
  {#if unavailable.length}
    <section
      class="main-unavailable"
      data-main-state="unavailable"
      aria-label="Unavailable projects"
    >
      <SectionHeading
        title="Unavailable"
        count={unavailable.length}
        countLabel={`${unavailable.length} projects`}
      />
      <p class="main-help">
        These projects have no available status. Open a project to inspect its
        source.
      </p>
      <div class="grid">
        {#each unavailable as item (item.id)}{@render projectTile(item)}{/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .main-screen {
    min-width: 0;
    max-width: 100%;
  }
  .main-help {
    margin: 0 0 var(--space-8);
    color: var(--muted);
    font-size: var(--text-label);
    line-height: var(--leading-body);
  }
  .main-board {
    display: flex;
    align-items: stretch;
    gap: var(--space-6);
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-bottom: var(--space-9);
  }
  .main-column {
    flex: 1 0 var(--card-min-width);
    min-width: var(--card-min-width);
    min-height: var(--board-min-height);
    padding: var(--space-4);
    background: var(--soft);
    border: var(--stroke) solid transparent;
    border-radius: var(--radius-panel);
  }
  .main-column :global(.sectiontitle) {
    margin: var(--space-4) var(--space-4) var(--space-6);
  }
  .main-column :global(.sectiontitle h2) {
    font-size: var(--text-base);
  }
  .main-column:global([data-main-drop-target]) {
    border-color: var(--accent-ink);
    background: var(--accent);
  }
  .main-project {
    margin-bottom: var(--space-4);
    padding: var(--space-8);
  }
  .main-project:global([data-dragging]) {
    opacity: var(--drag-opacity);
  }
  .main-project .card-title {
    margin: 0;
    font-size: var(--text-card);
  }
  .main-project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: center;
    margin-top: var(--space-6);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .main-project-meta :global(.badge) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .main-availability {
    text-transform: capitalize;
  }
  .main-project-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: var(--stroke) solid var(--line);
  }
  .main-project-handle {
    touch-action: none;
    cursor: grab;
  }
  .main-project-handle:global([aria-pressed="true"]) {
    cursor: grabbing;
  }
  .main-unavailable {
    margin-top: var(--space-8);
  }
  @media (max-width: 767px) {
    .main-column {
      flex-basis: min(82vw, var(--field-max-width));
    }
  }
</style>
