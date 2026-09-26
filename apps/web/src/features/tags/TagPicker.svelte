<script lang="ts">
  import { all } from "../../lib/api/api";
  import Icon from "../../lib/ui/Icon.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { getProjectTags } from "../../lib/api/tags";
  import { isAbortError } from "../../lib/api/read-requests";
  import { addTag, matchingTags, TAG_LIMIT } from "./tags";

  let {
    labels = $bindable<string[]>([]),
    draft = $bindable(""),
    error = $bindable(""),
    catalogError = $bindable(""),
    messagesInHeader = false,
    disabled = false,
    project = "",
    kind = "tag",
  }: {
    labels?: string[];
    draft?: string;
    error?: string;
    catalogError?: string;
    messagesInHeader?: boolean;
    disabled?: boolean;
    project?: string;
    kind?: "tag" | "folder";
  } = $props();
  const id = $props.id();
  const folder = $derived(kind === "folder");
  const catalogLabel = $derived(folder ? "folders" : "project tags");
  let input = $state<HTMLInputElement>();
  let expanded = $state(false);
  let pointerOutside = false;
  let active = $state(-1);
  let announcement = $state("");
  let projectOptions = $state<string[]>([]);
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
      const catalog = folder
        ? {
            names: await all<string>("/api/v1/views/folders"),
            complete: true,
          }
        : await getProjectTags(project).then((result) => ({
            names: result.tags.map((tag) => tag.name),
            complete: result.complete,
          }));
      if (current !== generation || accessLost) return;
      projectOptions = catalog.names;
      catalogLoaded = true;
      if (!catalog.complete)
        catalogError = `Some ${catalogLabel} are unavailable. Available suggestions are shown.`;
    } catch (error) {
      if (current === generation && !isAbortError(error))
        catalogError = `${folder ? "Folders" : "Project tags"} could not be loaded.`;
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
    const name = value.trim();
    const result = folder
      ? {
          labels: [name],
          error: !name
            ? "Enter a folder name."
            : [...name].length > 48
              ? "A folder can contain up to 48 characters."
              : /[\r\n\0]/.test(name)
                ? "Use a single-line folder name."
                : labels.includes(name)
                  ? "This folder is already assigned."
                  : "",
        }
      : addTag(labels, value, fromSuggestion);
    error = result.error;
    if (!error) {
      labels = result.labels;
      draft = "";
      announcement = folder
        ? `Set folder ${labels[0]}.`
        : `Added tag ${labels.at(-1)}.`;
      active = -1;
    }
    input?.focus();
  }

  function remove(label: string) {
    labels = labels.filter((item) => item !== label);
    error = "";
    announcement = folder
      ? `Removed folder ${label} from this project.`
      : `Removed tag ${label} from this card.`;
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

<section class="tags" aria-label={folder ? "Project folder" : "Card tags"}>
  <div class="heading">
    <label for={`${id}-input`}>{folder ? "Folder" : "Labels"}</label><span
      >{labels.length}/{folder ? 1 : TAG_LIMIT}</span
    >
  </div>
  {#if labels.length}
    <ul class="chips" aria-label={folder ? "Selected folder" : "Selected tags"}>
      {#each labels as label (label)}
        <li>
          <span>{label}</span><button
            type="button"
            aria-label={`Remove ${kind} ${label}`}
            {disabled}
            onclick={() => remove(label)}><Icon name="close" small /></button
          >
        </li>
      {/each}
    </ul>
  {:else}<p class="empty">
      {folder ? "No folder on this project." : "No tags on this card."}
    </p>{/if}
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
      aria-describedby={[folder ? `${id}-hint` : "", error ? `${id}-error` : ""]
        .filter(Boolean)
        .join(" ") || undefined}
      aria-invalid={!!error}
      placeholder={folder ? "Find or create a folder" : "Find or create a tag"}
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
      onclick={() => add()}
      >{folder
        ? labels.length
          ? "Set folder"
          : "Add folder"
        : "Add tag"}</button
    >
  </div>
  {#if folder}<p id={`${id}-hint`} class="hint">
      Enter sets the folder. One folder per project.
    </p>{/if}
  {#if error}<p
      id={`${id}-error`}
      role={messagesInHeader ? undefined : "alert"}
      class="tag-error"
      class:sr-only={messagesInHeader}
    >
      {error}
    </p>{/if}
  {#if expanded && suggestions.length}
    <ul
      id={`${id}-options`}
      class="suggestions"
      role="listbox"
      aria-label={folder ? "Existing folders" : "Existing tags"}
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
      Loading {catalogLabel}…
    </p>{:else if catalogError}<p class="hint">
      {catalogError}
      <button type="button" {disabled} onclick={() => void loadCatalog()}
        >Retry {catalogLabel}</button
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
