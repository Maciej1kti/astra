<script lang="ts">
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import { api, ApiError, command, type Resource } from "../../lib/api/api";
  import { untrack } from "svelte";

  const operation = commandOperation(() => !accessLost);

  let {
    path,
    version,
    schedule,
    dependencies,
    title = "",
    onclose,
    onsaved,
  }: {
    path: string;
    version: string;
    schedule?: { start: string; end: string };
    dependencies?: string[];
    title?: string;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let start = $state(untrack(() => schedule?.start ?? ""));
  let end = $state(untrack(() => schedule?.end ?? ""));
  let pending = $derived(operation.pending);
  let error = $state("");
  let busy = $derived(operation.busy);
  let conflict = $state<Resource | null>(null);
  let accessLost = $state(false);
  onMount(() => {
    const lost = () => {
      accessLost = true;
      error =
        "Your session ended. Copy this proposal before closing and reconnecting.";
    };
    const restored = () => {
      accessLost = false;
    };
    const unsubscribeSession = subscribeSession({
      ended: lost,
      restored: restored,
    });

    return () => {
      unsubscribeSession();
    };
  });
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { path, version, schedule: { start, end }, dependencies, pending },
          null,
          2,
        ),
      );
      error = "Proposal copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy the proposal and request ID.";
    }
  }
  async function transmit() {
    if (!pending || accessLost || busy) return;
    error = "";
    try {
      await operation.commit();
      onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      if (
        operation.phase === "rejected" &&
        cause instanceof ApiError &&
        [409, 412].includes(cause.status)
      ) {
        try {
          conflict = await api<Resource>(path);
        } catch {
          error +=
            " The current resource is unavailable; your proposed dates remain here.";
        }
      }
    }
  }
  async function save() {
    if (accessLost) return;
    operation.prepare(
      command(
        path,
        "PATCH",
        {
          set: dependencies
            ? { depends_on: dependencies }
            : { schedule: { start, end } },
        },
        version,
      ),
    );
    await transmit();
  }
  async function status() {
    if (!pending || accessLost || busy) return;
    try {
      await operation.confirm();
      onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
</script>

<dialog
  class="app-dialog"
  use:modal
  aria-label={dependencies ? "Change dependencies" : "Change planned dates"}
  oncancel={(event) => {
    event.preventDefault();
    if (!busy && !pending) onclose();
  }}
>
  <h2>{dependencies ? "Change dependencies" : "Change planned dates"}</h2>
  {#if title}<p>{title}</p>{/if}
  <p>
    {dependencies
      ? "Finish-to-start: the successor starts after its predecessor finishes. Recorded dates remain unchanged."
      : "The deadline remains unchanged."}
  </p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    {#if !dependencies}<label
        >Planned start<input
          type="date"
          bind:value={start}
          required
          disabled={busy || !!pending || !!conflict || accessLost}
        /></label
      >
      <label
        >Planned end<input
          type="date"
          bind:value={end}
          min={start}
          required
          disabled={busy || !!pending || !!conflict || accessLost}
        /></label
      >
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if conflict && dependencies}<p>
        Current dependencies: {JSON.stringify(
          "depends_on" in conflict.metadata ? conflict.metadata.depends_on : [],
        )}. Your proposed connection is kept. Reopen the card to reconcile the
        changes.
      </p>
    {:else if conflict}<p>
        Current saved schedule: {JSON.stringify(
          conflict.metadata.schedule ?? null,
        )}. Your proposed dates remain above. Reopen the card to start a new
        edit.
      </p>{/if}
    {#if pending}<p>Request: {pending.requestId}</p>
      <button type="button" onclick={status} disabled={busy}
        >Check status</button
      ><button type="button" onclick={transmit} disabled={busy}
        >Retry same command</button
      >{/if}
    <button type="button" onclick={copyDraft}>Copy draft</button>
    {#if accessLost && pending}<details>
        <summary>Close without resolving</summary>
        <p>
          Copy the request ID and proposal first. The operation may already have
          committed.
        </p>
        <button type="button" onclick={onclose}>Discard this proposal</button>
      </details>{/if}
    <footer>
      <button type="button" onclick={onclose} disabled={busy || !!pending}
        >Cancel</button
      ><button
        type="submit"
        disabled={busy || !!pending || !!conflict || accessLost}
        >{dependencies ? "Save dependencies" : "Save planned dates"}</button
      >
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(440px, calc(100vw - 32px));
    max-height: 90dvh;
    overflow: auto;
  }
  label {
    display: grid;
    gap: 8px;
    margin: 16px 0;
  }
  input {
    min-height: 44px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
  }
</style>
