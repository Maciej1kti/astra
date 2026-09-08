<script lang="ts">
  import { onMount, tick } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    isDefinitiveRejection,
    type Pending,
    type Summary,
  } from "./api";
  let {
    cards,
    onclose,
    onsaved,
  }: { cards: Summary[]; onclose: () => void; onsaved: () => void } = $props();
  type Item = { project_id: string; card_id: string };
  let items = $state<Item[]>([]),
    version = $state(""),
    original = $state(""),
    error = $state(""),
    info = $state("");
  let pending = $state<Pending | null>(null),
    busy = $state(false),
    loading = $state(true),
    accessLost = $state(false),
    discard = $state(false),
    conflict = $state(false);
  let generation = 0;
  let dialog: HTMLDialogElement;
  let closeTrigger: HTMLElement | null = null;
  let dirty = $derived(!!version && JSON.stringify(items) !== original);
  async function load() {
    if (dirty || pending) return;
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const data = await api<{ items: Item[]; version: string }>(
        "/api/v1/workspace/focus",
      );
      if (generation !== current) return;
      items = data.items;
      version = data.version;
      original = JSON.stringify(items);
    } catch (e) {
      if (generation === current)
        error = e instanceof Error ? e.message : String(e);
    } finally {
      if (generation === current) loading = false;
    }
  }
  onMount(() => {
    void load();
    const lost = () => {
      generation++;
      accessLost = true;
      loading = false;
      error =
        "Your session ended. Copy your focus order before closing and reconnecting.";
    };
    const restored = () => {
      accessLost = false;
    };
    const leaving = (e: BeforeUnloadEvent) => {
      if (dirty || pending) e.preventDefault();
    };
    window.addEventListener("session-ended", lost);
    window.addEventListener("session-restored", restored);
    window.addEventListener("beforeunload", leaving);
    return () => {
      generation++;
      window.removeEventListener("session-ended", lost);
      window.removeEventListener("session-restored", restored);
      window.removeEventListener("beforeunload", leaving);
    };
  });
  function title(item: Item) {
    return (
      cards.find(
        (c) => c.id === item.card_id && c.project_id === item.project_id,
      )?.title ?? "Pinned card · details unavailable"
    );
  }
  async function move(index: number, delta: number) {
    if (
      loading ||
      busy ||
      pending ||
      accessLost ||
      conflict ||
      index < 0 ||
      index + delta < 0 ||
      index + delta >= items.length
    )
      return;
    const item = items[index];
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    items = next;
    info = `${title(item)} moved to position ${index + delta + 1} of ${items.length}.`;
    await tick();
    const row = dialog.querySelector(`[data-focus-card="${item.card_id}"]`);
    const sameDirection = row?.querySelector<HTMLButtonElement>(
      `[data-direction="${delta}"]`,
    );
    const focusTarget =
      sameDirection && !sameDirection.disabled
        ? sameDirection
        : row?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    focusTarget?.focus();
  }
  function moveKey(event: KeyboardEvent, index: number) {
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      event.stopPropagation();
      void move(index, event.key === "ArrowUp" ? -1 : 1);
    }
  }
  function keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!discard) save();
    }
  }
  function close() {
    if (busy) return;
    if (dirty || pending) {
      closeTrigger = document.activeElement as HTMLElement | null;
      discard = true;
    } else onclose();
  }
  function focusConfirmation(node: HTMLButtonElement) {
    node.focus();
  }
  async function keepEditing() {
    discard = false;
    await tick();
    if (closeTrigger?.isConnected) closeTrigger.focus();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ items, expected_version: version, pending }, null, 2),
      );
      info = "Focus order copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy the order and request ID.";
    }
  }
  async function transmit() {
    if (!pending || busy || accessLost) return;
    busy = true;
    error = "";
    info = "";
    try {
      const result = await send(pending);
      if (result.state) {
        error = `Command is ${result.state}. Retry the same command to check its outcome.`;
        return;
      }
      pending = null;
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (isDefinitiveRejection(e)) {
        pending = null;
        conflict = true;
      }
    } finally {
      busy = false;
    }
  }
  function save() {
    if (!version || !dirty || busy || pending || accessLost || conflict) return;
    pending = command("/api/v1/workspace/focus", "PUT", { items }, version);
    void transmit();
  }
</script>

