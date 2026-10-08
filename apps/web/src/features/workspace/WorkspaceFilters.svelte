<script lang="ts">
  import { revealLayers } from "../../lib/ui/motion-layers";
  import type { WorkspaceRoute } from "./navigation";
  import type { RouteFilters } from "./navigation-state.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    route,
    onchange,
  }: {
    route: Readonly<WorkspaceRoute>;
    onchange: (patch: Partial<RouteFilters>) => void;
  } = $props();
  const statuses = ["planned", "active", "review", "done", "cancelled"];
  const id = $props.id();
  let filtersExpanded = $state(false);
  const filterCount = $derived(
    [route.status, route.priority, route.label, route.archived].filter(Boolean)
      .length,
  );
</script>

<div
  class="workspace-filters"
  class:list-filters={route.view === "list"}
  use:revealLayers={{
    key: route.view,
    layers: [
      {
        selector: ":scope > .toolbar > *",
        role: "detail",
        delay: 80,
        stagger: 40,
      },
      { selector: ":scope > .list-filter-fields", role: "content", delay: 140 },
      {
        selector: ":scope > .list-filter-fields > *",
        role: "detail",
        delay: 220,
        stagger: 40,
        afterParent: true,
      },
    ],
  }}
>
  <div class="toolbar">
    <div class="filter-search-group">
      <input
        class="search"
        aria-label={["list", "updates"].includes(route.view)
          ? "Szukaj w treści"
          : "Filtruj wczytane tytuły"}
        value={route.search}
        oninput={(event) => onchange({ search: event.currentTarget.value })}
        placeholder={["list", "updates"].includes(route.view)
          ? "Szukaj w treści…"
          : "Filtruj tytuły…"}
      />
      {#if route.view === "list"}
        <button
          class="list-filter-toggle ui-button"
          class:active={filterCount > 0}
          aria-expanded={filtersExpanded}
          aria-controls={id}
          onclick={() => (filtersExpanded = !filtersExpanded)}
          ><Icon name="filter" small />Filtry{#if filterCount}<span
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
        /> Tylko nieprzeczytane</label
      >
    {/if}
  </div>
  {#if route.view === "list"}
    <div class="list-filter-fields" class:expanded={filtersExpanded} {id}>
      <label
        >Status<select
          aria-label="Filtr statusu"
          value={route.status}
          onchange={(event) => onchange({ status: event.currentTarget.value })}
        >
          <option value="">Wszystkie statusy</option>
          {#each statuses as status}<option value={status}
              >{resourceLabel(status)}</option
            >{/each}
        </select></label
      >
      <label
        >Widoczność<select
          aria-label="Widoczność kart"
          value={String(route.archived)}
          onchange={(event) =>
            onchange({ archived: event.currentTarget.value === "true" })}
        >
          <option value="false">Aktywne karty</option><option value="true"
            >Zarchiwizowane karty</option
          >
        </select></label
      >
      <label
        >Priorytet<select
          aria-label="Filtr priorytetu"
          value={route.priority}
          onchange={(event) =>
            onchange({ priority: event.currentTarget.value })}
        >
          <option value="">Wszystkie priorytety</option>
          {#each ["normal", "high"] as priority}<option value={priority}
              >{resourceLabel(priority)}</option
            >{/each}
        </select></label
      >
      <label
        >Tag<input
          aria-label="Filtr tagu"
          placeholder="Dokładny tag…"
          value={route.label}
          oninput={(event) => onchange({ label: event.currentTarget.value })}
        /></label
      >
      {#if filterCount}
        <button
          class="quiet clear-filters"
          onclick={() =>
            onchange({ status: "", priority: "", label: "", archived: false })}
          >Wyczyść filtry</button
        >
      {/if}
    </div>
  {/if}
</div>
