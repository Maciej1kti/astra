<script lang="ts" module>
  export type AddChoice = "agent" | "card" | "project";
</script>

<script lang="ts">
  import { tick } from "svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    agent = false,
    activity = "",
    onchoose,
  }: {
    agent?: boolean;
    /** Agent state shown on the closed button: "pracuje" or "nowa odpowiedź". */
    activity?: string;
    onchoose: (choice: AddChoice) => void;
  } = $props();

  const choices = $derived<{ id: AddChoice; label: string }[]>([
    ...(agent ? [{ id: "agent" as const, label: "Agent" }] : []),
    { id: "card", label: "Karta" },
    { id: "project", label: "Projekt" },
  ]);
  // A press shorter than this, released on the button, leaves the menu open.
  const tapMs = 300;

  let open = $state(false);
  let sticky = false;
  let hovered = $state<AddChoice | null>(null);
  let pressedAt = 0;
  let root = $state<HTMLDivElement>();
  const trigger = () => root?.querySelector<HTMLElement>(".add-trigger");
  const id = $props.id();

  // A choice counts where it comes to rest, also while it still slides there.
  function choiceAt(x: number, y: number): AddChoice | null {
    for (const slot of root?.querySelectorAll<HTMLElement>("[data-slot]") ??
      []) {
      const rect = slot.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return slot.dataset.slot as AddChoice;
    }
    return null;
  }
  function close() {
    open = false;
    sticky = false;
    hovered = null;
  }
  function choose(choice: AddChoice) {
    // A dialog returns focus to what held it; the menu is about to fold away.
    trigger()?.focus({ preventScroll: true });
    close();
    onchoose(choice);
  }
  function press(event: PointerEvent) {
    if (event.button > 0) return;
    const button = event.currentTarget as HTMLButtonElement;
    button.setPointerCapture(event.pointerId);
    pressedAt = event.timeStamp;
    sticky = false;
    open = true;
  }
  function move(event: PointerEvent) {
    if (open && !sticky) hovered = choiceAt(event.clientX, event.clientY);
  }
  function release(event: PointerEvent) {
    if (!open || sticky) return;
    const choice = choiceAt(event.clientX, event.clientY);
    if (choice) return choose(choice);
    const overTrigger = document.elementFromPoint(event.clientX, event.clientY);
    if (
      event.timeStamp - pressedAt < tapMs &&
      trigger()?.contains(overTrigger)
    ) {
      sticky = true;
      hovered = null;
    } else close();
  }
  // Keyboard activation arrives as a click without a pointer.
  function click(event: MouseEvent) {
    if (event.detail !== 0) return;
    if (open) close();
    else {
      sticky = true;
      open = true;
      void tick().then(() =>
        root?.querySelector<HTMLElement>("[data-choice]")?.focus(),
      );
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      trigger()?.focus({ preventScroll: true });
    }
  }
  $effect(() => {
    if (!open || !sticky) return;
    const outside = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });
</script>

<div
  class="add-menu"
  class:open
  bind:this={root}
  onkeydown={keydown}
  role="presentation"
