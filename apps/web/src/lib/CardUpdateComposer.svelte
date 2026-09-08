<script lang="ts">
  import {
    commandStatus,
    isDefinitiveRejection,
    command,
    send,
    type Pending,
  } from "./api";
  import { resourceLabel } from "./resource-presentation";
  import {
    cardUpdatePayload,
    hasCardUpdateDraft,
    newCardUpdateDraft,
    type CardUpdateDraft,
  } from "./card-update";

  let {
    project,
    cardId,
    draft = $bindable(newCardUpdateDraft()),
    pending = $bindable<Pending | null>(null),
    busy = $bindable(false),
    disabled = false,
    onposted,
  }: {
    project: string;
    cardId: string;
    draft?: CardUpdateDraft;
    pending?: Pending | null;
    busy?: boolean;
    disabled?: boolean;
    onposted: () => void;
  } = $props();
  let opened = $state(false),
    discard = $state(false),
    error = $state(""),
    message = $state("");
  const locked = $derived(disabled || busy || !!pending);
  const dirty = $derived(hasCardUpdateDraft(draft));

  async function post() {
    if (locked) return;
    error = "";
    message = "";
    try {
      pending = command(
        `/api/v1/projects/${project}/updates`,
        "POST",
        cardUpdatePayload(cardId, draft),
      );
      await transmit();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function completed() {
    pending = null;
    draft = newCardUpdateDraft();
    opened = false;
    discard = false;
    error = "";
    message = "Update recorded for this card. Your card draft is preserved.";
    onposted();
  }

  async function transmit() {
    if (!pending || busy || disabled) return;
    busy = true;
    error = "";
    try {
      const result = await send(pending);
      if (result.state)
        error = `Update command is ${result.state}. Check its status before retrying.`;
      else completed();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      if (isDefinitiveRejection(cause)) pending = null;
    } finally {
      busy = false;
    }
  }

  async function resolve() {
    if (!pending || busy || disabled) return;
    busy = true;
    error = "";
    try {
      const result = await commandStatus(pending);
      if (result.state === "committed") completed();
      else
        error = `Update command status: ${result.state}. Your update draft and request identity are preserved.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function cancel() {
    if (locked) return;
    if (dirty) discard = true;
    else opened = false;
  }
</script>

<section class="card-update" aria-label="Add an update to this card">
  <div class="heading">
    <h3>Record progress</h3>
    {#if !opened}<button
        type="button"
        disabled={disabled || busy}
        onclick={() => {
          opened = true;
          message = "";
        }}>Add card update</button
      >{/if}
  </div>
  {#if !opened}<p class="hint">
      Record a result, blocker or decision in this card's activity.
    </p>{/if}
  {#if message}<p role="status" class="message">{message}</p>{/if}
  {#if opened}
    <p class="hint">
      This update is saved separately. Your unsaved card changes stay in the
      inspector.
    </p>
    <label
      >Update kind<select
        aria-label="Update kind"
        bind:value={draft.kind}
        disabled={locked}
        >{#each ["result", "blocker", "decision_needed", "note"] as kind}<option
            value={kind}>{resourceLabel(kind)}</option
          >{/each}</select
      ></label
    >
    <label
      >Update summary<input
        bind:value={draft.summary}
        disabled={locked}
        onkeydown={(event) => {
          if (event.key === "Enter" && !event.isComposing)
            event.preventDefault();
        }}
      /></label
    >
    <label
      >Update details <span>Markdown</span><textarea
        bind:value={draft.body}
        rows="4"
        disabled={locked}></textarea></label
    >
    <label
      >Update author<input
        bind:value={draft.author}
        disabled={locked}
        onkeydown={(event) => {
          if (event.key === "Enter" && !event.isComposing)
            event.preventDefault();
        }}
      /></label
    >
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    {#if pending}
      <p class="hint">Update request <code>{pending.requestId}</code></p>
      <div class="actions">
        <button type="button" disabled={disabled || busy} onclick={resolve}
          >Check update status</button
        ><button type="button" disabled={disabled || busy} onclick={transmit}
          >Retry same update</button
        >
      </div>
    {/if}
    {#if discard}<div class="discard" role="alert">
        <p>Discard this update draft?</p>
        <div class="actions">
          <button
            type="button"
            disabled={locked}
            onclick={() => {
              draft = newCardUpdateDraft();
              discard = false;
              opened = false;
              error = "";
            }}>Discard update draft</button
          ><button
            type="button"
            disabled={locked}
            onclick={() => (discard = false)}>Keep update</button
          >
        </div>
      </div>{/if}
    <div class="actions">
      <button
        type="button"
        disabled={locked || !draft.summary.trim()}
        onclick={post}>{busy ? "Recording…" : "Post card update"}</button
      ><button type="button" disabled={locked} onclick={cancel}
        >Cancel update</button
      >
    </div>
    <p class="hint">
      Updates are append-only. Posting a result does not change the card's
      status.
    </p>
  {/if}
</section>

<style>
  .card-update {
    margin: 24px 0;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
  }
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
  }
  label {
    display: block;
    margin: 12px 0;
    font-size: 13px;
    font-weight: 600;
  }
  label span,
  .hint {
    color: var(--muted);
    font-weight: 400;
  }
  .hint {
    font-size: 12px;
    line-height: 1.5;
  }
  input,
  select,
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
  }
  textarea {
    font-family: inherit;
    line-height: 1.5;
    resize: vertical;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .error,
  .message,
  .discard {
    padding: 10px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .error,
  .discard {
    background: var(--notice-bg);
    color: var(--notice-ink);
    border: 1px solid var(--notice-line);
  }
  .message {
    background: var(--paper);
  }
  code {
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  @media (max-width: 520px) {
    .card-update {
      padding: 12px;
    }
    .heading {
      align-items: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
