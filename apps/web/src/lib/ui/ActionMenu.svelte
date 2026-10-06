<script lang="ts">
  import { layerExit, layerPresence } from "./dialog";
  import { menuLayers, revealLayers } from "./motion-layers";
  import { popoverPosition } from "./popover-position";
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons";

  let {
    label = "Więcej działań",
    disabled = false,
    icon = "more",
    text,
    align = "end",
    placement = "auto",
    current = false,
    navigationKey,
    onopen,
    panelClass = "",
    children,
  }: {
    label?: string;
    disabled?: boolean;
    icon?: IconName;
    text?: string;
    align?: "start" | "end";
    placement?: "bottom" | "auto";
    current?: boolean;
    navigationKey?: string;
    onopen?: () => void;
    panelClass?: string;
    children: Snippet<[close: () => void]>;
  } = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger = $state<HTMLButtonElement>();
  let pointerInside = false;
  const id = $props.id();
  function close() {
    open = false;
    if (trigger?.isConnected && !trigger.disabled)
      trigger.focus({ preventScroll: true });
  }
  function toggle() {
    if (open) close();
    else {
      trigger?.focus({ preventScroll: true });
      onopen?.();
      open = true;
    }
  }
  $effect(() => {
    if (disabled) open = false;
  });
  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      pointerInside =
        event.target instanceof Node && root.contains(event.target);
      if (!pointerInside) open = false;
    };
    const release = () => {
      pointerInside = false;
    };
    const outsideFocus = (event: FocusEvent) => {
      // WebKit can focus the dialog before dispatching a clicked menu button.
      // A touch has released its pointer by then, so focus on an element that
      // contains the menu is not a move away from it either.
      if (
        !pointerInside &&
        event.target instanceof Node &&
        !root.contains(event.target) &&
        !event.target.contains(root)
      )
        open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("focusin", outsideFocus);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      document.removeEventListener("focusin", outsideFocus);
      document.removeEventListener("keydown", escape, true);
      pointerInside = false;
    };
  });
</script>

<div class="action-menu" class:align-start={align === "start"} bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="quiet"
    class:icon-button={!text}
    class:action-menu-labeled={!!text}
    class:chosen={current}
    aria-current={current ? "page" : undefined}
    data-view={navigationKey}
    aria-label={label}
    title={label}
    aria-expanded={open}
    aria-controls={id}
    {disabled}
    onclick={toggle}
    ><Icon name={icon} />{#if text}<span data-label={text}>{text}</span
      >{/if}</button
  >
  {#if open}<div
      use:popoverPosition={{ anchor: trigger!, align, placement }}
      use:layerPresence
      use:revealLayers={menuLayers}
      out:layerExit
      class={`action-menu-panel floating ${panelClass}`}
      popover="manual"
      {id}
    >
      {@render children(close)}
    </div>{/if}
</div>

<style>
  .action-menu-panel.floating {
    position: fixed;
    inset: auto;
    margin: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    animation-name: astra-surface-fade;
  }
</style>
