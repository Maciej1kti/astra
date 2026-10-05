<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import DeferredDialog from "./DeferredDialog.svelte";

  /**
   * Mounted while an on-demand dialog is wanted: starts its import and shows
   * the closable loading/retry dialog until the component is available.
   */
  let {
    source,
    title,
    onclose,
    foreground = false,
    children,
  }: {
    source: { component: T | null; error: string; load: () => Promise<void> };
    title: string;
    onclose: () => void;
    foreground?: boolean;
    children: Snippet<[T]>;
  } = $props();

  $effect(() => {
    void source.load();
  });
</script>

{#if source.component}{@render children(source.component)}{:else}<DeferredDialog
    {title}
    {foreground}
    error={source.error}
    retry={source.load}
    {onclose}
  />{/if}
