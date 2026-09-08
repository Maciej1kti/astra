<script lang="ts">
  import type {
    RegistrationPlan as Plan,
    NativeFolderSelection as Selection,
    NativeFolderInput,
  } from "../../lib/contracts/api.generated";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import {
    api,
    command,
    isDefinitiveRejection,
    ApiError,
  } from "../../lib/api/api";

  const operation = commandOperation(() => !accessLost);

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
  let plan = $state<Plan | null>(null);
  let choosing = $state(false);
  let busy = $state(false);
  let accessLost = $state(false);
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
        "The system folder dialog is unavailable. Run the host in your desktop session and check that a file chooser portal or Zenity is installed.",
      NATIVE_FOLDER_PICKER_TIMEOUT:
        "Folder selection timed out. Choose a folder again.",
      NATIVE_FOLDER_PICKER_FAILED:
        "The system folder dialog could not open. Check the host desktop and try again.",
      FOLDER_PICKER_BUSY:
        "A folder dialog is already open on the host. Finish or cancel it first.",
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
          ? "Folder selection cancelled. No project files were changed."
          : explain(result.error ?? "Folder selection failed.");
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
      error = e instanceof Error ? e.message : String(e);
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
      error = e instanceof Error ? e.message : String(e);
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
          error =
            "Registration outcome is unknown. Retry the same registration.";
          return;
        }
      }
      const result = await api<{ state: string }>(`/api/v1/jobs/${job}`);
      if (result.state !== "done") {
        error = `Registration is ${result.state}. Check its outcome before starting another request.`;
        return;
      }
      if (operation.phase === "accepted") operation.finishJob();
      onadded(plan.project_id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (!job && operation.phase === "rejected") {
        plan = null;
      }
    } finally {
      busy = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ selection, plan, pending, job }, null, 2),
      );
      error = "Registration details copied.";
    } catch {
      error =
        "Clipboard is unavailable. Copy the visible request ID before closing.";
    }
  }
  onMount(() => {
    const ended = () => {
      accessLost = true;
      choosing = false;
      clearTimeout(timer);
      error =
        "Your session ended. Registration details are preserved; reconnect before continuing.";
    };
    const restored = () => {
      accessLost = false;
    };
    const unsubscribeSession = subscribeSession({
      ended: ended,
      restored: restored,
    });

    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribeSession();
    };
  });
</script>

<dialog
  class="app-dialog"
  use:modal
  aria-label="Add project"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <header>
    <h2>Add a project</h2>
    <button onclick={close} disabled={busy} aria-label="Close add project"
      >✕</button
    >
  </header>
  <p>
    Choose your repository using the host's system folder dialog. The folder can
    be anywhere on the host.
  </p>
  <label
    >Project name <input
      bind:value={name}
      placeholder="Use folder name"
      disabled={choosing || busy || !!selection || !!pending || !!plan}
    /></label
  >
  <label class="check"
    ><input
      type="checkbox"
      bind:checked={tracked}
      disabled={choosing || busy || !!selection || !!pending || !!plan}
    /> Track .project files in Git</label
  >
  <button
    class="primary"
    onclick={choose}
    disabled={choosing || busy || !!pending || accessLost}
    >{choosing
      ? "Choose a folder in the system window…"
      : selection
        ? "Check folder selection"
        : plan
          ? "Choose a different folder…"
          : "Choose folder…"}</button
  >
  {#if choosing}<p role="status">
      The system window opens on the computer running Local Projects. Select a
      folder or press Cancel there.
    </p>{/if}
  {#if plan}<section class="notice">
      <strong>Selected repository</strong>
      <p>{plan.display_path}</p>
      <p>
        Adding creates .project planning files and a managed AGENTS.md block.
        Existing content is preserved.
      </p>
      {#each plan.warnings as warning}<p>{warning.message}</p>{/each}
      <details>
        <summary>Files to update</summary
        >{#each plan.changes.filter((c) => c.action !== "no_change") as change}<p
          >
            {change.path}
          </p>{/each}
      </details>
      <button class="primary" onclick={add} disabled={busy || accessLost}
        >{job
          ? "Check registration"
          : pending
            ? "Retry same registration"
            : "Add project"}</button
      >
    </section>{/if}
  {#if pending}<p>Request: {pending.requestId}</p>
    <button onclick={copy}>Copy registration details</button>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if confirmClose}<section class="notice" role="alert">
      <p>
        Closing does not cancel an uncertain registration. Copy its request
        details first.
      </p>
      <button onclick={() => (confirmClose = false)}>Keep open</button><button
        onclick={onclose}>Close registration</button
      >
    </section>{/if}
  <details>
    <summary>Remote host without a desktop?</summary>
    <p>
      You can browse directories explicitly approved by the host owner instead.
    </p>
    <button onclick={onbrowse} disabled={choosing || busy || !!pending}
      >Browse approved folders</button
    >
  </details>
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 24px));
    max-height: 90dvh;
    overflow: auto;
    border-radius: 14px;
    padding: 24px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  label {
    display: block;
    margin: 16px 0;
  }
  label:not(.check) input {
    width: 100%;
    margin-top: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  p {
    overflow-wrap: anywhere;
    line-height: 1.5;
  }
  details {
    margin-top: 20px;
  }
</style>
