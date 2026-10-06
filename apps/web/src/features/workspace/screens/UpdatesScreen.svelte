<script lang="ts">
  import EmptyState from "../../../lib/ui/EmptyState.svelte";

  import Icon from "../../../lib/ui/Icon.svelte";
  import Badge from "../../../lib/ui/Badge.svelte";

  import type { Summary } from "../../../lib/api/api";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import { formatCivilDate } from "../../../lib/ui/locale";
  import type { IconName } from "../../../lib/ui/icons";
  const kindIcons: Record<string, IconName> = {
    result: "done",
    blocker: "cancelled",
    decision_needed: "flag",
    note: "info",
  };
  let {
    route,
    projects,
    updates,
    open,
  }: {
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    updates: Summary[];
    open: OpenResource;
  } = $props();
  const visibleUpdates = $derived(
    updates.filter(
      (item) =>
        (!route.project || item.project_id === route.project) &&
        (!route.unreadOnly || !item.read),
    ),
  );
</script>

<div class="updates">
  {#each visibleUpdates as item}<button
      class="update"
      onclick={() => open(item)}
      ><span class="updateicon"
        ><Icon name={kindIcons[item.kind ?? ""] ?? "updates"} /></span
      >
      <div>
        <small
          >{projectLabel(projects, item.project_id)}{#if item.recorded_at}<time
              datetime={item.recorded_at}
              >{formatCivilDate(item.recorded_at)}</time
            >{/if}</small
        >
        <h3>{item.title}</h3>
        <Badge>{resourceLabel(item.kind ?? "update")}</Badge>
        <Badge class={item.read ? "" : "unread"}
          >{item.read ? "Przeczytane" : "Nieprzeczytane"}</Badge
        >
      </div></button
    >{:else}<EmptyState>
      Brak aktualizacji. Zapisz wynik, przeszkodę lub decyzję.
    </EmptyState>{/each}
</div>
