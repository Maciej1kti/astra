<script lang="ts">
  import type { Pending, Resource } from "../../lib/api/api";
  import CommandRecovery from "../../lib/ui/CommandRecovery.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import type { CardDeletion } from "./card-deletion.svelte";
  import type { AutosaveState } from "./editor-autosave.ts";
  import { sourceFields } from "./source-fields";

  /**
   * The editor's feedback row: field and command errors, conflict details,
   * recovery controls and the discard/delete confirmations. The editor keeps
   * every decision; this component only presents its state.
   */
  let {
    creating,
    fieldMessages,
    accessLost,
    error,
    autosaveError,
    autosaves,
    autosaveState,
    conflict,
    pending,
    busy,
    dirty,
    discard,
    copyMessage,
    statusMessage,
    title,
    deletion,
    oncheck,
    onretry,
    onautosavecheck,
    onautosaveretry,
    oncopy,
    oncopycurrent,
    ondiscard,
    onkeepediting,
  }: {
    creating: boolean;
    fieldMessages: string[];
    accessLost: boolean;
    error: string;
    autosaveError: string;
    /** Cards and projects save by themselves; records submit explicitly. */
    autosaves: boolean;
    autosaveState: AutosaveState;
    conflict: { current: Resource | null } | null;
    pending: Pending | null;
    busy: boolean;
    dirty: boolean;
    discard: boolean;
    copyMessage: string;
    statusMessage: string;
    title: string;
    deletion: CardDeletion;
    oncheck: () => void;
    onretry: () => void;
    onautosavecheck: () => void;
    onautosaveretry: () => void;
    oncopy: () => void;
    oncopycurrent: () => void;
    ondiscard: () => void;
    /** Reports whether focus was inside the confirmation that disappears. */
    onkeepediting: (focused: boolean) => void;
  } = $props();

  const autosaveBusy = $derived(
    autosaveState.phase === "submitting" || autosaveState.phase === "checking",
  );
  const autosaveWork = $derived(
    !!autosaveState.pending || autosaveState.queued,
  );
  let notice = $state<HTMLDivElement>();
  let deleteNotice = $state<HTMLDivElement>();
  let discardGroup = $state<HTMLDivElement>();
  $effect(() => {
    if (error) notice?.scrollIntoView({ block: "center" });
  });
  $effect(() => {
    if (!deletion.error || !deleteNotice) return;
    queueMicrotask(() => {
      /* eslint-disable @typescript-eslint/no-unnecessary-condition -- the notice can be removed before this microtask runs */
      deleteNotice?.scrollIntoView({ block: "center", inline: "nearest" });
      deleteNotice?.focus({ preventScroll: true });
      /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    });
  });
  function focusDeleteAction(node: HTMLButtonElement) {
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "center", inline: "nearest" });
  }
</script>

