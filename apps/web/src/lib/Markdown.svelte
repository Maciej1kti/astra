<script lang="ts">
  import { renderMarkdown } from "./markdown";
  let { source }: { source: string } = $props();
  let rendered = $derived(renderMarkdown(source));
</script>

<div class="markdown">{@html rendered}</div>

<style>
  .markdown {
    overflow-wrap: anywhere;
    line-height: 1.6;
  }
  .markdown :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--bg);
    padding: 12px;
  }
  .markdown :global(table) {
    display: block;
    overflow: auto;
  }
  .markdown :global(th),
  .markdown :global(td) {
    padding: 6px;
    border: 1px solid var(--line);
  }
  .markdown :global(a) {
    text-decoration: underline;
  }
</style>
