<script lang="ts">
  import type { WorkspaceRoute } from "./navigation";
  import type { RouteFilters } from "./navigation-state.svelte";
  import type { Summary } from "../../lib/api/api";
  import { resourceLabel } from "../../lib/resources/resource-presentation";

  let {
    route,
    projects,
    onchange,
    changeMonth,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    onchange: (patch: Partial<RouteFilters>) => void;
    changeMonth: (delta: number) => void;
  } = $props();
  const statuses = ["planned", "active", "review", "done", "cancelled"];
</script>

<div class="toolbar">
  {#if route.view !== "projects"}<label class="sr" for="project">Project</label
    ><select
      id="project"
      value={route.project}
      onchange={(event) => onchange({ project: event.currentTarget.value })}
      ><option value="">All projects</option>{#each projects as item}<option
          value={item.id}>{item.title}</option
        >{/each}</select
    >{/if}<input
    class="search"
    aria-label={["list", "updates"].includes(route.view)
      ? "Search content"
      : "Filter loaded titles"}
    value={route.search}
    oninput={(event) => onchange({ search: event.currentTarget.value })}
    placeholder={["list", "updates"].includes(route.view)
      ? "Search content…"
      : "Filter loaded titles…"}
  />{#if route.view === "updates"}<label
      ><input
        type="checkbox"
        checked={route.unreadOnly}
        onchange={(event) =>
          onchange({ unreadOnly: event.currentTarget.checked })}
      /> Unread only</label
    >{/if}{#if route.view === "list"}<select
      aria-label="Resource type"
      value={route.collection}
      onchange={(event) =>
        onchange({
          collection: event.currentTarget.value as RouteFilters["collection"],
        })}
      ><option value="cards">Cards</option><option value="milestones"
        >Milestones</option
      ></select
    ><select
      aria-label="Status filter"
      value={route.status}
      onchange={(event) => onchange({ status: event.currentTarget.value })}
    >
      <option value="">All statuses</option>
      {#each route.collection === "cards" ? statuses : ["planned", "active", "achieved", "cancelled"] as status}<option
          value={status}>{resourceLabel(status)}</option
        >{/each}
    </select>
    {#if route.collection === "cards"}<select
        aria-label="Card visibility"
        value={String(route.archived)}
        onchange={(event) =>
          onchange({ archived: event.currentTarget.value === "true" })}
      >
        <option value="false">Active cards</option><option value="true"
          >Archived cards</option
        >
      </select><select
        aria-label="Priority filter"
        value={route.priority}
        onchange={(event) => onchange({ priority: event.currentTarget.value })}
      >
        <option value="">All priorities</option
        >{#each ["urgent", "high", "normal", "low"] as priority}<option
            value={priority}>{resourceLabel(priority)}</option
          >{/each}
      </select><input
        aria-label="Tag filter"
        placeholder="Exact tag…"
        value={route.label}
        oninput={(event) => onchange({ label: event.currentTarget.value })}
      />{/if}
    {#if route.status || route.priority || route.label || route.archived}<button
        onclick={() =>
          onchange({ status: "", priority: "", label: "", archived: false })}
        >Clear filters</button
      >{/if}
  {/if}{#if route.view === "gantt"}<div class="month">
      <button onclick={() => changeMonth(-1)} aria-label="Previous month"
        >←</button
      ><input
        type="month"
        aria-label="Month"
        value={route.month}
        onchange={(event) => onchange({ month: event.currentTarget.value })}
      /><button onclick={() => changeMonth(1)} aria-label="Next month">→</button
      >
    </div>{/if}
</div>
