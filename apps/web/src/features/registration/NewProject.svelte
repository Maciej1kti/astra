<script lang="ts">
  import { errorMessage, serverMessage } from "../../lib/api/messages.ts";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import type {
    ProjectFolder,
    ProjectRepository,
  } from "../../lib/contracts/api.generated";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import {
    commandOperation,
    sessionAccess,
  } from "../../lib/api/command-operation.svelte";
  import { onMount } from "svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import {
    api,
    apiCode,
    command,
    isDefinitiveRejection,
  } from "../../lib/api/api";

  let {
    onclose,
    onadded,
    onbrowse,
  }: {
    onclose: () => void;
    onadded: (id: string) => void;
    onbrowse: () => void;
  } = $props();

  const access = sessionAccess({
    ended: () => {
      clearTimeout(timer);
      // Only an unresolved registration is retained below the pairing layer.
      if (!operation.pending && !job && !created) onclose();
    },
  });
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);

  let name = $state("");
  let error = $state("");
  let info = $state("");
  let busy = $state(false);
  let pending = $derived(operation.pending);
  // One creation ID for the whole dialog: a repeated request names the same folder.
  let creation = $state<{ creation_id: string; name: string } | null>(null);
  let created = $state<ProjectFolder | null>(null);
  let job = $state<string | null>(null);
  let registered = $state(false);
  let repository = $state<ProjectRepository | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  let confirmClose = $state(false);

  const started = $derived(!!creation);
  const step = $derived(
    !busy
      ? ""
      : !created
        ? "Tworzenie folderu projektu…"
        : !registered
          ? "Zapisywanie danych projektu…"
          : "Kończenie…",
  );

  function close() {
    if (busy) return;
    if (pending) confirmClose = true;
    else if (registered && created) onadded(created.plan.project_id);
    else onclose();
  }
  const wait = (milliseconds: number) =>
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, milliseconds);
    });

  async function register(folder: ProjectFolder) {
    if (!job) {
      if (!operation.pending)
        operation.prepare(
          command("/api/v1/registrations", "POST", {
            plan_id: folder.plan.plan_id,
          }),
        );
      const result = await operation.retry();
      job =
        result.kind === "accepted"
          ? result.jobId
          : (result.reply.result.job_id ?? null);
      if (!job) {
        error = "Wynik rejestracji jest nieznany. Ponów tę samą rejestrację.";
        return false;
      }
    }
    const result = await api<{ state: string }>(`/api/v1/jobs/${job}`);
    if (result.state !== "done") {
      error = `Stan rejestracji: ${stateLabel(result.state)}. Sprawdź wynik przed rozpoczęciem kolejnego żądania.`;
      return false;
    }
    if (operation.phase === "accepted") operation.finishJob();
    registered = true;
    return true;
  }

  /**
   * The host says whether it publishes repositories when it is asked to, so
   * the application shell carries nothing for this dialog.
   */
  async function publish(project: string) {
    // Called directly: a module shared with the Git dialog would become one
    // more chunk listed in the initial bundle, which has no room for it.
    const path = `/api/v1/projects/${project}/repository`;
    try {
      repository = await api<ProjectRepository>(path, "POST", {});
    } catch (e) {
      if (apiCode(e) === "GITHUB_DISABLED") return true;
      throw e;
    }
    while (active && !accessLost && repository.state === "publishing") {
      await wait(700);
      repository = await api<ProjectRepository>(
        path,
        "GET",
        undefined,
        {},
        { fresh: true },
      );
    }
    return repository.state === "published";
  }

  /** Runs every remaining step; a failed step is the one repeated next time. */
  async function create() {
    if (busy || accessLost || !name.trim()) return;
    busy = true;
    error = "";
    info = "";
    try {
      creation ??= { creation_id: crypto.randomUUID(), name: name.trim() };
      created ??= await api<ProjectFolder>(
        "/api/v1/project-folders",
        "POST",
        creation,
      );
      if (!registered && !(await register(created))) return;
      if (!(await publish(created.plan.project_id))) return;
      if (active) onadded(created.plan.project_id);
    } catch (e) {
      error = errorMessage(e);
      // A refused folder or plan cannot be repeated; the next attempt starts over.
      if (!registered && !job && isDefinitiveRejection(e)) {
        if (!created || operation.phase === "rejected") {
          creation = null;
          created = null;
        }
      }
    } finally {
      busy = false;
    }
  }
  async function copy() {
    info = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ creation, created, pending, job }, null, 2),
      );
      info = "Skopiowano szczegóły rejestracji.";
    } catch {
      error =
        "Schowek jest niedostępny. Skopiuj widoczny identyfikator żądania przed zamknięciem.";
    }
  }
  onMount(() => () => {
    active = false;
    clearTimeout(timer);
  });
