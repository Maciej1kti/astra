<script lang="ts">
  import type { WorkspaceRoute } from "./navigation";
  import type { Summary } from "../../lib/api/api";
  import { resourceLabel } from "../../lib/resources/resource-presentation";

  let {
    route = $bindable(),
    projects,
    onprojectchange,
    changeMonth,
  }: {
    route: WorkspaceRoute;
    projects: Summary[];
    onprojectchange: () => void;
    changeMonth: (delta: number) => void;
  } = $props();
  const statuses = ["planned", "active", "review", "done", "cancelled"];
</script>

<div class="toolbar">
  {#if route.view !== "projects"}<label class="sr" for="project">Project</label
    ><select id="project" bind:value={route.project} onchange={onprojectchange}
      ><option value="">All projects</option>{#each projects as item}<option
          value={item.id}>{item.title}</option
        >{/each}</select
    >{/if}<input
    class="search"
    aria-label={["list", "updates"].includes(route.view)
      ? "Search content"
      : "Filter loaded titles"}
    bind:value={route.search}
    placeholder={["list", "updates"].includes(route.view)
      ? "Search content…"
      : "Filter loaded titles…"}
  />{#if route.view === "updates"}<label
      ><input type="checkbox" bind:checked={route.unreadOnly} /> Unread only</label
    >{/if}{#if route.view === "list"}<select
      aria-label="Resource type"
      bind:value={route.collection}
      onchange={() => (route.status = "")}
      ><option value="cards">Cards</option><option value="milestones"
        >Milestones</option
      ></select
    ><select aria-label="Status filter" bind:value={route.status}>
      <option value="">All statuses</option>
      {#each route.collection === "cards" ? statuses : ["planned", "active", "achieved", "cancelled"] as status}<option
          value={status}>{resourceLabel(status)}</option
        >{/each}
    </select>
    {#if route.collection === "cards"}<select
        aria-label="Card visibility"
        bind:value={route.archived}
      >
        <option value={false}>Active cards</option><option value={true}
          >Archived cards</option
        >
      </select><select aria-label="Priority filter" bind:value={route.priority}>
        <option value="">All priorities</option
        >{#each ["urgent", "high", "normal", "low"] as priority}<option
            value={priority}>{resourceLabel(priority)}</option
          >{/each}
      </select><input
        aria-label="Tag filter"
        placeholder="Exact tag…"
        bind:value={route.label}
      />{/if}
    {#if route.status || route.priority || route.label || route.archived}<button
        onclick={() => {
          route.status = "";
          route.priority = "";
          route.label = "";
          route.archived = false;
        }}>Clear filters</button
      >{/if}
  {/if}{#if route.view === "gantt"}<div class="month">
      <button onclick={() => changeMonth(-1)} aria-label="Previous month"
        >←</button
      ><input type="month" aria-label="Month" bind:value={route.month} /><button
        onclick={() => changeMonth(1)}
        aria-label="Next month">→</button
      >
    </div>{/if}
</div>
