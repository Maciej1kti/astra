<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  let {
    children,
    class: className,
    ...attributes
  }: HTMLAttributes<HTMLSpanElement> & { children: Snippet } = $props();
</script>

<span {...attributes} class={["badge", className]}>{@render children()}</span>
