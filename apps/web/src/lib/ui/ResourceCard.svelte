<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { Summary } from "../api/api";
  import ResourceMetadata from "./ResourceMetadata.svelte";

  let {
    item,
    projectName,
    class: className,
    ...attributes
  }: Omit<HTMLButtonAttributes, "children"> & {
    item: Summary;
    projectName?: string;
  } = $props();
</script>

<button {...attributes} class={["card resource-card", className]}>
  <span class="card-content">
    {#if projectName}<small>{projectName}</small>{/if}
    <span class="card-title" role="heading" aria-level="3">{item.title}</span>
    <ResourceMetadata {item} />
  </span>
</button>
