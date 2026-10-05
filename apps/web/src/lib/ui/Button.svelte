<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  let {
    children,
    variant = "secondary",
    class: className,
    // A button inside a form submits it unless told otherwise.
    type = "button",
    ...attributes
  }: HTMLButtonAttributes & {
    children?: Snippet;
    variant?: "primary" | "secondary" | "quiet" | "danger";
  } = $props();
</script>

<button {...attributes} {type} class={["ui-button", variant, className]}
  >{@render children?.()}</button
>
