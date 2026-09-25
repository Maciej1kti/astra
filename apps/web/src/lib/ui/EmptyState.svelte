<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<div class="empty">
  {#if title}<strong>{title}</strong>{/if}
  {@render children()}
</div>