>
  <div
    class="add-choices"
    id="{id}-choices"
    role="menu"
    aria-label="Dodaj"
    hidden={!open}
  >
    {#each choices as choice, index (choice.id)}
      <span class="add-slot" data-slot={choice.id}>
        <Button
          variant="primary"
          class="add-choice"
          role="menuitem"
          data-choice={choice.id}
          data-hovered={hovered === choice.id || undefined}
          data-activity={choice.id === "agent"
            ? activity || undefined
            : undefined}
          style="--i: {choices.length - 1 - index}"
          tabindex={open ? 0 : -1}
          onclick={() => choose(choice.id)}>{choice.label}</Button
        >
      </span>
    {/each}
  </div>
  <Button
    variant="primary"
    class="add-trigger"
    aria-label="Dodaj"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="{id}-choices"
    data-activity={activity || undefined}
    onpointerdown={press}
    onpointermove={move}
    onpointerup={release}
    onpointercancel={close}
    oncontextmenu={(event) => event.preventDefault()}
    onclick={click}><Icon name="plus" /></Button
  >
  <span class="sr" role="status">{activity}</span>
</div>

<style>
  .add-menu {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-4);
  }
  .add-choices {
    position: absolute;
    right: 0;
    bottom: calc(100% + var(--space-4));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-3);
  }
  .add-choices[hidden] {
    display: none;
  }
  .add-slot {
    display: flex;
  }
  .add-menu :global(.add-trigger) {
    position: relative;
    width: calc(var(--tap-target) + var(--space-8));
    height: calc(var(--tap-target) + var(--space-8));
    padding: 0;
    border-radius: var(--radius-pill);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .add-menu :global(.add-trigger .ui-icon) {
    width: var(--space-12);
    height: var(--space-12);
  }
  .add-menu.open :global(.add-trigger .ui-icon) {
    rotate: 45deg;
  }
  .add-menu :global(.add-trigger .ui-icon) {
    transition: rotate var(--motion-enter) var(--motion-spring);
  }
  .add-menu :global(.add-choice) {
    position: relative;
    min-width: calc(var(--tap-target) * 2);
    min-height: var(--tap-target);
    padding-inline: var(--space-8);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .add-menu :global(.add-choice[data-hovered]) {
    background: var(--primary-hover);
    outline: var(--focus-width) solid var(--primary-hover);
    outline-offset: var(--space-1);
  }
  .add-menu :global([data-activity])::after {
    content: "";
    position: absolute;
    top: calc(-1 * var(--space-1));
    right: calc(-1 * var(--space-1));
    width: var(--space-5);
    height: var(--space-5);
    box-sizing: border-box;
    border: var(--focus-width) solid var(--accent-ink);
    border-radius: var(--radius-pill);
    background: var(--paper);
  }
  .add-menu :global([data-activity="nowa odpowiedź"])::after {
    border-color: var(--success);
    background: var(--success);
  }
  .add-menu.open :global([data-activity].add-trigger)::after {
    display: none;
  }
  /* Each choice slides out from under the button along the way the finger takes to it. */
  .add-menu :global(.add-trigger) {
    z-index: 1;
  }
  .add-menu :global(.add-choice) {
    --add-from-x: 0px;
    --add-from-y: calc((var(--i) + 1) * (var(--tap-target) + var(--space-3)));
  }
  /* A phone fans the choices out beside the button: up, level and down from the thumb. */
  @media (max-width: 700px) {
    .add-choices {
      --add-side: 1;
      --add-reach: var(--space-10);
      --add-step: calc(var(--tap-target) + var(--space-9));
      right: calc(100% + var(--add-reach));
      bottom: auto;
      top: 50%;
      translate: 0 -50%;
      gap: var(--space-9);
    }
    .add-menu :global(.add-choice) {
      --add-from-x: calc(
        var(--add-side) *
          (
            50% + var(--add-reach) + (var(--tap-target) + var(--space-8)) / 2 -
              var(--add-pull, 0px)
          )
      );
      --add-from-y: calc(var(--add-row, 0) * var(--add-step));
    }
    .add-choices > :global(:first-child:not(:only-child)),
    .add-choices > :global(:last-child:not(:only-child)) {
      --add-pull: var(--space-8);
      margin-inline-end: calc(-1 * var(--add-pull));
    }
    .add-choices > :global(:first-child:not(:only-child)) {
      --add-row: 1;
    }
    .add-choices > :global(:last-child:not(:only-child)) {
      --add-row: -1;
    }
    .add-choices > :global(:first-child:nth-last-child(2)) {
      --add-row: 0.5;
    }
    .add-choices > :global(:last-child:nth-child(2)) {
      --add-row: -0.5;
    }
    :global(:root[data-hand="left"]) .add-menu {
      align-items: flex-start;
    }
    :global(:root[data-hand="left"]) .add-choices {
      --add-side: -1;
      right: auto;
      left: calc(100% + var(--add-reach));
      align-items: flex-start;
    }
    :global(:root[data-hand="left"])
      .add-choices
      > :global(:first-child:not(:only-child)),
    :global(:root[data-hand="left"])
      .add-choices
      > :global(:last-child:not(:only-child)) {
      margin-inline: calc(-1 * var(--space-8)) 0;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .add-menu.open :global(.add-choice) {
      animation: add-choice-in var(--motion-enter) var(--motion-spring)
        backwards;
    }
  }
  @keyframes add-choice-in {
    from {
      opacity: 0;
      translate: var(--add-from-x) var(--add-from-y);
      scale: 0.5;
    }
    35% {
      opacity: 1;
    }
  }
</style>
