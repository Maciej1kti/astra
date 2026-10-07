<script lang="ts">
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import type { Summary } from "../../../lib/api/api";
  import ActionMenu from "../../../lib/ui/ActionMenu.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";
  import EmptyState from "../../../lib/ui/EmptyState.svelte";
  import KanbanBoard from "../../board/KanbanBoard.svelte";
  import type { KanbanColumn } from "../../board/board-context";
  import type { BoardViewShape } from "../../board/board-view";
  import type { WorkspaceRoute } from "../navigation";
  import {
    canMoveProject,
    currentProjectSnapshot,
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
    onmove: (
      item: Summary,
      state: ProjectState,
      settle: (saved: boolean) => void,
    ) => void;
    onremove: (item: Summary) => void;
    disabled?: boolean;
  } = $props();

  // Projects without a readable state stay visible in a column nothing enters.
  const unavailableColumn = "unavailable";
  const viewShape: BoardViewShape = {
    columns: [...projectStates, unavailableColumn],
    collapsed: [],
  };
  const visibleProjects = $derived(filterProjects(projects, route));
  const columns = $derived.by<KanbanColumn[]>(() => {
    const column = (id: string, label: string, items: Summary[]) => ({
      id,
      label,
      total: items.length,
      items,
      firstPage: true,
      lastPage: true,
    });
    const unavailable = visibleProjects.filter((item) => !projectState(item));
    return [
      ...projectStates.map((state) =>
        column(
          state,
          projectStateLabels[state],
          visibleProjects.filter((item) => item.status === state),
        ),
      ),
      ...(unavailable.length
        ? [
            {
              ...column(unavailableColumn, "Niedostępne", unavailable),
              locked: true,
            },
          ]
        : []),
    ];
  });
  const hasUnavailable = $derived(columns.length > projectStates.length);
  let announcement = $state("");
  let kanban = $state<ReturnType<typeof KanbanBoard>>();
  let restored = false;
  $effect(() => {
    if (restored || !kanban || !visibleProjects.length) return;
    restored = true;
    kanban.holdView(true);
    void kanban.restoreView();
  });

  const rank = (item: Summary) =>
    visibleProjects.findIndex((entry) => entry.id === item.id);
  function move(
    item: Summary,
    state: ProjectState,
    settle: (saved: boolean) => void,
  ) {
    // A changed source cancels the move; it never supplies a replacement version.
    if (
      disabled ||
      item.status === state ||
      !currentProjectSnapshot(item, visibleProjects)
    ) {
      announcement = "Status projektu bez zmian.";
      return settle(false);
    }
    announcement = `Przenoszenie ${item.title} do ${projectStateLabels[state]}.`;
    onmove(item, state, settle);
  }
  /** A menu move goes through the board, so the card is seen to move. */
  function menuMove(item: Summary, state: ProjectState) {
    kanban?.move(item, state);
  }
</script>

{#snippet details(item: Summary)}
  {#if item.folder || (item.availability && item.availability !== "ready")}
    <span class="resource-metadata project-meta">
      {#if item.folder}<Badge>{item.folder}</Badge>{/if}
      {#if item.availability && item.availability !== "ready"}
        <span class="project-availability"
          >{resourceLabel(item.availability)}</span
        >
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet actions(item: Summary)}
  <ActionMenu
    placement="auto"
    label={`Więcej działań dla ${item.title}`}
    {disabled}
  >
    {#snippet children(close)}
      {#if canMoveProject(item)}
        {#each projectStates.filter((state) => state !== item.status) as state}
          <button
            class="quiet"
            onclick={() => {
              close();
              menuMove(item, state);
            }}
          >
            Przenieś do {projectStateLabels[state]}
          </button>
        {/each}
      {/if}
      <button
        class="project-delete quiet"
        onclick={() => {
          close();
          onremove(item);
        }}>Usuń projekt</button
      >
    {/snippet}
  </ActionMenu>
{/snippet}

<div class="projects-screen">
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
  {#if hasUnavailable}
    <p class="projects-help">
      Projekty w kolumnie Niedostępne nie mają dostępnego statusu. Otwórz
      projekt, aby sprawdzić jego źródło.
    </p>
  {/if}
  <div
    class="project-status-board"
    role="region"
    aria-label="Tablica statusów projektów"
  >
    <KanbanBoard
      bind:this={kanban}
      viewKey="projects"
      {viewShape}
      {columns}
      ordered={false}
      ready={visibleProjects.length > 0}
      {open}
      canMove={(item) => !disabled && canMoveProject(item)}
      {rank}
      onmove={(item, column, _placement, settle) => {
        const state = projectState({ status: column.id });
        if (state) move(item, state, settle);
        else settle(false);
      }}
      {details}
      {actions}
    />
  </div>
</div>

<style>
  .projects-screen,
  .project-status-board {
    min-width: 0;
    max-width: 100%;
  }
  .projects-help {
    margin: 0 0 var(--space-8);
    color: var(--muted);
    font-size: var(--text-base);
    line-height: var(--leading-body);
  }
  .project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
    align-items: center;
    min-width: 0;
    margin-top: var(--space-3);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    line-height: var(--leading-body);
  }
  .project-meta :global(.badge) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .project-availability {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .project-delete {
    color: var(--danger);
  }
</style>
