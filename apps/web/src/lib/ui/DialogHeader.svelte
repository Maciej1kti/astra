<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    title,
    description,
    heading,
    actions,
    onclose,
    closeLabel = "Close",
    disabled = false,
    onclosepointerdown,
    closeButton = $bindable(),
  }: {
    title?: string;
    description?: string;
    heading?: Snippet;
    actions?: Snippet;
    onclose: () => void;
    closeLabel?: string;
    disabled?: boolean;
    onclosepointerdown?: (event: PointerEvent) => void;
    closeButton?: HTMLButtonElement;
  } = $props();
</script>

<header class="dialog-header">
  <div class="dialog-heading">
    {#if heading}{@render heading()}{:else}<h2>{title}</h2>{/if}
    {#if description}<p>{description}</p>{/if}
  </div>
  <div class="dialog-header-actions">
    {@render actions?.()}
    <button
      bind:this={closeButton}
      type="button"
      class="quiet icon-button"
      aria-label={closeLabel}
      title={closeLabel}
      {disabled}
      onpointerdown={onclosepointerdown}
      onclick={onclose}><Icon name="close" small /></button
    >
  </div>
</header>
