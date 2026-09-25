<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="heading">
  <h1>{title}</h1>
  {@render children?.()}
</div>
