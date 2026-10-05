<script lang="ts">
  import type { TimedEvent } from "../../lib/contracts/domain.generated";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { eventEnd } from "../../lib/resources/timed-event.ts";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import CommandRecovery from "../../lib/ui/CommandRecovery.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import {
    commandOperation,
    sessionAccess,
  } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import { onMount } from "svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api, command, type Resource } from "../../lib/api/api";
  import { untrack } from "svelte";

  const access = sessionAccess();
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);

  let {
    path,
    version,
    schedule,
    event,
    title = "",
    autoCommit = false,
    onclose,
    onsaved,
  }: {
    path: string;
    version: string;
    schedule?: { start: string; end: string };
    event?: TimedEvent;
    title?: string;
    autoCommit?: boolean;
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
    event ? "Zmień godzinę wydarzenia" : "Zmień zaplanowane daty",
  );
  const proposal = () =>
    event
      ? { event: { start: `${start}T${time}`, duration_minutes: duration } }
      : { schedule: { start, end } };
  let pending = $derived(operation.pending);
  let error = $state("");
  let info = $state("");
  let busy = $derived(operation.busy);
  let conflict = $state<{ current: Resource | null } | null>(null);
  function close() {
    if (!busy && !pending) onclose();
  }
  onMount(() => {
    if (autoCommit) void save();
  });
  async function copyDraft() {
    info = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ path, version, ...proposal(), pending }, null, 2),
      );
      info = "Skopiowano propozycję.";
    } catch {
      error =
        "Schowek jest niedostępny. Zaznacz i skopiuj propozycję oraz identyfikator żądania.";
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
    info = "";
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
            "Aktualny element jest niedostępny; proponowane daty pozostają tutaj.";
        }
      }
    }
  }
  async function save() {
    if (accessLost || busy || pending || conflict) return;
    try {
      if (event) eventEnd(proposal().event!);
    } catch (cause) {
      error = errorMessage(cause);
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

{#if autoCommit && !error && !accessLost}<p
    role="status"
    class="planning-save-status"
  >
    Zapisywanie zaplanowanych dat…
  </p>{/if}

{#if !autoCommit || error || accessLost}
  <dialog
    class="app-dialog dialog-small"
    use:modal={{ onclose: close }}
    out:layerExit|global
    aria-label={heading}
  >
    <DialogHeader
      title={heading}
      onclose={close}
      disabled={busy || !!pending}
      closeLabel="Zamknij zaplanowane daty"
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
            >Zaplanowany początek<input
              type="date"
              bind:value={start}
              required
              disabled={busy || !!pending || !!conflict || accessLost}
            /></label
          >
          {#if event}
            <label
              >Godzina rozpoczęcia<input
                type="time"
                bind:value={time}
                required
                disabled={busy || !!pending || !!conflict || accessLost}
              /></label
            >
            <label
              >Czas trwania (minuty)<input
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
              >Zaplanowany koniec<input
                type="date"
                bind:value={end}
                min={start}
                required
                disabled={busy || !!pending || !!conflict || accessLost}
              /></label
            >
          {/if}
        </div>
        <SessionNotice
          lost={accessLost}
          message="Sesja wygasła. Ta propozycja została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
        />
        {#if error}<p role="alert">{error}</p>{/if}
        {#if info}<p role="status">{info}</p>{/if}
        {#if conflict?.current}<p>
            Aktualny zapisany harmonogram: {JSON.stringify(
              conflict.current.type === "card"
                ? (conflict.current.metadata.event ??
                    conflict.current.metadata.schedule ??
                    null)
                : null,
            )}. Proponowane daty pozostają powyżej. Otwórz kartę ponownie, aby
            rozpocząć nową edycję.
          </p>{/if}
        <CommandRecovery
          {pending}
          {busy}
          {accessLost}
          oncheck={status}
          onretry={transmit}
        />
        {#if error || pending || accessLost}<button
            type="button"
            onclick={copyDraft}>Kopiuj wersję roboczą</button
          >{/if}
        {#if accessLost && pending}<details>
            <summary>Zamknij bez rozstrzygnięcia</summary>
            <p>
              Najpierw skopiuj identyfikator żądania i propozycję. Operacja
              mogła już zostać zapisana.
            </p>
            <button type="button" onclick={onclose}>Odrzuć tę propozycję</button
            >
          </details>{/if}
      </div>
      <footer class="dialog-footer">
        <button type="button" onclick={close} disabled={busy || !!pending}
          >Anuluj</button
        ><Button
          variant="primary"
          type="submit"
          disabled={busy || !!pending || !!conflict || accessLost}
          >{event
            ? "Zapisz godzinę wydarzenia"
            : "Zapisz zaplanowane daty"}</Button
        >
      </footer>
    </form>
  </dialog>
{/if}

<style>
  .planning-save-status {
    position: fixed;
    inset: auto var(--space-10) var(--space-10) auto;
    z-index: var(--layer-floating);
    padding: var(--space-4) var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--paper);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
  }

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
