<script lang="ts">
  import type { Snippet } from "svelte";
  import { revealLayers } from "./motion-layers";
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div
  class="heading"
  use:revealLayers={{
    key: title,
    layers: [
      { selector: ":scope > h1", role: "heading", delay: 0, distance: "8px" },
      { selector: ":scope > :not(h1)", role: "detail", delay: 100 },
    ],
  }}
>
  <h1>{title}</h1>
  {@render children?.()}
</div>