</script>

<dialog
  class="app-dialog"
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Dodaj projekt"
>
  <DialogHeader
    title="Dodaj projekt"
    onclose={close}
    disabled={busy}
    closeLabel="Zamknij dodawanie projektu"
  />
  <form
    class="dialog-body"
    onsubmit={(event) => {
      event.preventDefault();
      void create();
    }}
  >
    <p>
      Podaj nazwę. Folder projektu powstanie sam, a na hoście połączonym z
      GitHubem także prywatne repozytorium.
    </p>
    <label
      >Nazwa projektu <input
        bind:value={name}
        maxlength="120"
        autocomplete="off"
        required
        disabled={busy || started}
      /></label
    >
    {#if created}<p class="created">
        Folder: <code>{created.plan.display_path}</code>
      </p>{/if}
    {#if !registered || !repository || repository.state !== "failed"}
      <Button
        type="submit"
        variant="primary"
        disabled={busy || accessLost || !name.trim()}
        >{busy
          ? step
          : job
            ? "Sprawdź rejestrację"
            : pending
              ? "Ponów tę samą rejestrację"
              : started
                ? "Ponów"
                : "Utwórz projekt"}</Button
      >
    {/if}
    {#if registered && repository?.state === "failed"}<section
        class="notice"
        role="status"
      >
        <strong>Projekt jest gotowy do pracy lokalnie</strong>
        <p>
          Nie udało się opublikować projektu na GitHubie.
          {serverMessage(repository.error ?? "GITHUB_UNAVAILABLE")}
        </p>
        <div class="actions">
          <Button type="submit" variant="primary" disabled={busy || accessLost}
            >{busy ? step : "Ponów publikację"}</Button
          >
          <button type="button" onclick={close} disabled={busy}
            >Otwórz projekt</button
          >
        </div>
        <p>Publikację można też ponowić później w oknie Git projektu.</p>
      </section>{/if}
    {#if pending}<p>Żądanie: {pending.requestId}</p>
      <button type="button" onclick={copy}>Kopiuj szczegóły rejestracji</button
      >{/if}
    <SessionNotice
      lost={accessLost}
      message="Sesja wygasła. Szczegóły rejestracji zostały zachowane; połącz przeglądarkę ponownie przed kontynuowaniem."
    />
    {#if error}<p role="alert">{error}</p>{/if}
    {#if info}<p role="status">{info}</p>{/if}
    {#if confirmClose}<section
        class="notice"
        role="group"
        aria-labelledby="registration-close-warning"
      >
        <p id="registration-close-warning" role="alert">
          Zamknięcie nie anuluje rejestracji o nieznanym wyniku. Najpierw
          skopiuj szczegóły żądania.
        </p>
        <button type="button" onclick={() => (confirmClose = false)}
          >Pozostaw otwarte</button
        ><button type="button" onclick={onclose}>Zamknij rejestrację</button>
      </section>{/if}
    <details>
      <summary>Masz już folder z projektem?</summary>
      <p>Możesz dodać istniejący folder z zatwierdzonych katalogów serwera.</p>
      <button type="button" onclick={onbrowse} disabled={busy || started}
        >Dodaj istniejący folder</button
      >
    </details>
  </form>
</dialog>

<style>
  label {
    display: block;
    margin: var(--space-8) 0;
  }
  label input {
    width: 100%;
    margin-top: var(--space-4);
  }
  .created {
    overflow-wrap: anywhere;
  }
  details {
    margin-top: var(--space-9);
  }
  .notice {
    margin-top: var(--space-8);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
  }
</style>
