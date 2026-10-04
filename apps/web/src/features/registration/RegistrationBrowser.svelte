<script lang="ts">
  import { serverMessage, errorMessage } from "../../lib/api/messages.ts";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";

  import type {
    Root,
    RegistrationPlan,
    DirectoryPage,
  } from "../../lib/contracts/api.generated";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount, untrack } from "svelte";
  import { api, command } from "../../lib/api/api";
  import { modal, layerExit } from "../../lib/ui/dialog";

  const operation = commandOperation();

  let {
    open = $bindable(false),
    onregistered,
    onpendingchange,
  }: {
    open: boolean;
    onregistered: (project: string) => void | Promise<void>;
    onpendingchange?: (pending: boolean) => void;
  } = $props();
  let busy = $state(false);
  let error = $state("");
  let roots = $state<Root[]>([]);
  let root = $state("");
  let relative = $state("");
  let projectName = $state("");
  let tracked = $state(false);
  let plan = $state<RegistrationPlan | null>(null);
  let browsing = $state(false);
  let directoryReady = $state(false);
  let directoryCursor = $state<string | null>(null);
  let directoryPaged = $state(false);
  let browseGeneration = 0;
  let directories = $state<DirectoryPage["items"]>([]);
  let registrationPending = $derived(operation.pending);
  let registrationJob = $state<string | null>(null);
  function close() {
    if (!busy) open = false;
  }
  $effect(() => {
    onpendingchange?.(busy || !!registrationPending || !!registrationJob);
  });
  function message(value: unknown) {
    error = errorMessage(value);
  }
  $effect(() => {
    if (open) untrack(() => void browseProjects());
  });
  onMount(() => {
    const ended = () => {
      browseGeneration++;
      roots = [];
      directories = [];
      directoryReady = false;
      open = false;
    };
    const unsubscribeSession = subscribeSession({ ended: ended });
    return () => {
      browseGeneration++;
      unsubscribeSession();
    };
  });
  async function browseProjects() {
    const generation = ++browseGeneration;
    if (registrationPending) {
      try {
        const found = (await api<{ items: Root[] }>("/api/v1/roots")).items;
        if (generation === browseGeneration && open) roots = found;
      } catch (e) {
        message(e);
      }
      return;
    }
    plan = null;
    projectName = "";
    directoryReady = false;
    error = "";
    try {
      const found = (await api<{ items: Root[] }>("/api/v1/roots")).items;
      if (generation !== browseGeneration || !open) return;
      roots = found;
      root = roots[0]?.id ?? "";
      relative = "";
      if (root) await browse("");
    } catch (e) {
      message(e);
    }
  }
  async function browse(path: string, cursor: string | null = null) {
    if (registrationPending || busy) return;
    const generation = ++browseGeneration,
      selectedRoot = root;
    relative = path;
    plan = null;
    directoryReady = false;
    browsing = true;
    directories = [];
    error = "";
    try {
      const page = await api<{
        items: typeof directories;
        next_cursor: string | null;
      }>(
        `/api/v1/roots/${selectedRoot}/directories?relative_path=${encodeURIComponent(path)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (generation !== browseGeneration) return;
      directories = page.items;
      directoryCursor = page.next_cursor;
      directoryPaged = !!cursor;
      directoryReady = true;
    } catch (e) {
      if (generation === browseGeneration) message(e);
    } finally {
      if (generation === browseGeneration) browsing = false;
    }
  }
  async function preview() {
    if (!directoryReady || browsing || registrationPending) return;
    busy = true;
    error = "";
    try {
      plan = await api("/api/v1/registration-plans", "POST", {
        root_id: root,
        relative_path: relative || ".",
        ...(projectName ? { name: projectName } : {}),
        git_mode: tracked ? "tracked" : "private",
      });
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function register() {
    if (!plan) return;
    busy = true;
    try {
      if (!registrationJob) {
        if (!operation.pending)
          operation.prepare(
            command("/api/v1/registrations", "POST", {
              plan_id: plan.plan_id,
            }),
          );
        const result = await operation.retry();
        registrationJob =
          result.kind === "accepted"
            ? result.jobId
            : (result.reply.result.job_id ?? null);
        if (!registrationJob)
          throw new Error(
            "Wynik rejestracji jest w toku. Ponów to samo żądanie.",
          );
      }
      const job = await api<{ state: string }>(
        `/api/v1/jobs/${registrationJob}`,
      );
      if (job.state !== "done")
        throw new Error(
          `Stan rejestracji: ${stateLabel(job.state)}. Zadanie: ${registrationJob}`,
        );
      const projectId = plan.project_id;
      open = false;
      if (operation.phase === "accepted") operation.finishJob();
      registrationJob = null;
      await onregistered(projectId);
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <dialog
    use:modal={{ onclose: close }}
    out:layerExit|global
    class="app-dialog modal"
    aria-label="Dodaj projekt"
  >
    <DialogHeader
      title="Dodaj projekt"
      onclose={close}
      disabled={busy}
      closeLabel="Zamknij"
    />
    <div class="dialog-body">
      <p>
        Wybierz folder projektu na tym serwerze. Pliki pozostaną w tym folderze.
      </p>
      {#if !roots.length}<p>
          Nie zatwierdzono jeszcze żadnych katalogów. Na serwerze uruchom:
        </p>
        <code
          >projectctl --socket /path/to/projectd.sock add-root /absolute/path
          --label "Projekty"</code
        >{:else}<label
          >Foldery projektów<select
            bind:value={root}
            disabled={!!registrationPending || busy}
            onchange={() => browse("")}
            >{#each roots as r}<option value={r.id}>{r.label}</option
              >{/each}</select
          ></label
        >
        <p class="breadcrumb">
          {roots.find((r) => r.id === root)?.display_path}/{relative}
        </p>
        <Button
          type="button"
          disabled={!relative || busy || !!registrationPending || browsing}
          onclick={() => browse(relative.split("/").slice(0, -1).join("/"))}
          ><Icon name="chevronUp" small />Katalog nadrzędny</Button
        >
        <div class="directories">
          {#if browsing}<p role="status">Ładowanie folderów…</p>{/if}
          {#each directories as directory}<Button
              type="button"
              disabled={busy || !!registrationPending || browsing}
              aria-label={`Otwórz folder: ${directory.name}`}
              onclick={() => browse(directory.relative_path)}
              ><Icon name="projects" small />
              <span class="directory-name"
                >{directory.name}{directory.registered
                  ? " · registered"
                  : ""}</span
              >
              <Icon name="arrow" small /></Button
            >{:else}{#if directoryReady}<p>
                Brak podfolderów. Możesz wybrać ten folder.
              </p>{/if}{/each}
        </div>
        {#if directoryPaged}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative)}>Pierwsza strona folderów</button
          >{/if}
        {#if directoryCursor}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative, directoryCursor)}
            >Więcej folderów</button
          >{/if}
        <label
          >Nazwa projektu<input
            bind:value={projectName}
            disabled={!!registrationPending || busy}
            oninput={() => (plan = null)}
            placeholder="Użyj nazwy folderu"
          /></label
        ><label class="check"
          ><input
            type="checkbox"
            disabled={!!registrationPending || busy}
            bind:checked={tracked}
            onchange={() => (plan = null)}
          /> Śledź pliki .project w repozytorium Git projektu</label
        >{#if plan}<section class="notice">
            <strong>Wybrany folder</strong>
            <p class="breadcrumb">{plan.display_path}</p>
            <p>
              Dodaj pliki planowania w .project i instrukcje projektu w
              AGENTS.md. Istniejąca zawartość zostaje zachowana.
            </p>
            {#each plan.warnings as warning}<p>
                {serverMessage(warning.code)}
              </p>{/each}
            <details>
              <summary>Pliki do aktualizacji</summary>
              {#each plan.changes.filter((change) => change.action !== "no_change") as change}<p
                  class="breadcrumb"
                >
                  {change.path}
                </p>{/each}
            </details>
          </section>
          <Button variant="primary" onclick={register} disabled={busy}
            >{registrationJob
              ? "Sprawdź rejestrację"
              : registrationPending
                ? "Ponów tę samą rejestrację"
                : "Dodaj wybrany projekt"}</Button
          >{#if registrationPending}<p>
              Żądanie: {registrationPending.requestId}
            </p>{/if}{:else}<Button
            variant="primary"
            onclick={preview}
            disabled={busy || browsing || !directoryReady}
            >Wybierz ten folder</Button
          >{/if}{/if}{#if error}<p class="notice">{error}</p>{/if}
    </div>
  </dialog>
{/if}

<style>
  label {
    display: block;
    margin: var(--space-8) 0;
  }
  input:not([type="checkbox"]),
  select {
    display: block;
    width: 100%;
    margin-top: var(--space-4);
  }
  .check {
    min-height: var(--tap-target);
    display: flex;
    align-items: center;
    gap: var(--space-5);
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
  .breadcrumb {
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
    color: var(--muted);
  }
  details {
    margin: var(--space-9) 0;
  }
  code {
    display: block;
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
    line-height: var(--leading-body);
  }
</style>
