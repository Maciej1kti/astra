<script lang="ts">
  import type { TimedEvent } from "../../lib/contracts/domain.generated";
  import { eventEnd } from "../../lib/resources/timed-event.ts";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import { onMount } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import { api, command, type Resource } from "../../lib/api/api";
  import { untrack } from "svelte";

  const operation = commandOperation(() => !accessLost);

  let {
    path,
    version,
    schedule,
    event,
    title = "",
    onclose,
    onsaved,
  }: {
    path: string;
    version: string;
    schedule?: { start: string; end: string };
    event?: TimedEvent;
    title?: string;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  let start = $state(
    untrack(() => event?.start.slice(0, 10) ?? schedule?.start ?? ""),
  );
  let end = $state(untrack(() => schedule?.end ?? ""));
  let time = $state(untrack(() => event?.start.slice(11) ?? ""));
  let duration = $state(untrack(() => event?.duration_minutes ?? 60));
  const heading = $derived(
    event ? "Change event time" : "Change planned dates",
  );
  const proposal = () =>
    event
      ? { event: { start: `${start}T${time}`, duration_minutes: duration } }
      : { schedule: { start, end } };
  let pending = $derived(operation.pending);
  let error = $state("");
  let busy = $derived(operation.busy);
  let conflict = $state<{ current: Resource | null } | null>(null);
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
        JSON.stringify({ path, version, ...proposal(), pending }, null, 2),
      );
      error = "Proposal copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy the proposal and request ID.";
    }
  }
  async function transmit() {
    await runCommand("submit");
  }
  async function status() {
    await runCommand("status");
  }
  async function runCommand(action: "submit" | "status") {
    if (!pending || accessLost || busy) return;
    error = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      onsaved();
    } catch (cause) {
      error = commandErrorMessage(cause);
      if (isRejectedConflict(operation.phase, cause)) {
        conflict = { current: null };
        try {
          conflict = { current: await api<Resource>(path) };
        } catch {
          error +=
            " The current resource is unavailable; your proposed dates remain here.";
        }
      }
    }
  }
  async function save() {
    if (accessLost || busy || pending || conflict) return;
    try {
      if (event) eventEnd(proposal().event!);
    } catch (cause) {
      error = String(cause);
      return;
    }
    operation.prepare(
      command(
        path,
        "PATCH",
        {
          set: proposal(),
        },
        version,
      ),
    );
    await transmit();
  }
</script>

<dialog
  class="app-dialog dialog-small"
  use:modal
  aria-label={heading}
  oncancel={(event) => {
    event.preventDefault();
    if (!busy && !pending) onclose();
  }}
>
  <DialogHeader
    title={heading}
    {onclose}
    disabled={busy || !!pending}
    closeLabel="Close planned dates"
  />
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <div class="dialog-body">
      {#if title}<p>{title}</p>{/if}
      <div class="date-fields">
        <label
          >Planned start<input
            type="date"
            bind:value={start}
            required
            disabled={busy || !!pending || !!conflict || accessLost}
          /></label
        >
        {#if event}
          <label
            >Start time<input
              type="time"
              bind:value={time}
              required
              disabled={busy || !!pending || !!conflict || accessLost}
            /></label
          >
          <label
            >Duration (minutes)<input
              type="number"
              min="1"
              max="10080"
              step="1"
              bind:value={duration}
              required
              disabled={busy || !!pending || !!conflict || accessLost}
            /></label
          >
        {:else}
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
      </div>
      {#if error}<p role="alert">{error}</p>{/if}
      {#if conflict?.current}<p>
          Current saved schedule: {JSON.stringify(
            conflict.current.type === "card"
              ? (conflict.current.metadata.event ??
                  conflict.current.metadata.schedule ??
                  null)
              : null,
          )}. Your proposed dates remain above. Reopen the card to start a new
          edit.
        </p>{/if}
      {#if pending}<p>Request: {pending.requestId}</p>
        <button type="button" onclick={status} disabled={busy}
          >Check status</button
        ><button type="button" onclick={transmit} disabled={busy}
          >Retry same command</button
        >{/if}
      {#if error || pending || accessLost}<button
          type="button"
          onclick={copyDraft}>Copy draft</button
        >{/if}
      {#if accessLost && pending}<details>
          <summary>Close without resolving</summary>
          <p>
            Copy the request ID and proposal first. The operation may already
            have committed.
          </p>
          <button type="button" onclick={onclose}>Discard this proposal</button>
        </details>{/if}
    </div>
    <footer class="dialog-footer">
      <button type="button" onclick={onclose} disabled={busy || !!pending}
        >Cancel</button
      ><Button
        variant="primary"
        type="submit"
        disabled={busy || !!pending || !!conflict || accessLost}
        >{event ? "Save event time" : "Save planned dates"}</Button
      >
    </footer>
  </form>
</dialog>

<style>
  label {
    display: grid;
    gap: var(--space-4);
    margin: var(--space-8) 0;
    min-width: 0;
  }
  .date-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-6);
  }
  input {
    width: 100%;
  }
  @media (max-width: 360px) {
    .date-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
