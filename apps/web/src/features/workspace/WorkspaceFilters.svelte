<script lang="ts">
  import type { WorkspaceRoute } from "./navigation";
  import type { RouteFilters } from "./navigation-state.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    route,
    onchange,
    changeMonth,
  }: {
    route: Readonly<WorkspaceRoute>;
    onchange: (patch: Partial<RouteFilters>) => void;
    changeMonth: (delta: number) => void;
  } = $props();
  const statuses = ["planned", "active", "review", "done", "cancelled"];
  const id = $props.id();
  let filtersExpanded = $state(false);
  const filterCount = $derived(
    [route.status, route.priority, route.label, route.archived].filter(Boolean)
      .length,
  );
</script>

<div class="workspace-filters" class:list-filters={route.view === "list"}>
  <div class="toolbar">
    <div class="filter-search-group">
      <input
        class="search"
        aria-label={["list", "updates"].includes(route.view)
          ? "Search content"
          : "Filter loaded titles"}
        value={route.search}
        oninput={(event) => onchange({ search: event.currentTarget.value })}
        placeholder={["list", "updates"].includes(route.view)
          ? "Search content…"
          : "Filter titles…"}
      />
      {#if route.view === "list"}
        <button
          class="list-filter-toggle ui-button"
          class:active={filterCount > 0}
          aria-expanded={filtersExpanded}
          aria-controls={id}
          onclick={() => (filtersExpanded = !filtersExpanded)}
          ><Icon name="filter" small />Filters{#if filterCount}<span
              class="filter-count">{filterCount}</span
            >{/if}</button
        >
      {/if}
    </div>
    {#if route.view === "updates"}
      <label class="filter-check"
        ><input
          type="checkbox"
          checked={route.unreadOnly}
          onchange={(event) =>
            onchange({ unreadOnly: event.currentTarget.checked })}
        /> Unread only</label
      >
    {/if}
    {#if route.view === "gantt"}
      <div class="month">
        <button onclick={() => changeMonth(-1)} aria-label="Previous month"
          >←</button
        >
        <input
          type="month"
          aria-label="Month"
          value={route.month}
          onchange={(event) => onchange({ month: event.currentTarget.value })}
        />
        <button onclick={() => changeMonth(1)} aria-label="Next month">→</button
        >
      </div>
    {/if}
  </div>
  {#if route.view === "list"}
    <div class="list-filter-fields" class:expanded={filtersExpanded} {id}>
      <label
        >Status<select
          aria-label="Status filter"
          value={route.status}
          onchange={(event) => onchange({ status: event.currentTarget.value })}
        >
          <option value="">All statuses</option>
          {#each statuses as status}<option value={status}
              >{resourceLabel(status)}</option
            >{/each}
        </select></label
      >
      <label
        >Visibility<select
          aria-label="Card visibility"
          value={String(route.archived)}
          onchange={(event) =>
            onchange({ archived: event.currentTarget.value === "true" })}
        >
          <option value="false">Active cards</option><option value="true"
            >Archived cards</option
          >
        </select></label
      >
      <label
        >Priority<select
          aria-label="Priority filter"
          value={route.priority}
          onchange={(event) =>
            onchange({ priority: event.currentTarget.value })}
        >
          <option value="">All priorities</option>
          {#each ["normal", "high"] as priority}<option value={priority}
              >{resourceLabel(priority)}</option
            >{/each}
        </select></label
      >
      <label
        >Tag<input
          aria-label="Tag filter"
          placeholder="Exact tag…"
          value={route.label}
          oninput={(event) => onchange({ label: event.currentTarget.value })}
        /></label
      >
      {#if filterCount}
        <button
          class="quiet clear-filters"
          onclick={() =>
            onchange({ status: "", priority: "", label: "", archived: false })}
          >Clear filters</button
        >
      {/if}
    </div>
  {/if}
</div>
