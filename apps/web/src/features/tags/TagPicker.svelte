<script lang="ts">
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import {
    loadTagSuggestions,
    invalidateTagSuggestions,
  } from "./tag-suggestions";
  import { isAbortError } from "../../lib/api/read-requests";
  import { addTag, matchingTags, TAG_LIMIT, TAG_LENGTH_LIMIT } from "./tags";

  let {
    labels = $bindable<string[]>([]),
    draft = $bindable(""),
    error = $bindable(""),
    disabled = false,
  }: {
    labels?: string[];
    draft?: string;
    error?: string;
    disabled?: boolean;
  } = $props();
  const id = $props.id();
  let input = $state<HTMLInputElement>();
  let expanded = $state(false);
  let active = $state(-1);
  let announcement = $state("");
  let workspaceOptions = $state<string[]>([]);
  let catalogError = $state("");
  let catalogLoading = $state(false);
  let generation = 0;
  let accessLost = false;
  const suggestions = $derived(matchingTags(workspaceOptions, labels, draft));
  async function loadCatalog() {
    if (accessLost) return;
    const current = ++generation;
    catalogLoading = true;
    catalogError = "";
    try {
      const catalog = await loadTagSuggestions();
      if (current !== generation || accessLost) return;
      workspaceOptions = catalog.names;
      if (!catalog.complete)
        catalogError =
          "Some project tags are unavailable. Available suggestions are shown.";
    } catch (error) {
      if (current === generation && !isAbortError(error))
        catalogError = "Workspace tag suggestions could not be loaded.";
    } finally {
      if (current === generation) catalogLoading = false;
    }
  }
  onMount(() => {
    void loadCatalog();
    const ended = () => {
      generation++;
      accessLost = true;
      workspaceOptions = [];
      catalogLoading = false;
      invalidateTagSuggestions(false);
    };
    const restored = () => {
      accessLost = false;
      void loadCatalog();
    };
    const changed = () => {
      if (expanded) void loadCatalog();
      else workspaceOptions = [];
    };
    const unsubscribeSession = subscribeSession({
      ended: ended,
      restored: restored,
    });

    window.addEventListener("tag-suggestions-changed", changed);
    return () => {
      generation++;
      unsubscribeSession();

      window.removeEventListener("tag-suggestions-changed", changed);
    };
  });
  $effect(() => {
    if (error && input) {
      input.focus();
      input.scrollIntoView({ block: "nearest" });
    }
  });

  function add(value = draft, fromSuggestion = false) {
    const result = addTag(labels, value, fromSuggestion);
    error = result.error;
    if (!error) {
      labels = result.labels;
      draft = "";
      announcement = `Added tag ${labels.at(-1)}.`;
      active = -1;
    }
    input?.focus();
  }

  function remove(label: string) {
    labels = labels.filter((item) => item !== label);
    error = "";
    announcement = `Removed tag ${label} from this card.`;
    input?.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      expanded = true;
      if (suggestions.length)
        active =
          event.key === "ArrowDown"
            ? (active + 1) % suggestions.length
            : active <= 0
              ? suggestions.length - 1
              : active - 1;
    } else if (
      event.key === "Enter" &&
      (draft.trim() || (expanded && active >= 0))
    ) {
      event.preventDefault();
      if (expanded && active >= 0 && suggestions[active])
        add(suggestions[active], true);
      else add();
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      expanded = false;
      active = -1;
    }
  }
</script>

<section class="tags" aria-label="Card tags">
  <div class="heading">
    <label for={`${id}-input`}>Labels</label><span
      >{labels.length}/{TAG_LIMIT}</span
    >
  </div>
  {#if labels.length}
    <ul class="chips" aria-label="Selected tags">
      {#each labels as label (label)}
        <li>
          <span>{label}</span><button
            type="button"
            aria-label={`Remove tag ${label}`}
            {disabled}
            onclick={() => remove(label)}>×</button
          >
        </li>
      {/each}
    </ul>
  {:else}<p class="empty">No tags on this card.</p>{/if}
  <div class="input-row">
    <input
      bind:this={input}
      id={`${id}-input`}
      bind:value={draft}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={expanded && suggestions.length > 0}
      aria-controls={`${id}-options`}
      aria-activedescendant={expanded && active >= 0 && suggestions[active]
        ? `${id}-option-${active}`
        : undefined}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
      aria-invalid={!!error}
      placeholder="Find or create a tag"
      autocomplete="off"
      {disabled}
      oninput={() => {
        error = "";
        active = -1;
        expanded = true;
      }}
      onfocus={() => {
        expanded = true;
        void loadCatalog();
      }}
      onblur={() => {
        expanded = false;
        active = -1;
      }}
      onkeydown={keydown}
    />
    <button
      type="button"
      disabled={disabled || !draft.trim()}
      onclick={() => add()}>Add tag</button
    >
  </div>
  <p id={`${id}-hint`} class="hint">
    Enter adds one tag. Commas stay in its name. Up to {TAG_LENGTH_LIMIT} characters;
    names are case-sensitive.
  </p>
  {#if error}<p id={`${id}-error`} role="alert" class="tag-error">
      {error}
    </p>{/if}
  {#if expanded && suggestions.length}
    <ul
      id={`${id}-options`}
      class="suggestions"
      role="listbox"
      aria-label="Existing tags"
    >
      {#each suggestions as label, index}
        <li role="presentation">
          <button
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={active === index}
            type="button"
            tabindex="-1"
            {disabled}
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => add(label, true)}>{label}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  {#if catalogLoading}<p class="hint" role="status">
      Loading workspace tags…
    </p>{:else if catalogError}<p class="hint">
      {catalogError}
      <button type="button" {disabled} onclick={loadCatalog}
        >Retry workspace tags</button
      >
    </p>{/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</section>

<style>
  .tags {
    margin: 20px 0;
  }
  .heading,
  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .heading {
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 8px;
  }
  label {
    font-weight: 600;
  }
  .heading span,
  .hint,
  .empty {
    color: var(--muted);
  }
  .hint,
  .empty {
    font-size: 12px;
    line-height: 1.5;
    margin: 7px 0;
  }
  .input-row input {
    flex: 1;
    width: 100%;
    min-width: 0;
  }
  .input-row button {
    flex-shrink: 0;
  }
  .chips,
  .suggestions {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips li {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding-left: 10px;
    font-size: 12px;
  }
  .chips li span {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .chips button {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    font-size: 18px;
  }
  .suggestions {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .suggestions button {
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .suggestions button[aria-selected="true"] {
    background: var(--bg);
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tag-error {
    color: var(--danger, #b3261e);
    font-size: 13px;
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
