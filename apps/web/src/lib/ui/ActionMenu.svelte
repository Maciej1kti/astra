<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons";

  let {
    label = "More actions",
    disabled = false,
    icon = "more",
    text,
    align = "end",
    children,
  }: {
    label?: string;
    disabled?: boolean;
    icon?: IconName;
    text?: string;
    align?: "start" | "end";
    children: Snippet<[close: () => void]>;
  } = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let pointerInside = false;
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
      pointerInside =
        event.target instanceof Node && root.contains(event.target);
      if (!pointerInside) open = false;
    };
    const release = () => {
      pointerInside = false;
    };
    const outsideFocus = (event: FocusEvent) => {
      // WebKit can focus the dialog before dispatching a clicked menu button.
      if (
        !pointerInside &&
        event.target instanceof Node &&
        !root.contains(event.target)
      )
        open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    document.addEventListener("focusin", outsideFocus);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
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
    aria-label={label}
    title={label}
    aria-expanded={open}
    aria-controls={id}
    {disabled}
    onclick={() => (open = !open)}
    ><Icon name={icon} />{#if text}<span>{text}</span>{/if}</button
  >
  {#if open}<div class="action-menu-panel" {id}>
      {@render children(close)}
    </div>{/if}
</div>
