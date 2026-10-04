<script lang="ts">
  import { counted } from "../../lib/ui/locale.ts";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import Icon from "../../lib/ui/Icon.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import { onMount, untrack } from "svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api } from "../../lib/api/api";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import type {
    Job,
    ProjectTagRenamePlan,
    TagCatalog,
  } from "../../lib/contracts/api.generated";
  import {
    applyProjectTagRename,
    getProjectTags,
    planProjectTagRename,
  } from "../../lib/api/tags";
  import { catalogNameError } from "./tag-management";

  let {
    onclose,
    onchanged,
    projectNames = {},
    initialProject = "",
  }: {
    onclose: () => void;
    onchanged: () => void;
    projectNames?: Record<string, string>;
    initialProject?: string;
  } = $props();
  let project = $state(
    untrack(() => initialProject || Object.keys(projectNames)[0] || ""),
  );
  let catalog = $state<TagCatalog | null>(null);
  let source = $state("");
  let target = $state("");
  let plan = $state<ProjectTagRenamePlan | null>(null);
  let job = $state<Job | null>(null);
  let busy = $state(false);
  let error = $state("");
  let accessLost = $state(false);
  let active = true;
  const operation = commandOperation(() => !accessLost);
  const pending = $derived(operation.pending);
  const canClose = $derived(
    !busy &&
      ((!pending && !job) ||
        job?.state === "needs_review" ||
        job?.state === "failed"),
  );
  function close() {
    if (canClose) onclose();
  }
  const targetError = $derived(
    target === source
      ? "Wybierz inną nazwę tagu."
      : target && catalog?.tags.some((tag) => tag.name === target)
        ? ""
        : target
          ? catalogNameError(target)
          : "",
  );

  async function load() {
    if (!project || pending || job) return;
    busy = true;
    error = "";
    plan = null;
    source = "";
    target = "";
    try {
      catalog = await getProjectTags(project);
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      busy = false;
    }
  }
  async function preview() {
    if (!source || !target || targetError || busy || !catalog?.complete) return;
    busy = true;
    error = "";
    try {
      plan = await planProjectTagRename(project, { source, target });
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      busy = false;
    }
  }
  async function poll(id: string) {
    try {
      const next = await api<Job>(
        `/api/v1/jobs/${id}`,
        "GET",
        undefined,
        {},
        { fresh: true },
      );
      if (!active) return;
      job = next;
      if (next.state === "done") {
        if (operation.phase === "accepted") operation.finishJob();
        plan = null;
        job = null;
        catalog = await getProjectTags(project);
        onchanged();
        window.dispatchEvent(new Event("tag-suggestions-changed"));
      } else if (next.state === "running") {
        setTimeout(() => {
          if (active) void poll(id);
        }, 600);
      } else {
        error =
          "Zmiana nazwy wymaga sprawdzenia. Sprawdź diagnostykę przed rozpoczęciem kolejnej zmiany.";
      }
    } catch (cause) {
      error = errorMessage(cause);
    }
  }
  async function apply() {
    if (!plan || pending || busy || accessLost) return;
    operation.prepare(applyProjectTagRename(project, plan.plan_id));
    await retry();
  }
  async function retry() {
    if (!pending || busy || accessLost) return;
    busy = true;
    error = "";
    try {
      const result = await operation.retry();
      const id =
        result.kind === "accepted" ? result.jobId : result.reply.result.job_id;
      if (!id)
        throw new Error(
          "Wynik zmiany nazwy jest nieznany. Sprawdź pierwotne polecenie.",
        );
      await poll(id);
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      busy = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ project, plan, pending, job }, null, 2),
      );
    } catch {
      error = "Schowek jest niedostępny.";
    }
  }
  onMount(() => {
    void load();
    const unsubscribe = subscribeSession({
      ended: () => {
        accessLost = true;
        error =
          "Sesja wygasła. Połącz się ponownie, aby sprawdzić to polecenie.";
      },
      restored: () => {
        accessLost = false;
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  });
</script>

<dialog
  class="app-dialog dialog-large"
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Zarządzaj tagami projektu"
>
  <DialogHeader
    title="Tagi projektu"
    description="Zmień nazwę lub połącz tagi używane w projekcie."
    onclose={close}
    disabled={!canClose}
    closeLabel="Zamknij zarządzanie tagami"
  >
    {#snippet actions()}
      <button
        class="quiet icon-button"
        aria-label="Odśwież tagi projektu"
        title="Odśwież tagi projektu"
        disabled={busy || !!pending || !!job}
        onclick={() => void load()}><Icon name="refresh" small /></button
      >
    {/snippet}
  </DialogHeader>
  <div class="dialog-body">
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
    <label for="tag-manager-project">Projekt</label>
    <select
      id="tag-manager-project"
      bind:value={project}
      disabled={busy || !!pending || !!job}
      onchange={() => void load()}
    >
      {#each Object.entries(projectNames) as [id, name]}<option value={id}
          >{name}</option
        >{/each}
    </select>
    {#if catalog}
      {#if !catalog.complete}<p class="notice">
          Nie udało się odczytać niektórych plików kart. Zmiana nazwy jest
          niedostępna do czasu ich naprawy.
        </p>{/if}
      <ul class="tag-list" aria-label="Tagi projektu">
        {#each catalog.tags as tag}<li>
            <strong>{tag.name}</strong>
            <small>{counted(tag.usage, "karta", "karty", "kart")}</small>
            <button
              disabled={busy || !!pending || !!job || !catalog.complete}
              onclick={() => {
                source = tag.name;
                target = "";
                plan = null;
              }}>Zmień nazwę / połącz</button
            >
          </li>{:else}<li>
            Brak tagów. Dodaj etykietę do karty, aby utworzyć tag.
          </li>{/each}
      </ul>
      {#if source}
        <h3>Zmień nazwę lub połącz {source}</h3>
        <p>
          Zarchiwizowane karty są uwzględnione. Wybór istniejącego tagu łączy
          je.
        </p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
        >
          <label
            >Tag docelowy <input
              bind:value={target}
              list="project-tag-names"
              disabled={busy || !!pending || !!job}
            /></label
          >
          <datalist id="project-tag-names"
            >{#each catalog.tags.filter((tag) => tag.name !== source) as tag}<option
                value={tag.name}
              ></option>{/each}</datalist
          >
          {#if targetError}<p class="notice">{targetError}</p>{/if}
          <button
            disabled={busy ||
              !!pending ||
              !!job ||
              !target ||
              !!targetError ||
              !catalog.complete}>Podgląd zmian</button
          >
        </form>
      {/if}
      {#if plan}
        <section aria-label="Podgląd zmiany nazwy tagu">
          <h3>
            Zmiana obejmie {counted(
              plan.changes.length,
              "kartę",
              "karty",
              "kart",
            )}
          </h3>
          <ul>
            {#each plan.changes as change}<li>{change.title}</li>{/each}
          </ul>
          <Button
            variant="primary"
            disabled={busy || !!pending || !!job || accessLost}
            onclick={() => void apply()}>Zmień nazwę w tym projekcie</Button
          >
        </section>
      {/if}
      {#if job}<p role="status">
          Zmiana nazwy: {stateLabel(job.state)} ({job.completed_steps}/{job.total_steps})
        </p>{/if}
      {#if pending}<p role="status">
          Identyfikator polecenia: {pending.requestId}
        </p>
        <button disabled={busy || accessLost} onclick={() => void retry()}
          >Ponów to samo polecenie</button
        >{/if}
    {:else if busy}<p role="status">Ładowanie tagów…</p>{/if}
  </div>
  {#if pending || job || error}<footer class="dialog-footer">
      <button onclick={() => void copy()}>Kopiuj szczegóły</button>
    </footer>{/if}
</dialog>

<style>
  label {
    display: grid;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }
  select,
  input {
    width: 100%;
  }
  .tag-list {
    padding: 0;
    list-style: none;
  }
  .tag-list li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    align-items: center;
    padding: var(--space-4) 0;
    border-bottom: var(--stroke) solid var(--line);
  }
  .tag-list strong {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .tag-list small {
    color: var(--muted);
  }
  .tag-list li :global(button) {
    margin-left: auto;
  }
</style>