{#if creating}<p role="status">Tworzenie karty…</p>{/if}
{#if fieldMessages.length}
  <div class="notice" role="alert">
    {#each fieldMessages as message}<p>
        {message}
      </p>{/each}
  </div>
{/if}
<SessionNotice
  lost={accessLost}
  message="Sesja wygasła. Wersja robocza została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
/>
{#if error}<div bind:this={notice} class="notice" role="alert">
    {error}
  </div>{/if}
{#if autosaves && autosaveError}<div class="notice" role="alert">
    {autosaveError}
  </div>{/if}
{#if deletion.error}<div
    bind:this={deleteNotice}
    class="notice"
    role="alert"
    tabindex="-1"
  >
    <p>{deletion.error}</p>
  </div>{/if}
{#if conflict}
  {#if conflict.current}<details class="conflict-current">
      <summary>Aktualna zapisana wersja</summary>
      <dl>
        {#each sourceFields(conflict.current) as field (field.name)}<div>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>{/each}
      </dl>
      <button type="button" onclick={oncopycurrent}
        >Kopiuj aktualną wersję</button
      >
    </details>
  {:else}<p>
      Aktualna zapisana wersja jest niedostępna. Wersja robocza została
      zachowana w edytorze.
    </p>{/if}
  <p>
    Zamknij i otwórz ponownie, aby edytować aktualną wersję. Najpierw skopiuj
    zmiany, które chcesz zachować.
  </p>{/if}
<CommandRecovery {pending} {busy} {accessLost} {oncheck} {onretry} />
{#if (dirty || pending || deletion.pending || autosaveState.pending) && (!autosaves || discard || accessLost || !!error || !!autosaveError || !!conflict || !!pending || !!deletion.pending)}<button
    type="button"
    onclick={oncopy}>Kopiuj wersję roboczą</button
  >{/if}
{#if copyMessage}<p class="action-status" role="status">
    {copyMessage}
  </p>{/if}
{#if autosaves && (autosaveState.phase === "uncertain" || autosaveState.phase === "conflict")}
  <CommandRecovery
    pending={autosaveState.pending}
    {accessLost}
    label="Żądanie automatycznego zapisu"
    oncheck={autosaveState.phase === "uncertain" ? onautosavecheck : undefined}
    onretry={autosaveState.phase === "uncertain" ? onautosaveretry : undefined}
  />
{/if}
<CommandRecovery
  pending={deletion.pending}
  busy={deletion.busy}
  {accessLost}
  label="Żądanie usunięcia"
  checkLabel="Sprawdź stan usunięcia"
  retryLabel="Ponów to samo usunięcie"
  oncheck={() => void deletion.check()}
  onretry={() => void deletion.retry()}
/>
{#if discard}<div
    bind:this={discardGroup}
    class="notice"
    role="group"
    aria-labelledby="discard-draft-question"
  >
    <!-- Only the question is announced; the choices stay ordinary buttons. -->
    <p id="discard-draft-question" role="alert">
      {pending || deletion.pending || autosaveWork
        ? "Wynik polecenia może nadal być nieznany. Zachowaj identyfikator żądania przed zamknięciem."
        : "Odrzucić niezapisaną wersję roboczą?"}
    </p>
    <button
      type="button"
      onclick={ondiscard}
      disabled={busy || deletion.busy || autosaveBusy}
      >Odrzuć wersję roboczą</button
    ><button
      type="button"
      onclick={() =>
        // The buttons disappear with the confirmation; the editor returns focus.
        onkeepediting(!!discardGroup?.contains(document.activeElement))}
      >Kontynuuj edycję</button
    >
  </div>{/if}
{#if deletion.confirmation}<div
    class="notice delete-confirmation"
    role="alertdialog"
    aria-labelledby="delete-card-heading"
    aria-describedby="delete-card-description"
  >
    <h3 id="delete-card-heading">
      {deletion.confirmation === "drafts"
        ? "Odrzucić wersje robocze przed usunięciem?"
        : "Trwale usunąć kartę?"}
    </h3>
    <p id="delete-card-description">
      {#if deletion.confirmation === "drafts"}
        Niezapisane wersje robocze karty lub raportu zostaną odrzucone przed
        trwałym usunięciem karty „{title}”.
      {:else}
        Trwale usunąć kartę „{title}”? Spowoduje to usunięcie pliku źródłowego i
        nie można tego cofnąć.
      {/if}
    </p>
    <div class="row">
      {#if deletion.confirmation === "drafts"}<button
          type="button"
          class="primary"
          onclick={deletion.proceed}
          use:focusDeleteAction
          disabled={deletion.busy}>Odrzuć wersje robocze i kontynuuj</button
        >{:else}<button
          type="button"
          class="danger"
          onclick={() => void deletion.confirm()}
          use:focusDeleteAction
          disabled={deletion.busy || accessLost}>Trwale usuń kartę</button
        >{/if}
      <button type="button" onclick={deletion.cancel} disabled={deletion.busy}
        >Kontynuuj edycję</button
      >
    </div>
  </div>{/if}
{#if statusMessage && statusMessage !== "Zapisano" && !error && !autosaveError && !deletion.error && !conflict && !pending && !deletion.pending && !discard && !deletion.confirmation}<p
    class="action-status"
    role="status"
  >
    {statusMessage}
  </p>{/if}
