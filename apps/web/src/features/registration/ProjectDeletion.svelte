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
  import { modal } from "../../lib/ui/dialog";
  import { ApiError } from "../../lib/api/api";

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
    if (value < 1024) return `${value} bytes`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
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
      error =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : String(cause);
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
        error = `${error} Load a new deletion preview before trying again.`;
      }
    }
  }
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ project_id: project.id, plan, pending }, null, 2),
      );
      error = "Deletion details copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Keep this dialog open until the deletion command is resolved.";
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
        "Your session ended. The deletion command is preserved; reconnect before continuing.";
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
  use:modal
  class="app-dialog project-deletion"
  aria-label="Delete project"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <DialogHeader
    title={`Delete “${project.title}”?`}
    onclose={close}
    disabled={busy || !!pending}
    closeLabel="Close delete project"
  />
  <div class="dialog-body">
    <p>
      This permanently deletes the project’s <code>.project</code> folder, including
      its cards, milestones and reports. Files elsewhere in the repository are preserved.
      There is no restore.
    </p>
    {#if loading}<p role="status">Reading the deletion preview…</p>{/if}
    {#if plan && !conflict}<section
        class="notice"
        aria-label="Deletion preview"
      >
        <strong>Deletion preview</strong>
        <p class="breadcrumb">{plan.display_path}</p>
        <p>{plan.file_count} files · {bytes(plan.total_bytes)}</p>
      </section>{/if}
    {#if conflict}<section class="notice" role="alert">
        <p>The deletion preview is no longer current.</p>
        <button onclick={() => void loadPlan()} disabled={busy || !!pending}
          >Load a new deletion preview</button
        >
      </section>{/if}
    {#if pending}<section class="notice" role="alert">
        <p>
          Deletion is awaiting confirmation. Keep this request ID while checking
          its result.
        </p>
        <p>Request: <code>{pending.requestId}</code></p>
        <button onclick={() => void copyDetails()} disabled={busy}
          >Copy deletion details</button
        >
        <button onclick={() => void check()} disabled={busy || accessLost}
          >Check deletion status</button
        ><button onclick={() => void retry()} disabled={busy || accessLost}
          >Retry same deletion</button
        >
      </section>{/if}
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
  </div>
  <footer class="dialog-footer">
    <button onclick={close} disabled={busy || !!pending}>Keep project</button>
    <Button
      variant="danger"
      onclick={() => void remove()}
      disabled={!plan || loading || busy || !!pending || accessLost || conflict}
      >Permanently delete project</Button
    >
  </footer>
</dialog>

<style>
  .breadcrumb {
    color: var(--muted);
    font-size: var(--text-label);
  }
</style>
