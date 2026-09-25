<script lang="ts">
  import { renderMarkdown } from "./markdown";

  let { source }: { source: string } = $props();
  let rendered = $derived(renderMarkdown(source));
</script>

<div class="markdown">{@html rendered}</div>

<style>
  .markdown {
    overflow-wrap: anywhere;
    line-height: var(--leading-body);
  }
  .markdown :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--bg);
    padding: var(--space-6);
  }
  .markdown :global(> :first-child) {
    margin-top: 0;
  }
  .markdown :global(> :last-child) {
    margin-bottom: 0;
  }
  .markdown :global(table) {
    display: block;
    overflow: auto;
  }
  .markdown :global(th),
  .markdown :global(td) {
    padding: var(--space-3);
    border: var(--stroke) solid var(--line);
  }
  .markdown :global(a) {
    text-decoration: underline;
    color: var(--accent-ink);
  }
</style>
