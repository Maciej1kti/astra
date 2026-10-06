<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import { onMount, tick } from "svelte";
  import { gestureCancellation } from "../../lib/ui/gesture-cancellation";
  import {
    reorderKeyIndex,
    sameReorderOrder,
  } from "../../lib/ui/reorder-gesture";
  import { checklistOrderGesture } from "./checklist-order-gesture";
  import {
    ACCEPTANCE_LIMIT,
    ACCEPTANCE_TEXT_LIMIT,
    moveAcceptanceToIndex,
    reorderAcceptance,
    type AcceptanceItem,
  } from "./card-work";

  let {
    items = $bindable<AcceptanceItem[]>([]),
    draft = $bindable(""),
    error = $bindable(""),
    disabled = false,
    messagesInHeader = false,
  }: {
    items?: AcceptanceItem[];
    draft?: string;
    error?: string;
    disabled?: boolean;
    messagesInHeader?: boolean;
  } = $props();
  const id = $props.id();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  let announcement = $state("");
  let previewOrder = $state<string[] | null>(null);
  let activeDrag = $state<{ id: string; mode: "pointer" | "keyboard" } | null>(
    null,
  );
  let dragMembership: string[] | null = null;

  const displayedItems = $derived(
    previewOrder ? reorderAcceptance(items, previewOrder) : items,
  );

  $effect(() => {
    if (!error) return;
    const index = error.match(/checklist item (\d+)/i)?.[1];
    const field =
      (index
        ? list?.querySelectorAll("textarea")[Number(index) - 1]
        : undefined) ?? input;
    field?.focus();
    field?.scrollIntoView({ block: "center" });
  });

  $effect(() => {
    if (
      activeDrag?.mode === "keyboard" &&
      (disabled ||
        !dragMembership ||
        !sameReorderOrder(
          dragMembership,
          items.map((item) => item.id),
        ))
    )
      finishKeyboardDrag(false);
  });

  function add() {
    if (disabled) return;
    const text = draft.trim();
    if (!text) {
      error = "Wpisz treść pozycji listy kontrolnej.";
      return;
    }
    if ([...text].length > ACCEPTANCE_TEXT_LIMIT) {
      error = `Użyj ${ACCEPTANCE_TEXT_LIMIT} znaków lub mniej w pozycji listy kontrolnej.`;
      return;
    }
    if (items.length >= ACCEPTANCE_LIMIT) {
      error = `Użyj maksymalnie ${ACCEPTANCE_LIMIT} pozycji listy kontrolnej.`;
      return;
    }
    items = [...items, { id: crypto.randomUUID(), text, completed: false }];
    draft = "";
    error = "";
    announcement = `Dodano pozycję listy kontrolnej ${items.length}.`;
    input?.focus();
  }

  function commitOrder(order: string[], itemId: string) {
    const next = reorderAcceptance(items, order);
    if (next === items) return;
    items = next;
    announcement = `Przeniesiono pozycję listy kontrolnej na miejsce ${items.findIndex((item) => item.id === itemId) + 1}.`;
  }

  function focusHandle(itemId: string) {
    const row = [
      ...(list?.querySelectorAll<HTMLElement>("[data-checklist-item]") ?? []),
    ].find((value) => value.dataset.checklistItem === itemId);
    row
      ?.querySelector<HTMLButtonElement>(".handle")
      ?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  }

  function finishKeyboardDrag(commit: boolean, restoreFocus = commit) {
    const drag = activeDrag;
    const order = previewOrder;
    const valid =
      dragMembership &&
      sameReorderOrder(
        dragMembership,
        items.map((item) => item.id),
      );
    activeDrag = null;
    previewOrder = null;
    dragMembership = null;
    if (restoreFocus && drag) void tick().then(() => focusHandle(drag.id));
    if (!commit || disabled || !drag || !order || !valid) return;
    commitOrder(order, drag.id);
  }

  function handleKeydown(event: KeyboardEvent, itemId: string) {
    if (disabled) return;
    const drag = activeDrag;
    const pickup =
      event.key === "Enter" || event.key === " " || event.key === "Spacebar";
    if (!drag) {
      if (pickup) {
        event.preventDefault();
        activeDrag = { id: itemId, mode: "keyboard" };
        previewOrder = items.map((item) => item.id);
        dragMembership = [...previewOrder];
        announcement = `Podniesiono pozycję listy kontrolnej ${items.findIndex((item) => item.id === itemId) + 1}.`;
      }
      return;
    }
    if (drag.mode !== "keyboard" || drag.id !== itemId) return;
    if (pickup) {
      event.preventDefault();
      finishKeyboardDrag(true);
      return;
    }
    const current = displayedItems.findIndex((item) => item.id === itemId);
    const index = reorderKeyIndex(event.key, current, displayedItems.length);
    if (index === null) return;
    event.preventDefault();
    event.stopPropagation();
    const next = moveAcceptanceToIndex(displayedItems, itemId, index);
    if (next !== displayedItems) {
      previewOrder = next.map((item) => item.id);
      announcement = `Przeniesiono pozycję listy kontrolnej na miejsce ${index + 1}.`;
      void tick().then(() => {
        if (activeDrag?.mode === "keyboard" && activeDrag.id === itemId)
          focusHandle(itemId);
      });
    }
  }

  onMount(() => {
    if (!list) return;
    const removeCancellation = gestureCancellation(list, {
      pointer: () => null,
      active: () => activeDrag?.mode === "keyboard",
      cancel(event) {
        finishKeyboardDrag(
          false,
          event?.type === "keydown" &&
            (event as KeyboardEvent).key === "Escape",
        );
        announcement = "Przywrócono kolejność listy kontrolnej.";
      },
    });
    return () => {
      removeCancellation();
      if (activeDrag?.mode === "keyboard") finishKeyboardDrag(false);
    };
  });
