<script lang="ts">
  import { revealLayers, suggestionLayers } from "../../lib/ui/motion-layers";
  import { all } from "../../lib/api/api";
  import Icon from "../../lib/ui/Icon.svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { getProjectTags } from "../../lib/api/tags";
  import type { TagCatalog } from "../../lib/contracts/api.generated";
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
    openingCatalog,
  }: {
    labels?: string[];
    draft?: string;
    error?: string;
    catalogError?: string;
    messagesInHeader?: boolean;
    disabled?: boolean;
    project?: string;
    kind?: "tag" | "folder";
    openingCatalog?: () => Promise<TagCatalog> | undefined;
  } = $props();
  const id = $props.id();
  const folder = $derived(kind === "folder");
  const catalogLabel = $derived(folder ? "foldery" : "tagi projektu");
  let input = $state<HTMLInputElement>();
  let expanded = $state(false);
  let pointerOutside = false;
  let active = $state(-1);
  let announcement = $state("");
  let addedLabel = $state("");
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
      const opening = folder ? undefined : openingCatalog?.();
      const catalog = folder
        ? {
            names: await all<string>("/api/v1/views/folders"),
            complete: true,
          }
        : await ((!force && opening) || getProjectTags(project)).then(
            (result) => ({
              names: result.tags.map((tag) => tag.name),
              complete: result.complete,
            }),
          );
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the session can end while the catalog above is awaited
      if (current !== generation || accessLost) return;
      projectOptions = catalog.names;
      catalogLoaded = true;
      if (!catalog.complete)
        catalogError = `Niektóre ${catalogLabel} są niedostępne. Wyświetlono dostępne podpowiedzi.`;
    } catch (error) {
      if (current === generation && !isAbortError(error))
        catalogError = `${folder ? "Foldery" : "Tagi projektu"} nie mogły zostać wczytane.`;
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
            ? "Wpisz nazwę folderu."
            : [...name].length > 48
              ? "Folder może zawierać maksymalnie 48 znaków."
              : /[\r\n\0]/.test(name)
                ? "Nazwa folderu musi mieścić się w jednym wierszu."
                : labels.includes(name)
                  ? "Ten folder jest już przypisany."
                  : "",
        }
      : addTag(labels, value, fromSuggestion);
    error = result.error;
    if (!error) {
      labels = result.labels;
      addedLabel = (folder ? labels[0] : labels.at(-1)) ?? "";
      draft = "";
      announcement = folder
        ? `Ustaw folder ${labels[0]}.`
        : `Dodano tag ${labels.at(-1)}.`;
      active = -1;
    }
    input?.focus();
  }

  function remove(label: string) {
    labels = labels.filter((item) => item !== label);
    error = "";
    announcement = folder
      ? `Usunięto folder ${label} z tego projektu.`
      : `Usunięto tag ${label} z tej karty.`;
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

<section class="tags" aria-label={folder ? "Folder projektu" : "Tagi karty"}>
  {#if folder}<div class="heading">
      <label for={`${id}-input`}>Folder</label><span>{labels.length}/1</span>
    </div>{:else}
    <SectionHeading
      title="Etykiety"
      level={3}
      visuallyHidden
      count={`${labels.length}/${TAG_LIMIT}`}
    />
    <label class="sr-only" for={`${id}-input`}>Etykiety</label>
  {/if}
  {#if labels.length}
    <ul class="chips" aria-label={folder ? "Wybrany folder" : "Wybrane tagi"}>
      {#each labels as label (label)}
        <li class:chip-added={label === addedLabel}>
          <span>{label}</span><button
            type="button"
            aria-label={`Usuń ${kind === "folder" ? "folder" : "tag"} ${label}`}
            {disabled}
            onclick={() => remove(label)}><Icon name="close" small /></button
          >
        </li>
      {/each}
    </ul>
  {:else}<p class="empty">
      {folder ? "Ten projekt nie ma folderu." : "Ta karta nie ma tagów."}
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
      placeholder={folder
        ? "Znajdź lub utwórz folder"
        : "Znajdź lub utwórz tag"}
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
      class:tag-add={!folder}
      aria-label={folder ? undefined : "Dodaj tag"}
      title={folder ? undefined : "Dodaj tag"}
      disabled={disabled || !draft.trim()}
      onclick={() => add()}
      >{#if folder}{labels.length ? "Ustaw folder" : "Dodaj folder"}{:else}<Icon
          name="plus"
        />{/if}</button
    >
  </div>
  {#if folder}<p id={`${id}-hint`} class="hint">
      Enter ustawia folder. Jeden folder na projekt.
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
      use:revealLayers={suggestionLayers}
      role="listbox"
      aria-label={folder ? "Istniejące foldery" : "Istniejące tagi"}
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
      Ładowanie {catalogLabel}…
    </p>{:else if catalogError}<p class="hint">
      {catalogError}
      <button type="button" {disabled} onclick={() => void loadCatalog()}
        >Ponów {catalogLabel}</button
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
    font-size: var(--text-base);
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
    margin: 0;
  }
  .input-row button {
    flex-shrink: 0;
  }
  .tag-add {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    padding: 0;
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
    gap: 0 var(--space-3);
  }
  .chips li {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    max-width: 100%;
    padding-left: var(--space-4);
    font-size: var(--text-sm);
  }
  /* The visible chip is shorter than the 44px target it sits in. */
  .chips li::before {
    content: "";
    position: absolute;
    inset: var(--space-4) 0;
    z-index: -1;
    border-radius: var(--radius-sm);
    background: var(--soft);
  }
  .chips li span {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .chips button {
    display: grid;
    place-items: center;
    /* A full target centred on the small mark; it may overlap the label's end. */
    width: var(--tap-target);
    min-width: var(--tap-target);
    min-height: var(--tap-target);
    margin-inline: calc(-1 * var(--space-3));
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
  }
  .chips button:hover {
    color: var(--ink);
    background: transparent;
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
    font-size: var(--text-base);
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
