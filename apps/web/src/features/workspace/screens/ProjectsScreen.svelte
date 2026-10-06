<script lang="ts">
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import { counted } from "../../../lib/ui/locale.ts";
  import type { Summary } from "../../../lib/api/api";
  import ActionMenu from "../../../lib/ui/ActionMenu.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";
  import EmptyState from "../../../lib/ui/EmptyState.svelte";
  import Icon from "../../../lib/ui/Icon.svelte";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";
  import type { WorkspaceRoute } from "../navigation";
  import { projectStatusGesture } from "./project-status-gesture";
  import {
    canMoveProject,
    projectState,
    projectStateLabels,
    projectStates,
    visibleProjects as filterProjects,
    type ProjectState,
  } from "./projects-board";
  import type { OpenResource } from "./screen-data";

  let {
    route,
    projects,
    open,
    addProject,
    onmove,
    onremove,
    disabled = false,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    open: OpenResource;
    addProject: () => void;
    onmove: (item: Summary, state: ProjectState) => void;
    onremove: (item: Summary) => void;
    disabled?: boolean;
  } = $props();

  const visibleProjects = $derived(filterProjects(projects, route));
  const columns = $derived(
    projectStates.map((state) => ({
      state,
      projects: visibleProjects.filter((item) => item.status === state),
    })),
  );
  const unavailable = $derived(
    visibleProjects.filter((item) => !projectState(item)),
  );
  let announcement = $state("");
  const id = $props.id();
  const helpId = `${id}-help`;

  function move(item: Summary, state: ProjectState) {
    if (disabled || !canMoveProject(item) || item.status === state) return;
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
  <article
    class="card projectcard project-board"
    data-project-board-item={item.id}
  >
    <button
      type="button"
      class="projectopen"
      data-project-board-open
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
    </button>
    {#if item.folder || (item.availability && item.availability !== "ready")}
      <div class="resource-metadata project-board-meta">
        {#if item.folder}<Badge>{item.folder}</Badge>{/if}
        {#if item.availability && item.availability !== "ready"}
          <span class="project-availability"
            >{resourceLabel(item.availability)}</span
          >
        {/if}
      </div>
    {/if}
    <div class="project-board-actions">
      <button
        type="button"
        class="quiet icon-button project-board-handle"
        data-project-board-handle
        aria-label={`Przeciągnij ${item.title} aby zmienić status projektu`}
        aria-describedby={helpId}
        aria-pressed="false"
        title="Przeciągnij, aby zmienić status"
        disabled={disabled || !canMoveProject(item)}
        ><Icon name="grip" /></button
      >
      <div class="project-board-menus">
        <ActionMenu
          placement="auto"
          icon="board"
          label={`Przenieś ${item.title}`}
          disabled={disabled || !canMoveProject(item)}
        >
          {#snippet children(close)}
            {#each projectStates.filter((state) => state !== item.status) as state}
              <button
                class="quiet"
                onclick={() => {
                  close();
                  move(item, state);
                }}
              >
                Przenieś do {projectStateLabels[state]}
              </button>
            {/each}
          {/snippet}
        </ActionMenu>
        <ActionMenu
          placement="auto"
          label={`Więcej działań dla ${item.title}`}
          {disabled}
        >
          {#snippet children(close)}
            <button
              class="project-delete quiet"
              onclick={() => {
                close();
                onremove(item);
              }}>Usuń projekt</button
            >
          {/snippet}
        </ActionMenu>
      </div>
    </div>
  </article>
{/snippet}

<div class="projects-screen">
  <p class="projects-help sr" id={helpId}>
    Przeciągnij projekt za uchwyt lub użyj menu przenoszenia, aby zmienić
    status.
  </p>
  <span class="sr" aria-live="polite" aria-atomic="true">{announcement}</span>
  {#if !visibleProjects.length}
    <EmptyState
      title={projects.length
        ? "Brak projektów pasujących do wyboru."
        : "Zacznij od projektu."}
    >
      <p>
        {projects.length
          ? "Wybierz inny folder lub wyczyść filtr tytułu."
          : "Dodaj projekt z zatwierdzonego katalogu, aby rozpocząć."}
      </p>
      {#if !projects.length}<button onclick={addProject}
          >Dodaj pierwszy projekt</button
        >{/if}
    </EmptyState>
  {/if}
  <div
    class="project-status-board"
    role="region"
    aria-label="Tablica statusów projektów"
    use:projectStatusGesture={gestureOptions()}
  >
    {#each columns as column (column.state)}
      <section
        class="project-state-column"
        data-project-state={column.state}
        aria-label={`${projectStateLabels[column.state]} projekty`}
      >
        <SectionHeading
          title={projectStateLabels[column.state]}
          count={column.projects.length}
          countLabel={counted(
            column.projects.length,
            "projekt",
            "projekty",
            "projektów",
          )}
        />
        {#each column.projects as item (item.id)}
          {@render projectTile(item)}
        {:else}<p class="columnempty">Brak projektów w tym statusie</p>{/each}
      </section>
    {/each}
  </div>
  {#if unavailable.length}
    <section
      class="projects-unavailable"
      data-project-state="unavailable"
      aria-label="Niedostępne projekty"
    >
      <SectionHeading
        title="Niedostępne"
        count={unavailable.length}
        countLabel={counted(
          unavailable.length,
          "projekt",
          "projekty",
          "projektów",
        )}
      />
      <p class="projects-help">
        Te projekty nie mają dostępnego statusu. Otwórz projekt, aby sprawdzić
        jego źródło.
      </p>
      <div class="grid">
        {#each unavailable as item (item.id)}{@render projectTile(item)}{/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .projects-screen {
    min-width: 0;
    max-width: 100%;
  }
  .projects-help {
    margin: 0 0 var(--space-8);
    color: var(--muted);
    font-size: var(--text-base);
    line-height: var(--leading-body);
  }
  .project-status-board {
    display: flex;
    align-items: stretch;
    gap: var(--space-6);
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-bottom: var(--space-9);
  }
  .project-state-column {
    flex: 1 0 var(--card-min-width);
    min-width: var(--card-min-width);
    min-height: var(--board-min-height);
    padding: var(--space-4);
    background: var(--soft);
    border: var(--stroke) solid transparent;
    border-radius: var(--radius-panel);
  }
  .project-state-column :global(.sectiontitle) {
    margin: var(--space-4) var(--space-4) var(--space-6);
  }
  .project-state-column :global(.sectiontitle h2) {
    font-size: var(--text-base);
  }
  .project-state-column:global([data-project-board-drop-target]) {
    border-color: var(--accent-ink);
    background: var(--accent);
  }
  .project-board {
    margin-bottom: var(--space-4);
    padding: var(--space-8);
  }
  .project-board:global([data-dragging]) {
    opacity: var(--drag-opacity);
  }
  .project-board .card-title {
    margin: 0;
    font-size: var(--text-lg);
  }
  .project-board-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: center;
    margin-top: var(--space-6);
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .project-board-meta :global(.badge) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .project-board-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    margin: var(--space-2) calc(-1 * var(--space-4)) calc(-1 * var(--space-4));
    color: var(--muted);
  }
  .project-board-actions :global(button) {
    color: inherit;
  }
  .project-board-handle {
    touch-action: none;
    cursor: grab;
  }
  .project-board-menus {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .project-board-handle:global([aria-pressed="true"]) {
    cursor: grabbing;
  }
  .projects-unavailable {
    margin-top: var(--space-8);
  }
  @media (max-width: 700px) {
    .project-state-column {
      flex-basis: min(82vw, var(--field-max-width));
    }
  }
</style>
