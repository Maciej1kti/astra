<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import type { DeferredSource } from "./deferred-component.svelte";
  import Button from "./Button.svelte";

  /** An on-demand view in the page flow, with its loading and retry states. */
  let {
    source,
    loading,
    retry = "Spróbuj ponownie",
    quiet = false,
    children,
  }: {
    source: DeferredSource<T>;
    loading: string;
    retry?: string;
    quiet?: boolean;
    children: Snippet<[T]>;
  } = $props();
</script>

{#if source.component}{@render children(
    source.component,
  )}{:else if source.error}<p>
    <span role="alert">{source.error}</span><Button
      variant={quiet ? "quiet" : "secondary"}
      onclick={() => void source.load()}>{retry}</Button
    >
  </p>
{:else}<p role="status">{loading}</p>{/if}
