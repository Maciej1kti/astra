<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    ACCEPTANCE_LIMIT,
    ACCEPTANCE_TEXT_LIMIT,
    acceptanceDropIndex,
    moveAcceptance,
    moveAcceptanceToIndex,
    reorderAcceptance,
    type AcceptanceItem,
  } from "./card-work";

  let {
    items = $bindable<AcceptanceItem[]>([]),
    draft = $bindable(""),
    error = $bindable(""),
    disabled = false,
  }: {
    items?: AcceptanceItem[];
    draft?: string;
    error?: string;
    disabled?: boolean;
  } = $props();
  const id = $props.id();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  let announcement = $state("");
  let previewOrder = $state<string[] | null>(null);
  let activeDrag = $state<{
    id: string;
    mode: "pointer" | "keyboard";
    pointerId?: number;
  } | null>(null);
  let pointerHandle: HTMLElement | null = null;
  let dragMembership: string[] | null = null;
  let scrollContainer: HTMLElement | null = null;
  let autoScrollFrame = 0;
  let latestPointerY = 0;

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
      activeDrag &&
      (disabled ||
        !dragMembership ||
        items.length !== dragMembership.length ||
        items.some((item, index) => item.id !== dragMembership?.[index]))
    )
      cancelDrag();
  });

  function add() {
    if (disabled) return;
    const text = draft.trim();
    if (!text) {
      error = "Enter a checklist item.";
      return;
    }
    if ([...text].length > ACCEPTANCE_TEXT_LIMIT) {
      error = `Use ${ACCEPTANCE_TEXT_LIMIT} characters or fewer for a checklist item.`;
      return;
    }
    if (items.length >= ACCEPTANCE_LIMIT) {
      error = `Use up to ${ACCEPTANCE_LIMIT} checklist items.`;
      return;
    }
    items = [...items, { id: crypto.randomUUID(), text, completed: false }];
    draft = "";
    error = "";
    announcement = `Added checklist item ${items.length}.`;
    input?.focus();
  }

  function finishDrag(commit: boolean, restoreKeyboardFocus = commit) {
    const drag = activeDrag;
    const order = previewOrder;
    const restoreFocus =
      restoreKeyboardFocus && drag?.mode === "keyboard" ? drag.id : null;
    stopAutoScroll();
    activeDrag = null;
    previewOrder = null;
    dragMembership = null;
    scrollContainer = null;
    if (pointerHandle && drag?.pointerId !== undefined) {
      if (
        typeof pointerHandle.hasPointerCapture === "function" &&
        pointerHandle.hasPointerCapture(drag.pointerId)
      )
        pointerHandle.releasePointerCapture(drag.pointerId);
    }
    pointerHandle = null;
    if (restoreFocus) void tick().then(() => focusHandle(restoreFocus));
    if (!commit || disabled || !drag || !order) return;
    const next = reorderAcceptance(items, order);
    if (next === items) return;
    items = next;
    announcement = `Moved checklist item to position ${items.findIndex((item) => item.id === drag.id) + 1}.`;
  }

  function cancelDrag() {
    finishDrag(false);
  }

  function focusHandle(itemId: string) {
    const row = [
      ...(list?.querySelectorAll<HTMLElement>("[data-checklist-item]") ?? []),
    ].find((value) => value.dataset.checklistItem === itemId);
    row?.querySelector<HTMLButtonElement>(".handle")?.focus();
  }

  function findScrollableAncestor(node: HTMLElement | undefined) {
    let current = node?.parentElement ?? null;
    while (current) {
      const style = getComputedStyle(current);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        current.classList.contains("editor")
      )
        return current;
      current = current.parentElement;
    }
    return null;
  }

  function scrollBounds() {
    if (!scrollContainer) return null;
    const rect = scrollContainer.getBoundingClientRect();
    const header = scrollContainer.querySelector<HTMLElement>("header");
    const footer = scrollContainer.querySelector<HTMLElement>("footer");
    return {
      top: Math.max(
        rect.top,
        header?.getBoundingClientRect().bottom ?? rect.top,
      ),
      bottom: Math.min(
        rect.bottom,
        footer?.getBoundingClientRect().top ?? rect.bottom,
      ),
    };
  }

  function stopAutoScroll() {
    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }

  function applyPointerDrop() {
    const drag = activeDrag;
    if (!drag || drag.mode !== "pointer") return;
    const rows = [
      ...(list?.querySelectorAll<HTMLElement>("[data-checklist-item]") ?? []),
    ].map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        id: row.dataset.checklistItem ?? "",
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const destination = acceptanceDropIndex(
      displayedItems,
      drag.id,
      latestPointerY,
      rows,
    );
    if (destination === null) return;
    const next = moveAcceptanceToIndex(displayedItems, drag.id, destination);
    if (next !== displayedItems) previewOrder = next.map((item) => item.id);
  }

  function scheduleAutoScroll() {
    if (autoScrollFrame || !activeDrag || activeDrag.mode !== "pointer") return;
    autoScrollFrame = requestAnimationFrame(() => {
      autoScrollFrame = 0;
      if (!activeDrag || activeDrag.mode !== "pointer") return;
      const bounds = scrollBounds();
      if (!bounds) return;
      const edge = 48;
      const delta =
        latestPointerY < bounds.top + edge
          ? -Math.min(12, bounds.top + edge - latestPointerY)
          : latestPointerY > bounds.bottom - edge
            ? Math.min(12, latestPointerY - (bounds.bottom - edge))
            : 0;
      if (!delta) return;
      const before = scrollContainer?.scrollTop ?? 0;
      if (scrollContainer) scrollContainer.scrollTop += delta;
      applyPointerDrop();
      if (scrollContainer?.scrollTop !== before) scheduleAutoScroll();
    });
  }

  function beginPointerDrag(event: PointerEvent, itemId: string) {
    if (disabled || activeDrag || !event.isPrimary || event.button !== 0)
      return;
    event.preventDefault();
    // Capture on the stable list: moving a keyed row can release its capture.
    pointerHandle = list ?? (event.currentTarget as HTMLButtonElement);
    activeDrag = { id: itemId, mode: "pointer", pointerId: event.pointerId };
    previewOrder = items.map((item) => item.id);
    dragMembership = items.map((item) => item.id);
    scrollContainer = findScrollableAncestor(list);
    latestPointerY = event.clientY;
    try {
      pointerHandle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable in a detached test node.
    }
    announcement = `Picked up checklist item ${items.findIndex((item) => item.id === itemId) + 1}.`;
  }

  function updatePointerDrag(event: PointerEvent) {
    const drag = activeDrag;
    if (!drag || drag.mode !== "pointer" || drag.pointerId !== event.pointerId)
      return;
    if (disabled) {
      cancelDrag();
      return;
    }
    event.preventDefault();
    latestPointerY = event.clientY;
    applyPointerDrop();
    scheduleAutoScroll();
  }

  function finishPointerDrag(event: PointerEvent) {
    const drag = activeDrag;
    if (!drag || drag.mode !== "pointer" || drag.pointerId !== event.pointerId)
      return;
    updatePointerDrag(event);
    finishDrag(true);
  }

  function beginKeyboardDrag(itemId: string) {
    if (disabled || activeDrag) return;
    activeDrag = { id: itemId, mode: "keyboard" };
    previewOrder = items.map((item) => item.id);
    dragMembership = items.map((item) => item.id);
    announcement = `Picked up checklist item ${items.findIndex((item) => item.id === itemId) + 1}.`;
  }

  function handleKeydown(event: KeyboardEvent, itemId: string) {
    if (disabled) return;
    const drag = activeDrag;
    const pickup =
      event.key === "Enter" || event.key === " " || event.key === "Spacebar";
    if (!drag) {
      if (pickup) {
        event.preventDefault();
        beginKeyboardDrag(itemId);
      }
      return;
    }
    if (drag.mode !== "keyboard" || drag.id !== itemId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finishDrag(false, true);
      announcement = "Checklist item order restored.";
      return;
    }
    if (event.key === "Tab") {
      cancelDrag();
      announcement = "Checklist item order restored.";
      return;
    }
    if (pickup) {
      event.preventDefault();
      finishDrag(true);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const next = moveAcceptance(
      displayedItems,
      itemId,
      event.key === "ArrowUp" ? -1 : 1,
    );
    if (next !== displayedItems) {
      previewOrder = next.map((item) => item.id);
      announcement = `Checklist item moved to position ${next.findIndex((item) => item.id === itemId) + 1}.`;
      void tick().then(() => {
        if (activeDrag?.mode === "keyboard" && activeDrag.id === itemId)
          focusHandle(itemId);
      });
    }
  }

  onMount(() => {
    const move = (event: PointerEvent) => updatePointerDrag(event);
    const up = (event: PointerEvent) => finishPointerDrag(event);
    const cancel = () => cancelDrag();
    const lostCapture = (event: PointerEvent) => {
      if (event.target === pointerHandle) cancelDrag();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeDrag) {
        event.preventDefault();
        finishDrag(false, true);
        announcement = "Checklist item order restored.";
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (!activeDrag) return;
      if (
        activeDrag.mode === "pointer" &&
        activeDrag.pointerId === event.pointerId
      )
        return;
      cancelDrag();
      announcement = "Checklist item order restored.";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", lostCapture);
    window.addEventListener("pointerdown", pointerdown, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("orientationchange", cancel);
    window.addEventListener("keydown", keydown);
    return () => {
      cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", lostCapture);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("keydown", keydown);
    };
  });
</script>

<section class="checklist" aria-label="Checklist">
  <h3>Checklist</h3>
  <ul bind:this={list}>
    {#each displayedItems as item, index (item.id)}
      <li
        data-checklist-item={item.id}
        class:dragging={activeDrag?.id === item.id}
      >
        <input
          type="checkbox"
          checked={item.completed}
          {disabled}
          aria-label={`Complete checklist item ${index + 1}: ${item.text}`}
          onchange={(event) => {
            items = items.map((value) =>
              value.id === item.id
                ? { ...value, completed: event.currentTarget.checked }
                : value,
            );
          }}
        />
        <textarea
          rows="1"
          value={item.text}
          {disabled}
          aria-label={`Checklist item ${index + 1}`}
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
          aria-label={`Remove checklist item ${index + 1}`}
          onclick={() => {
            items = items.filter((value) => value.id !== item.id);
            error = "";
            announcement = `Removed checklist item ${index + 1}.`;
          }}><span aria-hidden="true">×</span></button
        >
        <button
          class="handle"
          type="button"
          {disabled}
          aria-label={`Move checklist item ${index + 1}`}
          aria-pressed={activeDrag?.id === item.id}
          onpointerdown={(event) => beginPointerDrag(event, item.id)}
          onkeydown={(event) => handleKeydown(event, item.id)}
          ><span aria-hidden="true">⠿</span></button
        >
      </li>
    {/each}
  </ul>
  <label class="sr-only" for={`${id}-new`}>New item</label>
  <div class="add-row">
    <input
      id={`${id}-new`}
      bind:this={input}
      bind:value={draft}
      {disabled}
      aria-label="New item"
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
      onclick={add}>Add item</button
    >
  </div>
  {#if error}<p role="alert" id={`${id}-error`} class="error">{error}</p>{/if}
  <p role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    {announcement}
  </p>
</section>

<style>
  .checklist {
    margin: 24px 0;
  }
  h3 {
    margin: 0;
    font-size: 15px;
  }
  ul {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }
  li {
    margin: 8px 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px;
    background: var(--bg);
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 44px 44px;
    align-items: center;
    gap: 8px;
  }
  li.dragging {
    opacity: 0.55;
    border-color: var(--ink);
  }
  li > input {
    justify-self: center;
    width: 22px;
    height: 22px;
    accent-color: var(--green);
  }
  textarea {
    min-width: 0;
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    font-family: inherit;
    line-height: 1.4;
    resize: vertical;
  }
  .icon-button,
  .handle {
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    display: inline-grid;
    place-items: center;
  }
  .icon-button {
    font-size: 22px;
    line-height: 1;
  }
  .handle {
    cursor: grab;
    touch-action: none;
    color: var(--muted);
    font-size: 20px;
    line-height: 1;
  }
  .handle:active,
  li.dragging .handle {
    cursor: grabbing;
  }
  .add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .add-row input {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
  .add-row button {
    flex-shrink: 0;
    min-height: 44px;
  }
  .error {
    font-size: 13px;
    color: var(--notice-ink);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
