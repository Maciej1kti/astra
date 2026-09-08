<script lang="ts">
  import { onMount } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    isDefinitiveRejection,
    ApiError,
    type Pending,
  } from "./api";
  let {
    onclose,
    onadded,
    onbrowse,
  }: {
    onclose: () => void;
    onadded: (id: string) => void;
    onbrowse: () => void;
  } = $props();
  type Plan = {
    plan_id: string;
    project_id: string;
    display_path: string;
    changes: { path: string; action: string }[];
    warnings: { message: string }[];
  };
  type Selection = {
    selection_id: string;
    state: "pending" | "selected" | "cancelled" | "failed";
    plan: Plan | null;
    error: string | null;
  };
  let name = $state(""),
    tracked = $state(false),
    error = $state(""),
    plan = $state<Plan | null>(null);
  let choosing = $state(false),
    busy = $state(false),
    accessLost = $state(false),
    pending = $state<Pending | null>(null),
    job = $state<string | null>(null);
  let selection = $state<{
    selection_id: string;
    git_mode: string;
    name?: string;
  } | null>(null);
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
        pending ??= command("/api/v1/registrations", "POST", {
          plan_id: plan.plan_id,
        });
        const result = await send(pending);
        job = result.job_id ?? null;
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
      pending = null;
      onadded(plan.project_id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (!job && isDefinitiveRejection(e)) {
        pending = null;
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
    window.addEventListener("session-ended", ended);
    window.addEventListener("session-restored", restored);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("session-ended", ended);
      window.removeEventListener("session-restored", restored);
    };
  });
</script>

<dialog
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
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 24px;
  }
  dialog::backdrop {
    background: #152d2860;
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