</script>

<section class="checklist" aria-label="Lista kontrolna">
  <SectionHeading
    title="Lista kontrolna"
    level={3}
    visuallyHidden
    count={`${items.filter((item) => item.completed).length} / ${items.length}`}
    countLabel={`${items.filter((item) => item.completed).length} z ${items.length} wykonanych pozycji listy kontrolnej`}
  />
  <ul
    bind:this={list}
    use:checklistOrderGesture={{
      items: () => items,
      disabled: () => disabled || activeDrag?.mode === "keyboard",
      pickedUp: (itemId) => (activeDrag = { id: itemId, mode: "pointer" }),
      released: () => (activeDrag = null),
      commit: commitOrder,
      announce: (message) => (announcement = message),
    }}
  >
    {#each displayedItems as item, index (item.id)}
      <li
        data-checklist-item={item.id}
        class:dragging={activeDrag?.id === item.id}
        class:completed={item.completed}
      >
        <label class="check-toggle">
          <input
            type="checkbox"
            checked={item.completed}
            {disabled}
            aria-label={`Ukończ pozycję listy kontrolnej ${index + 1}: ${item.text}`}
            onchange={(event) => {
              items = items.map((value) =>
                value.id === item.id
                  ? { ...value, completed: event.currentTarget.checked }
                  : value,
              );
            }}
          />
        </label>
        <textarea
          rows="1"
          value={item.text}
          {disabled}
          aria-label={`Pozycja listy kontrolnej ${index + 1}`}
          oninput={(event) => {
            items = items.map((value) =>
              value.id === item.id
                ? { ...value, text: event.currentTarget.value }
                : value,
            );
            error = "";
          }}></textarea>
        <button
          class="icon-button"
          type="button"
          {disabled}
          aria-label={`Usuń pozycję listy kontrolnej ${index + 1}`}
          onclick={() => {
            items = items.filter((value) => value.id !== item.id);
            error = "";
            announcement = `Usunięto pozycję listy kontrolnej ${index + 1}.`;
          }}><Icon name="close" small /></button
        >
        <button
          class="handle"
          type="button"
          {disabled}
          aria-label={`Przenieś pozycję listy kontrolnej ${index + 1}`}
          aria-pressed={activeDrag?.id === item.id}
          data-checklist-handle={item.id}
          aria-keyshortcuts="Space Enter ArrowUp ArrowDown Home End"
          aria-describedby={`${id}-reorder-help`}
          onkeydown={(event) => handleKeydown(event, item.id)}
          ><Icon name="grip" small /></button
        >
      </li>
    {/each}
  </ul>
  <label class="sr-only" for={`${id}-new`}>Nowa pozycja</label>
  <div class="add-row">
    <input
      id={`${id}-new`}
      bind:this={input}
      bind:value={draft}
      {disabled}
      aria-label="Nowa pozycja"
      placeholder="Dodaj pozycję listy kontrolnej…"
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={!!error}
      oninput={() => (error = "")}
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          add();
        }
      }}
    />
    <button
      type="button"
      disabled={disabled || !draft.trim() || items.length >= ACCEPTANCE_LIMIT}
      class="add-item"
      aria-label="Dodaj pozycję"
      title="Dodaj pozycję"
      onclick={add}><Icon name="plus" /></button
    >
  </div>
  {#if error}<p
      role={messagesInHeader ? undefined : "alert"}
      id={`${id}-error`}
      class="error"
      class:sr-only={messagesInHeader}
    >
      {error}
    </p>{/if}
  <span class="sr-only" id={`${id}-reorder-help`}>
    Przeciągnij, aby zmienić kolejność. Naciśnij spację lub Enter, aby podnieść
    pozycję, użyj strzałek, Home lub End, aby ją przenieść, i spacji lub Enter,
    aby upuścić. Escape anuluje.
  </span>
  <p role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    {announcement}
  </p>
</section>

<style>
  .checklist {
    margin: var(--space-10) 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 var(--space-2);
    background: var(--paper);
    border-radius: var(--radius-control);
  }
  li {
    display: grid;
    grid-template-columns:
      var(--tap-target) minmax(0, 1fr) var(--tap-target)
      var(--tap-target);
    align-items: start;
    gap: 0;
    padding: var(--space-2) 0;
    border-bottom: var(--stroke) solid var(--line);
  }
  li:last-child {
    border-bottom: 0;
  }
  li.dragging {
    opacity: var(--disabled-opacity);
    background: var(--accent);
  }
  .checklist .check-toggle {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    min-height: var(--tap-target);
    margin: 0;
    cursor: pointer;
  }
  .checklist .check-toggle input {
    width: var(--icon-size);
    height: var(--icon-size);
    min-height: 0;
    margin: 0;
    padding: 0;
    accent-color: var(--accent-ink);
    cursor: pointer;
  }
  .checklist textarea {
    min-width: 0;
    width: 100%;
    min-height: var(--tap-target);
    margin: 0;
    padding: var(--space-5) var(--space-2);
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    font: inherit;
    line-height: var(--leading-body);
    resize: none;
    field-sizing: content;
  }
  .checklist textarea:focus {
    background: var(--soft);
  }
  .completed textarea {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: var(--line-strong);
  }
  .icon-button,
  .handle,
  .add-item {
    display: inline-grid;
    place-items: center;
    width: var(--tap-target);
    min-width: var(--tap-target);
    height: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
  }
  .icon-button:hover {
    color: var(--danger);
    background: var(--danger-bg);
  }
  .handle {
    cursor: grab;
    touch-action: none;
  }
  .handle:hover,
  .add-item:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .handle:active,
  li.dragging .handle {
    cursor: grabbing;
  }
  .checklist .add-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: 0 var(--space-2) 0 var(--space-4);
    background: var(--soft);
    border-radius: var(--radius-control);
  }
  .checklist .add-row input {
    flex: 1;
    min-width: 0;
    width: 100%;
    margin: 0;
    border-color: transparent;
    background: transparent;
    padding-left: var(--space-4);
  }
  .error {
    font-size: var(--text-base);
    color: var(--notice-ink);
    padding: 0 var(--space-4);
  }
  .sr-only {
    position: absolute;
    width: var(--stroke);
    height: var(--stroke);
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @supports not (field-sizing: content) {
    .checklist textarea {
      resize: vertical;
    }
  }
</style>
