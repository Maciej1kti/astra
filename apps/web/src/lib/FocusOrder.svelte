<script lang="ts">
  import { onMount } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    ApiError,
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
    error = $state("");
  let pending = $state<Pending | null>(null),
    busy = $state(true),
    accessLost = $state(false),
    discard = $state(false),
    conflict = $state(false);
  let generation = 0;
  let dirty = $derived(!!version && JSON.stringify(items) !== original);
  onMount(() => {
    const current = ++generation;
    void api<{ items: Item[]; version: string }>("/api/v1/workspace/focus")
      .then((data) => {
        if (generation !== current) return;
        items = data.items;
        version = data.version;
        original = JSON.stringify(items);
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        busy = false;
      });
    const lost = () => {
      generation++;
      accessLost = true;
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
      )?.title ?? item.card_id
    );
  }
  function move(index: number, delta: number) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    items = next;
  }
  function close() {
    if (busy) return;
    if (dirty || pending) discard = true;
    else onclose();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ items, expected_version: version, pending }, null, 2),
      );
      error = "Focus order copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy the order and request ID.";
    }
  }
  async function transmit() {
    if (!pending || accessLost) return;
    busy = true;
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
      if (
        e instanceof ApiError &&
        e.status < 500 &&
        ![401, 403, 429].includes(e.status)
      ) {
        pending = null;
        conflict = true;
      }
    } finally {
      busy = false;
    }
  }
  function save() {
    if (!version || pending || accessLost || conflict) return;
    pending = command("/api/v1/workspace/focus", "PUT", { items }, version);
    void transmit();
  }
</script>

<dialog
  use:modal
  aria-label="Arrange focus"
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
  <p>Move pinned cards into the order you want to see them.</p>
  <ol>
    {#each items as item, i}<li>
        <span>{title(item)}</span><button
          aria-label={`Move up: ${title(item)}`}
          disabled={i === 0 || busy || !!pending}
          onclick={() => move(i, -1)}>↑</button
        ><button
          aria-label={`Move down: ${title(item)}`}
          disabled={i === items.length - 1 || busy || !!pending}
          onclick={() => move(i, 1)}>↓</button
        >
      </li>{/each}
  </ol>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if conflict}<p>
      The saved focus list changed. Copy this order, close and reopen to review
      the current list.
    </p>{/if}
  {#if pending}<p>Pending command: {pending.requestId}</p>
    <button onclick={transmit} disabled={busy || accessLost}
      >Retry same command</button
    >{/if}
  <button
    onclick={save}
    disabled={!dirty || busy || !!pending || accessLost || conflict}
    >Save focus order</button
  >
  {#if dirty || pending}<button onclick={copy}>Copy focus order</button>{/if}
  {#if discard}<p>
      Discard this draft? This does not cancel an uncertain server write.
    </p>
    <button onclick={() => (discard = false)}>Keep editing</button><button
      onclick={onclose}>Discard focus order</button
    >{/if}
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 24px));
    max-height: 90dvh;
    overflow: auto;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
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
  }
  ol {
    padding: 0;
  }
  li {
    margin: 12px 0;
  }
  li span {
    flex: 1;
    overflow-wrap: anywhere;
  }
  p {
    overflow-wrap: anywhere;
  }
</style>
