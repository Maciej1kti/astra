<script lang="ts">
  import { serverMessage } from "../../lib/api/messages.ts";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import type {
    RegistrationPlan as Plan,
    NativeFolderSelection as Selection,
    NativeFolderInput,
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
    command,
    isDefinitiveRejection,
    ApiError,
  } from "../../lib/api/api";

  const access = sessionAccess({
    ended: () => {
      choosing = false;
      clearTimeout(timer);
      // Only an unresolved registration is retained below the pairing layer.
      if (!operation.pending && !job) onclose();
    },
  });
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);

  let {
    onclose,
    onadded,
    onbrowse,
  }: {
    onclose: () => void;
    onadded: (id: string) => void;
    onbrowse: () => void;
  } = $props();
  let name = $state("");
  let tracked = $state(false);
  let error = $state("");
  let info = $state("");
  let plan = $state<Plan | null>(null);
  let choosing = $state(false);
  let busy = $state(false);
  let pending = $derived(operation.pending);
  let job = $state<string | null>(null);
  let selection = $state<NativeFolderInput | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  let confirmClose = $state(false);
  function close() {
    if (busy) return;
    if (pending) confirmClose = true;
    else onclose();
  }
  function explain(code: string) {
    const messages: Record<string, string> = {
      NATIVE_FOLDER_PICKER_UNAVAILABLE:
        "Systemowe okno wyboru folderu jest niedostępne. Uruchom serwer w sesji pulpitu i sprawdź, czy zainstalowano portal wyboru plików lub Zenity.",
      NATIVE_FOLDER_PICKER_TIMEOUT:
        "Upłynął czas wyboru folderu. Wybierz folder ponownie.",
      NATIVE_FOLDER_PICKER_FAILED:
        "Nie udało się otworzyć systemowego okna wyboru folderu. Sprawdź pulpit serwera i spróbuj ponownie.",
      FOLDER_PICKER_BUSY:
        "Na serwerze jest już otwarte okno wyboru folderu. Najpierw zakończ wybór lub go anuluj.",
    };
    return messages[code] ?? code;
  }
  function received(result: Selection) {
    if (!active || accessLost) return;
    if (result.state === "pending") {
      timer = setTimeout(() => void poll(), 500);
      return;
    }
    choosing = false;
    if (result.state === "selected") {
      plan = result.plan;
      selection = null;
    } else {
      selection = null;
      error =
        result.state === "cancelled"
          ? "Anulowano wybór folderu. Pliki projektu nie zostały zmienione."
          : explain(result.error ?? "Wybór folderu nie powiódł się.");
    }
  }
  async function poll() {
    if (!selection || accessLost) return;
    try {
      received(
        await api<Selection>(
          `/api/v1/native-folder-selections/${selection.selection_id}`,
        ),
      );
    } catch (e) {
      choosing = false;
      error = errorMessage(e);
      if (e instanceof ApiError && e.status === 404) selection = null;
    }
  }
  async function choose() {
    if (accessLost || pending) return;
    plan = null;
    error = "";
    choosing = true;
    selection ??= {
      selection_id: crypto.randomUUID(),
      git_mode: tracked ? "tracked" : "private",
      ...(name.trim() ? { name: name.trim() } : {}),
    };
    try {
      received(
        await api<Selection>(
          "/api/v1/native-folder-selections",
          "POST",
          selection,
        ),
      );
    } catch (e) {
      choosing = false;
      error = errorMessage(e);
      if (isDefinitiveRejection(e)) {
        error = explain((e.data.error as { code?: string })?.code ?? error);
        selection = null;
      }
    }
  }
  async function add() {
    if (!plan || accessLost) return;
    busy = true;
    error = "";
    info = "";
    try {
      if (!job) {
        if (!operation.pending)
          operation.prepare(
            command("/api/v1/registrations", "POST", {
              plan_id: plan.plan_id,
            }),
          );
        const result = await operation.retry();
        job =
          result.kind === "accepted"
            ? result.jobId
            : (result.reply.result.job_id ?? null);
        if (!job) {
          error = "Wynik rejestracji jest nieznany. Ponów tę samą rejestrację.";
          return;
        }
      }
      const result = await api<{ state: string }>(`/api/v1/jobs/${job}`);
      if (result.state !== "done") {
        error = `Stan rejestracji: ${stateLabel(result.state)}. Sprawdź wynik przed rozpoczęciem kolejnego żądania.`;
        return;
      }
      if (operation.phase === "accepted") operation.finishJob();
      onadded(plan.project_id);
    } catch (e) {
      error = errorMessage(e);
      if (!job && operation.phase === "rejected") {
        plan = null;
      }
    } finally {
      busy = false;
    }
  }
  async function copy() {
    info = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ selection, plan, pending, job }, null, 2),
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
  <div class="dialog-body">
    <p>
      Wybierz repozytorium w systemowym oknie wyboru folderu na serwerze. Folder
      może znajdować się w dowolnym miejscu na serwerze.
    </p>
    <label
      >Nazwa projektu <input
        bind:value={name}
        placeholder="Użyj nazwy folderu"
        disabled={choosing || busy || !!selection || !!pending || !!plan}
      /></label
    >
    <label class="check"
      ><input
        type="checkbox"
        bind:checked={tracked}
        disabled={choosing || busy || !!selection || !!pending || !!plan}
      /> Śledź pliki .project w Git</label
    >
    <Button
      variant="primary"
      onclick={choose}
      disabled={choosing || busy || !!pending || accessLost}
      >{choosing
        ? "Wybierz folder w oknie systemowym…"
        : selection
          ? "Sprawdź wybór folderu"
          : plan
            ? "Wybierz inny folder…"
            : "Wybierz folder…"}</Button
    >
    {#if choosing}<p role="status">
        Okno systemowe otwiera się na komputerze, na którym działa Astra.
        Wybierz tam folder lub naciśnij Anuluj.
      </p>{/if}
    {#if plan}<section class="notice">
        <strong>Wybrane repozytorium</strong>
        <p>{plan.display_path}</p>
        <p>
          Dodanie tworzy pliki planowania .project i zarządzany blok AGENTS.md.
          Istniejąca zawartość zostaje zachowana.
        </p>
        {#each plan.warnings as warning}<p>
            {serverMessage(warning.code)}
          </p>{/each}
        <details>
          <summary>Pliki do aktualizacji</summary
          >{#each plan.changes.filter((c) => c.action !== "no_change") as change}<p
            >
              {change.path}
            </p>{/each}
        </details>
        <Button variant="primary" onclick={add} disabled={busy || accessLost}
          >{job
            ? "Sprawdź rejestrację"
            : pending
              ? "Ponów tę samą rejestrację"
              : "Dodaj projekt"}</Button
        >
      </section>{/if}
    {#if pending}<p>Żądanie: {pending.requestId}</p>
      <button onclick={copy}>Kopiuj szczegóły rejestracji</button>{/if}
    <SessionNotice
      lost={accessLost}
      message="Sesja wygasła. Szczegóły rejestracji zostały zachowane; połącz przeglądarkę ponownie przed kontynuowaniem."
    />
    {#if error}<p role="alert">{error}</p>{/if}
    {#if info}<p role="status">{info}</p>{/if}
    {#if confirmClose}<section class="notice" role="alert">
        <p>
          Zamknięcie nie anuluje rejestracji o nieznanym wyniku. Najpierw
          skopiuj szczegóły żądania.
        </p>
        <button onclick={() => (confirmClose = false)}>Pozostaw otwarte</button
        ><button onclick={onclose}>Zamknij rejestrację</button>
      </section>{/if}
    <details>
      <summary>Zdalny serwer bez pulpitu?</summary>
      <p>Możesz przeglądać katalogi zatwierdzone przez właściciela serwera.</p>
      <button onclick={onbrowse} disabled={choosing || busy || !!pending}
        >Przeglądaj zatwierdzone foldery</button
      >
    </details>
  </div>
</dialog>

<style>
  label {
    display: block;
    margin: var(--space-8) 0;
  }
  label:not(.check) input {
    width: 100%;
    margin-top: var(--space-4);
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--tap-target);
  }
  details {
    margin-top: var(--space-9);
  }
  .notice {
    margin-top: var(--space-8);
  }
</style>