<dialog
  bind:this={dialog}
  use:modal
  aria-label="Arrange focus"
  onkeydown={keydown}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <header>
    <h2>Arrange focus</h2>
    <button onclick={close} disabled={busy} aria-label="Close focus order"
      >✕</button
    >
  </header>
  <div class="dialog-body">
    <p id="focus-order-help">
      Move pinned cards using the arrows or Alt+↑ / Alt+↓. Save to apply the new
      order.
    </p>
    {#if loading}<p role="status">Loading pinned cards…</p>{/if}
    {#if !loading && !version && !accessLost}<button onclick={load}
        >Reload focus order</button
      >{/if}
    {#if discard}<section class="discard" role="alert">
        <p>
          {pending
            ? "Discard this draft? This does not cancel an uncertain server write."
            : "Discard your unsaved focus order?"}
        </p>
        <div class="actions">
          <button onclick={keepEditing} use:focusConfirmation
            >Keep editing</button
          >
          <button onclick={onclose}>Discard focus order</button>
        </div>
      </section>{/if}
    <ol aria-describedby="focus-order-help" aria-busy={loading || busy}>
      {#each items as item, i (`${item.project_id}:${item.card_id}`)}<li
          data-focus-card={item.card_id}
        >
          <span class="position" aria-hidden="true">{i + 1}</span>
          <span class="card-title" title={item.card_id}>{title(item)}</span>
          <div class="move-actions">
            <button
              data-direction="-1"
              aria-label={`Move up: ${title(item)}`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              disabled={i === 0 ||
                loading ||
                busy ||
                !!pending ||
                accessLost ||
                conflict}
              onkeydown={(event) => moveKey(event, i)}
              onclick={() => move(i, -1)}>↑</button
            ><button
              data-direction="1"
              aria-label={`Move down: ${title(item)}`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              disabled={i === items.length - 1 ||
                loading ||
                busy ||
                !!pending ||
                accessLost ||
                conflict}
              onkeydown={(event) => moveKey(event, i)}
              onclick={() => move(i, 1)}>↓</button
            >
          </div>
        </li>{/each}
    </ol>
    {#if !loading && version && !items.length}<p>
        No pinned cards yet. Pin a card from its editor to add it to Focus.
      </p>{:else if !loading && items.length === 1}<p>
        Pin another card to arrange their order.
      </p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if conflict}<p>
        Review the current focus list before starting another save. Copy this
        draft, then close and reopen Arrange focus.
      </p>{/if}
    {#if pending}<p>
        Pending command: awaiting confirmation. The submitted order is kept
        unchanged.
      </p>
      <button onclick={transmit} disabled={busy || accessLost}
        >Retry same command</button
      >
      <details>
        <summary>Save details</summary><code>{pending.requestId}</code>
      </details>{/if}
  </div>
  <footer>
    <p class="save-state" role="status">
      {info ||
        (busy
          ? "Saving focus order…"
          : pending
            ? "Confirmation required"
            : dirty
              ? "Unsaved focus order"
              : loading
                ? "Loading focus order…"
                : version
                  ? "Order is up to date"
                  : "Focus order unavailable")}
    </p>
    <div class="actions">
      <button
        class="primary"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        onclick={save}
        disabled={!dirty ||
          busy ||
          !!pending ||
          accessLost ||
          conflict ||
          discard}>Save focus order</button
      >
      {#if dirty || pending}<button onclick={copy}>Copy focus order</button
        >{/if}
    </div>
  </footer>
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 24px));
    max-height: 90dvh;
    overflow: hidden;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 0;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: #152d2860;
  }
  header,
  li {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header {
    justify-content: space-between;
    border-bottom: 1px solid var(--line);
  }
  header,
  footer {
    flex-shrink: 0;
    padding: 16px 20px;
    background: var(--paper);
  }
  header h2 {
    margin: 0;
    font-size: 21px;
    line-height: 1.3;
  }
  footer {
    border-top: 1px solid var(--line);
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  .dialog-body {
    padding: 0 20px 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
    min-height: 0;
  }
  ol {
    padding: 0;
  }
  li {
    padding: 12px 0;
    border-top: 1px solid var(--line);
    font-size: 14px;
  }
  .card-title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .position {
    width: 20px;
    flex-shrink: 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  p {
    overflow-wrap: anywhere;
    font-size: 13px;
    line-height: 1.5;
  }
  .save-state {
    margin: 0 0 10px;
  }
  .move-actions,
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions {
    flex-wrap: wrap;
  }
  button {
    min-height: 44px;
  }
  .move-actions button,
  header button {
    min-width: 44px;
    flex-shrink: 0;
  }
  .discard {
    margin: 16px 0;
    padding: 12px;
    border: 1px solid var(--notice-line);
    background: var(--notice-bg);
    border-radius: 8px;
  }
  summary {
    cursor: pointer;
    padding: 12px 0;
  }
  code {
    overflow-wrap: anywhere;
  }
  @media (max-width: 520px) {
    header,
    footer {
      padding-left: 16px;
      padding-right: 16px;
    }
    .dialog-body {
      padding-left: 16px;
      padding-right: 16px;
    }
    li {
      gap: 8px;
    }
    .move-actions {
      gap: 4px;
    }
  }
</style>
