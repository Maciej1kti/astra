<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons";

  let {
    label = "More actions",
    disabled = false,
    icon = "more",
    align = "end",
    children,
  }: {
    label?: string;
    disabled?: boolean;
    icon?: IconName;
    align?: "start" | "end";
    children: Snippet<[close: () => void]>;
  } = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  const id = $props.id();
  function close() {
    open = false;
    trigger.focus();
  }
  $effect(() => {
    if (disabled) open = false;
  });
  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.contains(event.target))
        open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", outside);
    root.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      root.removeEventListener("keydown", escape);
    };
  });
</script>

<div
  class="action-menu"
  class:align-start={align === "start"}
  bind:this={root}
  onfocusout={(event) => {
    if (
      event.relatedTarget instanceof Node &&
      !root.contains(event.relatedTarget)
    )
      open = false;
  }}
>
  <button
    bind:this={trigger}
    type="button"
    class="quiet icon-button"
    aria-label={label}
    title={label}
    aria-expanded={open}
    aria-controls={id}
    {disabled}
    onclick={() => (open = !open)}><Icon name={icon} /></button
  >
  {#if open}<div class="action-menu-panel" {id}>
      {@render children(close)}
    </div>{/if}
</div>
