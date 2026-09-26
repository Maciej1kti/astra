<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  let {
    title,
    description,
    heading,
    content,
    messages,
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
    content?: Snippet;
    messages?: Snippet;
    actions?: Snippet;
    onclose: () => void;
    closeLabel?: string;
    disabled?: boolean;
    onclosepointerdown?: (event: PointerEvent) => void;
    closeButton?: HTMLButtonElement;
  } = $props();
</script>

<header
  class="dialog-header"
  class:dialog-header-stacked={!!content || !!messages}
>
  <div class="dialog-heading">
    {#if heading}{@render heading()}{:else}<h2>{title}</h2>{/if}
    {#if description}<p>{description}</p>{/if}
  </div>
  <div class="dialog-header-actions">
    {@render actions?.()}
    <button
      bind:this={closeButton}
      type="button"
      class="quiet icon-button dialog-close"
      aria-label={closeLabel}
      title={closeLabel}
      {disabled}
      onpointerdown={onclosepointerdown}
      onclick={onclose}><Icon name="close" small /></button
    >
  </div>
  {#if content}<div class="dialog-header-content">{@render content()}</div>{/if}
  {#if messages}<div
      class="dialog-header-messages"
      aria-label="Editor messages"
    >
      {@render messages()}
    </div>{/if}
</header>
