<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { getProjectTags } from "../../lib/api/tags";
  import { isAbortError } from "../../lib/api/read-requests";
  import { addTag, matchingTags, TAG_LIMIT, TAG_LENGTH_LIMIT } from "./tags";

  let {
    labels = $bindable<string[]>([]),
    draft = $bindable(""),
    error = $bindable(""),
    disabled = false,
    project,
  }: {
    labels?: string[];
    draft?: string;
    error?: string;
    disabled?: boolean;
    project: string;
  } = $props();
  const id = $props.id();
  let input = $state<HTMLInputElement>();
  let expanded = $state(false);
  let pointerOutside = false;
  let active = $state(-1);
  let announcement = $state("");
  let projectOptions = $state<string[]>([]);
  let catalogError = $state("");
  let catalogLoading = $state(false);
  let catalogLoaded = false;
  let generation = 0;
  let accessLost = false;
  const suggestions = $derived(matchingTags(projectOptions, labels, draft));
  async function loadCatalog(force = false) {
    if (accessLost || catalogLoading || (catalogLoaded && !force)) return;
    const current = ++generation;
    catalogLoading = true;
    catalogError = "";
    try {
      const catalog = await getProjectTags(project);
      if (current !== generation || accessLost) return;
      projectOptions = catalog.tags.map((tag) => tag.name);
      catalogLoaded = true;
      if (!catalog.complete)
        catalogError =
          "Some project tags are unavailable. Available suggestions are shown.";
    } catch (error) {
      if (current === generation && !isAbortError(error))
        catalogError = "Project tags could not be loaded.";
    } finally {
      if (current === generation) catalogLoading = false;
    }
  }
  onMount(() => {
    void loadCatalog();
    const ended = () => {
      generation++;
      accessLost = true;
      projectOptions = [];
      catalogLoaded = false;
      catalogLoading = false;
    };
    const restored = () => {
      accessLost = false;
      void loadCatalog();
    };
    const changed = () => {
      generation++;
      catalogLoading = false;
      catalogLoaded = false;
      if (expanded) void loadCatalog();
      else projectOptions = [];
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

  function collapse() {
    expanded = false;
    active = -1;
    pointerOutside = false;
  }
  $effect(() => {
    if (!expanded) return;
    const pointerDown = (event: PointerEvent) => {
      pointerOutside = event.target !== input;
    };
    const pointerEnd = () => {
      if (!pointerOutside) return;
      pointerOutside = false;
      if (document.activeElement !== input) collapse();
    };
    // Suggestions change the dialog height. Keep a pointer target in place
    // through its click, including Add, Remove and the editor close control.
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("click", pointerEnd);
    document.addEventListener("pointercancel", pointerEnd);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("click", pointerEnd);
      document.removeEventListener("pointercancel", pointerEnd);
    };
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
            onclick={() => remove(label)}><Icon name="close" small /></button
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
        pointerOutside = false;
        expanded = true;
        void loadCatalog();
      }}
      onblur={() => {
        if (!pointerOutside) collapse();
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
    Enter adds a tag. Names are case-sensitive.
    <span class="sr-only"
      >Commas stay in its name. Up to {TAG_LENGTH_LIMIT} characters.</span
    >
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
      Loading project tags…
    </p>{:else if catalogError}<p class="hint">
      {catalogError}
      <button type="button" {disabled} onclick={() => void loadCatalog()}
        >Retry project tags</button
      >
    </p>{/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</section>

<style>
  .tags {
    margin: var(--space-9) 0;
  }
  .heading,
  .input-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .heading {
    justify-content: space-between;
    font-size: var(--text-label);
    margin-bottom: var(--space-4);
  }
  label {
    font-weight: var(--weight-semibold);
  }
  .heading span,
  .hint,
  .empty {
    color: var(--muted);
  }
  .hint,
  .empty {
    font-size: var(--text-sm);
    line-height: var(--leading-body);
    margin: var(--space-4) 0;
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
    margin: 0 0 var(--space-4);
    padding: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .chips li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    background: var(--bg);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    padding-left: var(--space-5);
    font-size: var(--text-sm);
  }
  .chips li span {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .chips button {
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    padding: 0;
    border: 0;
    background: transparent;
    font-size: var(--text-xl);
  }
  .suggestions {
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
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
    outline: var(--focus-width) solid var(--accent);
    outline-offset: calc(-1 * var(--focus-width));
  }
  .tag-error {
    color: var(--danger);
    font-size: var(--text-label);
  }
  .sr-only {
    position: absolute;
    width: var(--stroke);
    height: var(--stroke);
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
