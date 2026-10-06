<script lang="ts" generics="Key extends string">
  import { tick } from "svelte";
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";
  import { layoutMotion } from "./layout-motion";
  import { orderListGesture } from "./order-list-gesture";

  let {
    order,
    label,
    shown,
    onmove,
    ontoggle,
    ariaLabel,
    announcement = $bindable(""),
    visibilityLabel = (key: Key) => `Pokaż ${label(key)}`,
    visibilityTitle = (key: Key) =>
      `${shown(key) ? "Ukryj" : "Pokaż"} ${label(key)}`,
    disabled = false,
    visibilityDisabled = false,
    cancellationMessage = "Kolejność bez zmian.",
    rowAttribute,
    handleAttribute,
  }: {
    order: Key[];
    label: (key: Key) => string;
    shown: (key: Key) => boolean;
    onmove: (next: Key[], key: Key) => void | Promise<void>;
    ontoggle: (key: Key) => void;
    ariaLabel: string;
    announcement?: string;
    visibilityLabel?: (key: Key) => string;
    visibilityTitle?: (key: Key) => string;
    disabled?: boolean;
    visibilityDisabled?: boolean;
    cancellationMessage?: string;
    rowAttribute?: string;
    handleAttribute?: string;
  } = $props();
  const id = $props.id();
  let list: HTMLOListElement | undefined;

  async function move(next: Key[], key: Key) {
    await onmove(next, key);
    await tick();
    announcement = `${label(key)} przeniesiono na miejsce ${order.indexOf(key) + 1} z ${order.length}.`;
    const handle = [
      ...(list?.querySelectorAll<HTMLButtonElement>("[data-order-handle]") ??
        []),
    ].find((element) => element.dataset.orderHandle === key);
    handle?.focus({ preventScroll: true });
    handle?.scrollIntoView({ block: "nearest" });
  }
</script>

<span class="sr" id={`${id}-reorder-help`}>
  Przeciągnij uchwyt, aby ułożyć elementy. Użyj strzałek, Home lub End, aby
  przenieść zaznaczony uchwyt. Escape lub Tab anuluje przeciąganie.
</span>
<ol
  class="layout-order"
  aria-label={ariaLabel}
  bind:this={list}
  use:orderListGesture={{
    order: () => order,
    label,
    disabled: () => disabled,
    commit: (next, key) => void move(next, key),
    announce: (message) => (announcement = message),
    cancellationMessage,
    rowAttribute,
    handleAttribute,
  }}
>
  {#each order as key (key)}
    <li
      animate:layoutMotion
      data-order-item={key}
      {...rowAttribute ? { [rowAttribute]: key } : {}}
      class:section-muted={!shown(key)}
    >
      <Button
        type="button"
        variant="quiet"
        class="icon-button layout-handle"
        {disabled}
        data-order-handle={key}
        {...handleAttribute ? { [handleAttribute]: key } : {}}
        aria-label={`Zmień kolejność ${label(key)}`}
        aria-describedby={`${id}-reorder-help`}
        aria-keyshortcuts="ArrowUp ArrowDown Home End"
        aria-pressed="false"><Icon name="grip" small /></Button
      >
      <span class="layout-section-name">{label(key)}</span>
      <Button
        type="button"
        variant="quiet"
        class="icon-button layout-visibility"
        disabled={disabled || visibilityDisabled}
        aria-label={visibilityLabel(key)}
        title={visibilityTitle(key)}
        aria-pressed={shown(key)}
        onclick={() => ontoggle(key)}
        ><Icon name={shown(key) ? "eye" : "eyeOff"} /></Button
      >
    </li>
  {/each}
</ol>
<span class="sr" role="status">{announcement}</span>

<style>
  .layout-order {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .layout-order li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
    min-height: calc(var(--tap-target) + var(--space-2));
    padding-inline: var(--space-2);
  }
  .layout-order li:hover,
  .layout-order li:focus-within {
    background: var(--soft);
  }
  .layout-section-name {
    flex: 1;
    min-width: 0;
    font-weight: var(--weight-medium);
  }
  .layout-order .section-muted .layout-section-name {
    color: var(--muted);
  }
  .layout-order :global(.icon-button) {
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
  }
  .layout-order :global(.layout-handle) {
    color: var(--muted);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .layout-order :global(.layout-handle:active) {
    cursor: grabbing;
  }
  .layout-order :global(.layout-visibility) {
    color: var(--muted);
  }
  .layout-order :global(.layout-visibility[aria-pressed="true"]) {
    color: var(--accent-ink);
  }
  .layout-order [data-dragging="true"] {
    opacity: var(--disabled-opacity);
    background: var(--soft);
  }
  :global(.layout-drag-preview),
  :global(.layout-drop-indicator) {
    position: fixed;
    pointer-events: none;
    z-index: var(--layer-drag-preview);
  }
  :global(.layout-drag-preview) {
    margin: 0;
    background: var(--paper);
    border-radius: var(--radius-control);
    box-shadow: var(--shadow-floating);
  }
  :global(.layout-drop-indicator) {
    z-index: var(--layer-drag-indicator);
    height: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--accent-ink);
  }
</style>
