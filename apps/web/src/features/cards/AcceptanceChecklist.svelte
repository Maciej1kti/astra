<script lang="ts">
  import { acceptanceProgress } from "../../lib/resources/resource-summary";
  import {
    ACCEPTANCE_LIMIT,
    ACCEPTANCE_TEXT_LIMIT,
    moveAcceptance,
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
  const progress = $derived(acceptanceProgress(items));
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLOListElement>();
  let announcement = $state("");

  $effect(() => {
    if (!error) return;
    const index = error.match(/acceptance item (\d+)/i)?.[1];
    const field =
      (index
        ? list?.querySelectorAll("textarea")[Number(index) - 1]
        : undefined) ?? input;
    field?.focus();
    field?.scrollIntoView({ block: "center" });
  });

  function add() {
    if (disabled) return;
    const text = draft.trim();
    if (!text) {
      error = "Write an acceptance condition first.";
      return;
    }
    if ([...text].length > ACCEPTANCE_TEXT_LIMIT) {
      error = `Use ${ACCEPTANCE_TEXT_LIMIT} characters or fewer for an acceptance item.`;
      return;
    }
    if (items.length >= ACCEPTANCE_LIMIT) {
      error = `Use up to ${ACCEPTANCE_LIMIT} acceptance items.`;
      return;
    }
    items = [...items, { id: crypto.randomUUID(), text, completed: false }];
    draft = "";
    error = "";
    announcement = `Added acceptance item ${items.length}.`;
    input?.focus();
  }

  function move(itemId: string, offset: -1 | 1) {
    items = moveAcceptance(items, itemId, offset);
    announcement = `Moved acceptance item to position ${items.findIndex((item) => item.id === itemId) + 1}.`;
  }
</script>

<section class="acceptance" aria-label="Acceptance checklist">
  <div class="heading">
    <h3>Acceptance checklist</h3>
    <span>{progress.completed}/{progress.total} complete</span>
  </div>
  <p class="hint">
    Define what must be true before you accept the result. Completion is saved
    with the card; its status stays your decision.
  </p>
  {#if items.length}<progress
      value={progress.completed}
      max={progress.total}
      aria-label="Acceptance checklist progress"
    ></progress>{/if}
  <ol bind:this={list}>
    {#each items as item, index (item.id)}
      <li>
        <div class="item-fields">
          <input
            type="checkbox"
            checked={item.completed}
            {disabled}
            aria-label={`Complete acceptance item ${index + 1}: ${item.text}`}
            onchange={(event) => {
              items = items.map((value) =>
                value.id === item.id
                  ? { ...value, completed: event.currentTarget.checked }
                  : value,
              );
            }}
          />
          <textarea
            rows="2"
            value={item.text}
            {disabled}
            aria-label={`Acceptance item ${index + 1}`}
            oninput={(event) => {
              items = items.map((value) =>
                value.id === item.id
                  ? { ...value, text: event.currentTarget.value }
                  : value,
              );
              error = "";
            }}></textarea>
        </div>
        <div class="item-actions">
          <span>{index + 1} of {items.length}</span>
          <button
            type="button"
            disabled={disabled || index === 0}
            aria-label={`Move acceptance item ${index + 1} up`}
            onclick={() => move(item.id, -1)}>↑</button
          >
          <button
            type="button"
            disabled={disabled || index === items.length - 1}
            aria-label={`Move acceptance item ${index + 1} down`}
            onclick={() => move(item.id, 1)}>↓</button
          >
          <button
            type="button"
            {disabled}
            aria-label={`Remove acceptance item ${index + 1}`}
            onclick={() => {
              items = items.filter((value) => value.id !== item.id);
              error = "";
              announcement = `Removed acceptance item ${index + 1}.`;
            }}>Remove</button
          >
        </div>
      </li>
    {/each}
  </ol>
  {#if !items.length}<p class="hint">No acceptance conditions yet.</p>{/if}
  <label for={`${id}-new`}>New acceptance condition</label>
  <div class="add-row">
    <input
      id={`${id}-new`}
      bind:this={input}
      bind:value={draft}
      {disabled}
      placeholder="A clear, verifiable result"
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
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
  <p class="hint" id={`${id}-hint`}>
    Up to {ACCEPTANCE_LIMIT} items, {ACCEPTANCE_TEXT_LIMIT} characters each. Use the
    arrows to change their order.
  </p>
  {#if error}<p role="alert" id={`${id}-error`} class="error">{error}</p>{/if}
  <p role="status" class="sr-only">{announcement}</p>
</section>

<style>
  .acceptance {
    margin: 24px 0;
  }
  .heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
  }
  .heading span,
  .hint {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
  .heading span {
    white-space: nowrap;
  }
  progress {
    display: block;
    width: 100%;
    height: 7px;
    margin: 12px 0;
    accent-color: var(--green);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    margin: 8px 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px;
    background: var(--bg);
  }
  .item-fields {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .item-fields input {
    flex-shrink: 0;
    margin-top: 12px;
    width: 22px;
    height: 22px;
    accent-color: var(--green);
  }
  textarea {
    flex: 1;
    min-width: 0;
    width: 100%;
    font-family: inherit;
    line-height: 1.4;
    resize: vertical;
  }
  .item-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 6px;
  }
  .item-actions span {
    margin-right: auto;
    font-size: 11px;
    color: var(--muted);
  }
  .item-actions button {
    min-width: 44px;
    min-height: 44px;
    padding: 4px 10px;
  }
  label {
    display: block;
    margin: 16px 0 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .add-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .add-row input {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
  .add-row button {
    flex-shrink: 0;
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
