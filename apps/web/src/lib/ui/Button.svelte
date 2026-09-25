<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  let {
    children,
    variant = "secondary",
    class: className,
    ...attributes
  }: HTMLButtonAttributes & {
    children?: Snippet;
    variant?: "primary" | "secondary" | "quiet" | "danger";
  } = $props();
</script>

<button {...attributes} class={["ui-button", variant, className]}
  >{@render children?.()}</button
>
