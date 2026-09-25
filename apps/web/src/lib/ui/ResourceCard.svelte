<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { Summary } from "../api/api";
  import ResourceMetadata from "./ResourceMetadata.svelte";
  import Icon from "./Icon.svelte";

  let {
    item,
    projectName,
    showStatus = false,
    pinned = false,
    children,
    class: className,
    ...attributes
  }: HTMLButtonAttributes & {
    item: Summary;
    projectName?: string;
    showStatus?: boolean;
    pinned?: boolean;
    children?: Snippet;
  } = $props();
</script>

<button {...attributes} class={["card resource-card", className]}>
  {#if pinned}<span class="card-grip"><Icon name="grip" /></span>{/if}
  <span class="card-content">
    {#if projectName}<small>{projectName}</small>{/if}
    <span class="card-title" role="heading" aria-level="3">{item.title}</span>
    <ResourceMetadata {item} {showStatus} />
    {@render children?.()}
  </span>
  {#if pinned}<span class="card-pin"><Icon name="pin" small /></span>{/if}
</button>
