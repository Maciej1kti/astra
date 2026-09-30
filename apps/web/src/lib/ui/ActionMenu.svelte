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
    placement = "bottom",
    floating = false,
    children,
  }: {
    label?: string;
    disabled?: boolean;
    icon?: IconName;
    text?: string;
    align?: "start" | "end";
    placement?: "bottom" | "auto";
    floating?: boolean;
    children: Snippet<[close: () => void]>;
  } = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let panel = $state<HTMLDivElement>();
  let above = $state(false);
  let sideTop = $state<number>();
  let availableHeight = $state<number>();
  let floatingTop = $state(0);
  let floatingLeft = $state(0);
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
    if (!open || !floating || !panel) return;
    const popover = panel;
    popover.showPopover();
    const position = () => {
      const bounds = trigger.getBoundingClientRect();
      const rect = popover.getBoundingClientRect();
      const edge = 12;
      floatingLeft = Math.max(
        edge,
        Math.min(
          bounds.right - rect.width,
          window.innerWidth - rect.width - edge,
        ),
      );
      floatingTop = Math.max(
        edge,
        Math.min(bounds.bottom + 8, window.innerHeight - rect.height - edge),
      );
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(popover);
    window.addEventListener("resize", position);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", position);
      if (popover.matches(":popover-open")) popover.hidePopover();
    };
  });
  $effect(() => {
    if (!open || placement !== "auto" || !panel) return;
    const scrollSurface = root.closest(".dialog-body");
    const position = () => {
      const bounds = trigger.getBoundingClientRect();
      const surface = scrollSurface?.getBoundingClientRect();
      const top = Math.max(0, surface?.top ?? 0);
      const bottom = Math.min(
        window.innerHeight,
        surface?.bottom ?? window.innerHeight,
      );
      const before = Math.max(0, bounds.top - top - 8);
      const after = Math.max(0, bottom - bounds.bottom - 8);
      const height = panel?.scrollHeight ?? 0;
      const beside =
        align === "end" &&
        Math.max(before, after) < height &&
        bounds.left - Math.max(0, surface?.left ?? 0) - 8 >=
          (panel?.offsetWidth ?? 0);
      sideTop = beside
        ? Math.max(top + 4, Math.min(bounds.top, bottom - height - 4)) -
          root.getBoundingClientRect().top
        : undefined;
      above = !beside && after < height && before > after;
      availableHeight = beside ? bottom - top - 8 : above ? before : after;
    };
    position();
    scrollSurface?.addEventListener("scroll", position, { passive: true });
    window.addEventListener("resize", position);
    return () => {
      scrollSurface?.removeEventListener("scroll", position);
      window.removeEventListener("resize", position);
    };
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
  {#if open}<div
      bind:this={panel}
      class="action-menu-panel"
      class:floating
      popover={floating ? "manual" : undefined}
      class:above={placement === "auto" && above}
      class:beside={placement === "auto" && sideTop !== undefined}
      class:bounded={placement === "auto"}
      style:left={floating ? `${floatingLeft}px` : undefined}
      style:top={floating
        ? `${floatingTop}px`
        : placement === "auto" && sideTop !== undefined
          ? `${sideTop}px`
          : undefined}
      style:max-height={placement === "auto" && availableHeight !== undefined
        ? `${availableHeight}px`
        : undefined}
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
    animation-name: astra-fade;
  }
  .action-menu-panel.above {
    top: auto;
    bottom: calc(100% + var(--space-2));
  }
  .action-menu-panel.bounded {
    overflow-y: auto;
    overscroll-behavior: contain;
    z-index: 1;
  }
  .action-menu-panel.beside {
    right: calc(100% + var(--space-2));
  }
</style>
