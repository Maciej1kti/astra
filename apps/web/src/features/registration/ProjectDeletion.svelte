<script lang="ts">
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import { onMount } from "svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import {
    deleteProject,
    getProjectDeletionPlan,
  } from "../../lib/api/resources";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import type { Summary } from "../../lib/api/api";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { errorMessage } from "../../lib/api/messages";

  let {
    project,
    onclose,
    ondeleted,
  }: {
    project: Summary;
    onclose: () => void;
    ondeleted: (id: string) => void;
  } = $props();

  let accessLost = $state(false);
  let loading = $state(true);
  let plan = $state<Awaited<ReturnType<typeof getProjectDeletionPlan>> | null>(
    null,
  );
  let error = $state("");
  let conflict = $state(false);
  const operation = commandOperation(() => !accessLost);
  let pending = $derived(operation.pending);
  let busy = $derived(operation.busy);

  function bytes(value: number) {
    if (value < 1024) return `${value} bajtów`;
    if (value < 1024 * 1024)
      return `${(value / 1024).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KiB`;
    return `${(value / (1024 * 1024)).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MiB`;
  }
  async function loadPlan() {
    if (busy || pending) return;
    loading = true;
    error = "";
    conflict = false;
    plan = null;
    try {
      plan = await getProjectDeletionPlan(project.id);
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      loading = false;
    }
  }
  function close() {
    if (busy || pending) return;
    onclose();
  }
  async function remove() {
    if (!plan || busy || pending || accessLost || conflict) return;
    error = "";
    try {
      operation.prepare(deleteProject(project.id, plan.version));
    } catch (cause) {
      error = commandErrorMessage(cause);
      return;
    }
    await runDelete("submit");
  }
  async function check() {
    await runDelete("status");
  }
  async function retry() {
    await runDelete("submit");
  }
  async function runDelete(action: "submit" | "status") {
    if (!pending || busy || accessLost) return;
    error = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      ondeleted(project.id);
    } catch (cause) {
      error = commandErrorMessage(cause);
      if (isRejectedConflict(operation.phase, cause)) {
        conflict = true;
        error = `${error} Wczytaj nowy podgląd usunięcia przed kolejną próbą.`;
      }
    }
  }
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ project_id: project.id, plan, pending }, null, 2),
      );
      error = "Skopiowano szczegóły usunięcia.";
    } catch {
      error =
        "Schowek jest niedostępny. Pozostaw to okno otwarte do rozstrzygnięcia polecenia usunięcia.";
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (busy || pending) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  onMount(() => {
    void loadPlan();
    const ended = () => {
      accessLost = true;
      error =
        "Sesja wygasła. Polecenie usunięcia zostało zachowane; połącz się ponownie przed kontynuowaniem.";
    };
    const restored = () => {
      accessLost = false;
    };
    const unsubscribe = subscribeSession({ ended, restored });
    return unsubscribe;
  });
</script>

<svelte:window onbeforeunload={beforeUnload} />

<dialog
  use:modal={{ onclose: close }}
  out:layerExit|global
  class="app-dialog project-deletion"
  aria-label="Usuń projekt"
>
  <DialogHeader
    title={`Usuń „${project.title}”?`}
    onclose={close}
    disabled={busy || !!pending}
    closeLabel="Zamknij usuwanie projektu"
  />
  <div class="dialog-body">
    <p>
      Spowoduje to trwałe usunięcie folderu projektu <code>.project</code> wraz z
      kartami, kamieniami milowymi i raportami. Pliki w innych częściach repozytorium
      zostaną zachowane. Przywrócenie nie jest możliwe.
    </p>
    {#if loading}<p role="status">Wczytywanie podglądu usunięcia…</p>{/if}
    {#if plan && !conflict}<section
        class="notice"
        aria-label="Podgląd usunięcia"
      >
        <strong>Podgląd usunięcia</strong>
        <p class="breadcrumb">{plan.display_path}</p>
        <p>{plan.file_count} plików · {bytes(plan.total_bytes)}</p>
      </section>{/if}
    {#if conflict}<section class="notice" role="alert">
        <p>Podgląd usunięcia jest już nieaktualny.</p>
        <button onclick={() => void loadPlan()} disabled={busy || !!pending}
          >Wczytaj nowy podgląd usunięcia</button
        >
      </section>{/if}
    {#if pending}<section class="notice" role="alert">
        <p>
          Usunięcie oczekuje na potwierdzenie. Zachowaj identyfikator żądania
          podczas sprawdzania wyniku.
        </p>
        <p>Żądanie: <code>{pending.requestId}</code></p>
        <button onclick={() => void copyDetails()} disabled={busy}
          >Kopiuj szczegóły usunięcia</button
        >
        <button onclick={() => void check()} disabled={busy || accessLost}
          >Sprawdź stan usunięcia</button
        ><button onclick={() => void retry()} disabled={busy || accessLost}
          >Ponów to samo usunięcie</button
        >
      </section>{/if}
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
  </div>
  <footer class="dialog-footer">
    <button onclick={close} disabled={busy || !!pending}
      >Zachowaj projekt</button
    >
    <Button
      variant="danger"
      onclick={() => void remove()}
      disabled={!plan || loading || busy || !!pending || accessLost || conflict}
      >Trwale usuń projekt</Button
    >
  </footer>
</dialog>

<style>
  .breadcrumb {
    color: var(--muted);
    font-size: var(--text-label);
  }
</style>
