<script lang="ts">
  import { onMount } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    ApiError,
    type Pending,
    type Resource,
  } from "./api";
  import { untrack } from "svelte";
  let {
    path,
    version,
    schedule,
    onclose,
    onsaved,
  }: {
    path: string;
    version: string;
    schedule: { start: string; end: string };
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let start = $state(untrack(() => schedule.start)),
    end = $state(untrack(() => schedule.end));
  let pending = $state<Pending | null>(null),
    error = $state(""),
    busy = $state(false),
    conflict = $state<Resource | null>(null);
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
    window.addEventListener("session-ended", lost);
    window.addEventListener("session-restored", restored);
    return () => {
      window.removeEventListener("session-ended", lost);
      window.removeEventListener("session-restored", restored);
    };
  });
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { path, version, schedule: { start, end }, pending },
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
    if (!pending || accessLost) return;
    busy = true;
    error = "";
    try {
      const result = await send(pending);
      if (result.state) {
        error = `Command is ${result.state}. Check its status before retrying.`;
        return;
      }
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (
        e instanceof ApiError &&
        e.status < 500 &&
        ![401, 403, 429].includes(e.status)
      ) {
        pending = null;
        if ([409, 412].includes(e.status)) {
          try {
            conflict = await api<Resource>(path);
          } catch {
            error +=
              " The current resource is unavailable; your proposed dates remain here.";
          }
        }
      }
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (accessLost) return;
    pending = command(
      path,
      "PATCH",
      { set: { schedule: { start, end } } },
      version,
    );
    await transmit();
  }
  async function status() {
    if (!pending || accessLost) return;
    busy = true;
    try {
      const reply = await api<{ state: string }>(
        `/api/v1/commands/${pending.requestId}`,
      );
      if (reply.state === "committed") onsaved();
      else error = `Command state: ${reply.state}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  use:modal
  aria-label="Change planned dates"
  oncancel={(event) => {
    event.preventDefault();
    if (!busy && !pending) onclose();
  }}
>
  <h2>Change planned dates</h2>
  <p>The deadline remains unchanged.</p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <label
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
    {#if error}<p role="alert">{error}</p>{/if}
    {#if conflict}<p>
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
        >Save planned dates</button
      >
    </footer>
  </form>
</dialog>

<style>
  dialog {
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    width: min(440px, calc(100vw - 32px));
    max-height: 90dvh;
    overflow: auto;
  }
  dialog::backdrop {
    background: #152d2860;
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
