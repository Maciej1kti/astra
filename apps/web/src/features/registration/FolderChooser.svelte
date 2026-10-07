<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import type {
    Directory,
    DirectoryPage,
    Root,
  } from "../../lib/contracts/api.generated";
  import { api } from "../../lib/api/api";
  import { onMount } from "svelte";

  /** A directory below an approved root; an empty path is the root itself. */
  type Place = { root: string; relative: string };

  let {
    roots,
    start,
    onchoose,
    oncancel,
  }: {
    roots: Root[];
    start: Place;
    onchoose: (place: Place) => void;
    oncancel: () => void;
  } = $props();

  let root = $state("");
  let relative = $state("");
  let directories = $state<DirectoryPage["items"]>([]);
  let cursor = $state<string | null>(null);
  let paged = $state(false);
  let loading = $state(false);
  let ready = $state(false);
  let adding = $state(false);
  let folderName = $state("");
  let error = $state("");
  let generation = 0;

  const location = $derived(
    `${roots.find((item) => item.id === root)?.display_path ?? ""}${relative ? `/${relative}` : ""}`,
  );

  async function browse(path: string, from: string | null = null) {
    const current = ++generation;
    relative = path;
    directories = [];
    ready = false;
    loading = true;
    error = "";
    try {
      const page = await api<DirectoryPage>(
        `/api/v1/roots/${root}/directories?relative_path=${encodeURIComponent(path)}${from ? `&cursor=${encodeURIComponent(from)}` : ""}`,
        "GET",
        undefined,
        {},
        { fresh: true },
      );
      if (current !== generation) return;
      directories = page.items;
      cursor = page.next_cursor;
      paged = !!from;
      ready = true;
    } catch (e) {
      if (current === generation) error = errorMessage(e);
    } finally {
      if (current === generation) loading = false;
    }
  }
  async function addFolder() {
    const name = folderName.trim();
    if (!name || adding) return;
    adding = true;
    error = "";
    try {
      const made = await api<Directory>(
        `/api/v1/roots/${root}/directories`,
        "POST",
        { relative_path: relative, name },
      );
      folderName = "";
      await browse(made.relative_path);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      adding = false;
    }
  }
  onMount(() => {
    root = start.root;
    void browse(start.relative);
    return () => generation++;
  });
</script>

<section class="chooser" aria-label="Miejsce projektu">
  {#if roots.length > 1}<label
      >Katalog<select
        aria-label="Katalog"
        bind:value={root}
        disabled={loading || adding}
        onchange={() => browse("")}
        >{#each roots as item}<option value={item.id}>{item.label}</option
          >{/each}</select
      ></label
    >{/if}
  <p class="location">{location}</p>
  <Button
    type="button"
    disabled={!relative || loading || adding}
    onclick={() => browse(relative.split("/").slice(0, -1).join("/"))}
    ><Icon name="chevronUp" small />Katalog nadrzędny</Button
  >
  <div class="directories">
    {#if loading}<p role="status">Ładowanie folderów…</p>{/if}
    {#each directories as directory}<Button
        type="button"
        disabled={loading || adding}
        aria-label={`Otwórz folder: ${directory.name}`}
        onclick={() => browse(directory.relative_path)}
        ><Icon name="projects" small />
        <span class="directory-name"
          >{directory.name}{directory.registered ? " · projekt" : ""}</span
        >
        <Icon name="arrow" small /></Button
      >{:else}{#if ready}<p>Brak podfolderów.</p>{/if}{/each}
  </div>
  {#if paged}<button
      type="button"
      disabled={loading || adding}
      onclick={() => browse(relative)}>Pierwsza strona folderów</button
    >{/if}
  {#if cursor}<button
      type="button"
      disabled={loading || adding}
      onclick={() => browse(relative, cursor)}>Więcej folderów</button
    >{/if}
  <div class="new-folder">
    <label
      >Nowy folder<input
        bind:value={folderName}
        maxlength="100"
        autocomplete="off"
        disabled={loading || adding || !ready}
        onkeydown={(event) => {
          // The chooser sits inside the project form: Enter adds the folder.
          if (event.key !== "Enter") return;
          event.preventDefault();
          void addFolder();
        }}
      /></label
    >
    <Button
      type="button"
      disabled={loading || adding || !ready || !folderName.trim()}
      onclick={addFolder}>{adding ? "Dodawanie…" : "Dodaj folder"}</Button
    >
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="actions">
    <Button
      type="button"
      variant="primary"
      disabled={loading || adding || !ready}
      onclick={() => onchoose({ root, relative })}>Wybierz ten folder</Button
    >
    <button type="button" onclick={oncancel} disabled={adding}>Anuluj</button>
  </div>
</section>

<style>
  .chooser {
    margin: var(--space-8) 0;
    padding: var(--space-8);
    background: var(--soft);
    border-radius: var(--radius-control);
  }
  label {
    display: block;
    margin: 0 0 var(--space-6);
  }
  input,
  select {
    display: block;
    width: 100%;
    margin-top: var(--space-4);
  }
  .location {
    margin-top: 0;
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
    color: var(--muted);
  }
  .directories {
    max-height: var(--suggestions-height);
    overflow: auto;
    margin: var(--space-5) 0;
  }
  .directories :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    text-align: left;
    justify-content: space-between;
    margin: var(--space-2) 0;
  }
  .directory-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .new-folder {
    display: flex;
    align-items: end;
    gap: var(--space-6);
    margin-top: var(--space-6);
  }
  .new-folder label {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    margin-top: var(--space-8);
  }
</style>
