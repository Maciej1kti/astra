<script lang="ts">
  import type {
    PreferencesResource as Preferences,
    Session,
    Pairing,
  } from "../../lib/contracts/api.generated";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount, tick } from "svelte";
  import { applyTheme, readTheme, type Theme } from "./appearance";
  import { modal } from "../../lib/ui/dialog";
  import { api, command } from "../../lib/api/api";

  const operation = commandOperation(() => !accessLost);

  let theme = $state<Theme>(readTheme());

  let {
    onclose,
    onsaved,
    ontags,
  }: { onclose: () => void; onsaved: () => void; ontags: () => void } =
    $props();
  let baseline = $state<Preferences | null>(null);
  let timezone = $state("");
  let week = $state("monday");
  let view = $state("focus");
  let error = $state("");
  let info = $state("");
  let loading = $state(true);
  let working = $state(false);
  let pending = $derived(operation.pending);
  const busy = $derived(working || operation.busy);
  let sessions = $state<Session[]>([]);
  let pairings = $state<Pairing[]>([]);
  let accessLost = $state(false);
  let confirmClose = $state(false);
  let generation = 0;
  let preferencesForm: HTMLFormElement;
  let closeTrigger: HTMLElement | null = null;
  let dirty = $derived(
    !!baseline &&
      (timezone !== baseline.timezone ||
        week !== (baseline.preferences.week_start ?? "monday") ||
        view !== (baseline.preferences.default_view ?? "focus")),
  );
  function close() {
    if (busy) return;
    if (dirty || pending) {
      closeTrigger = document.activeElement as HTMLElement | null;
      confirmClose = true;
    } else onclose();
  }
  function focusConfirmation(node: HTMLButtonElement) {
    node.focus();
  }
  async function keepEditing() {
    confirmClose = false;
    await tick();
    if (closeTrigger?.isConnected) closeTrigger.focus();
  }
  function keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!confirmClose && dirty && !busy && !pending && !accessLost)
        preferencesForm?.requestSubmit();
    }
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            timezone,
            week_start: week,
            default_view: view,
            expected_version: baseline?.version,
            pending,
          },
          null,
          2,
        ),
      );
      info = "Settings draft copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy your draft fields.";
    }
  }
  onMount(() => {
    void load();
    const ended = () => {
      generation++;
      sessions = [];
      pairings = [];
      loading = false;
      accessLost = true;
      error =
        "Your session ended. Your settings draft is preserved; copy it before closing, then reconnect.";
    };
    const restored = () => {
      accessLost = false;
    };
    const leaving = (e: BeforeUnloadEvent) => {
      if (dirty || pending) e.preventDefault();
    };
    const unsubscribeSession = subscribeSession({
      ended: ended,
      restored: restored,
    });

    window.addEventListener("beforeunload", leaving);
    return () => {
      generation++;
      unsubscribeSession();

      window.removeEventListener("beforeunload", leaving);
    };
  });
  async function load() {
    if (dirty || pending) return;
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const [p, s, a] = await Promise.all([
        api<Preferences>("/api/v1/workspace/preferences"),
        api<{ items: Session[] }>("/api/v1/auth/sessions"),
        api<{ items: Pairing[] }>("/api/v1/auth/pairings"),
      ]);
      if (generation !== current) return;
      baseline = p;
      timezone = p.timezone;
      week = p.preferences.week_start ?? "monday";
      view = p.preferences.default_view ?? "focus";
      sessions = s.items;
      pairings = a.items;
    } catch (e) {
      if (generation === current)
        error = e instanceof Error ? e.message : String(e);
    } finally {
      if (generation === current) loading = false;
    }
  }
  async function save() {
    if (!baseline || !dirty || busy || accessLost || pending) return;
    operation.prepare(
      command(
        "/api/v1/workspace/preferences",
        "PATCH",
        {
          timezone,
          locale: "en",
          preferences: { week_start: week, default_view: view },
        },
        baseline.version,
      ),
    );
    await transmit();
  }
  async function transmit() {
    if (!pending || busy || accessLost) return;
    error = "";
    info = "";
    try {
      await operation.commit();
      onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  async function revoke(id: string) {
    const current = sessions.find((s) => s.id === id)?.current;
    if (busy || accessLost || pending || (current && dirty)) return;
    working = true;
    error = "";
    info = "";
    try {
      await api(`/api/v1/auth/sessions/${id}`, "DELETE", {});
      if (current) {
        onsaved();
        return;
      }
      sessions = sessions.filter((s) => s.id !== id);
      info = "Browser access revoked.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      working = false;
    }
  }
  async function decide(item: Pairing, approve: boolean) {
    if (busy || accessLost || pending) return;
    working = true;
    error = "";
    info = "";
    try {
      await api(
        `/api/v1/auth/pairings/${item.id}/${approve ? "approve" : "deny"}`,
        "POST",
        approve ? { challenge: item.challenge } : {},
      );
      pairings = pairings.filter((p) => p.id !== item.id);
      info = approve ? "Pairing request approved." : "Pairing request denied.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      working = false;
    }
  }
</script>

<dialog
  class="app-dialog"
  use:modal
  aria-label="Workspace settings"
  onkeydown={keydown}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <header>
    <h2>Workspace settings</h2>
    <button onclick={close} disabled={busy} aria-label="Close settings"
      >✕</button
    >
  </header>
  <div class="dialog-body">
    {#if loading}<p role="status">Loading workspace settings…</p>{/if}
    {#if error}<div class="notice" role="alert">{error}</div>{/if}
    {#if !loading && !baseline && !accessLost}<button onclick={load}
        >Reload settings</button
      >{/if}
    {#if confirmClose}<section class="notice discard" role="alert">
        <p>
          {pending
            ? "The command outcome may still be unknown. Discarding this draft does not cancel a server write."
            : "Discard your unsaved settings?"}
        </p>
        <div class="actions">
          <button onclick={keepEditing} use:focusConfirmation
            >Keep editing</button
          >
          <button onclick={onclose}>Discard settings draft</button>
        </div>
      </section>{/if}
    <form
      id="workspace-preferences"
      bind:this={preferencesForm}
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label
        >Timezone<input
          bind:value={timezone}
          placeholder="Europe/Warsaw"
          required
          disabled={!baseline || busy || !!pending || accessLost}
        /></label
      >
      <div class="row">
        <label
          >Week starts<select
            aria-label="Week starts"
            bind:value={week}
            disabled={!baseline || busy || !!pending || accessLost}
            ><option value="monday">Monday</option><option value="sunday"
              >Sunday</option
            ></select
          ></label
        ><label
          >Default view<select
            aria-label="Default view"
            bind:value={view}
            disabled={!baseline || busy || !!pending || accessLost}
            >{#each ["focus", "projects", "board", "calendar", "gantt", "list", "updates"] as name}<option
                value={name}
                >{name === "gantt"
                  ? "Timeline"
                  : name[0].toUpperCase() + name.slice(1)}</option
              >{/each}</select
          ></label
        >
      </div>
      <p>
        Dates follow this timezone. Changing it does not move any saved all-day
        dates.
      </p>
      {#if pending}<section class="notice">
          <p>
            Pending command: awaiting confirmation. Your submitted preferences
            are kept unchanged.
          </p>
          <button type="button" onclick={transmit} disabled={busy || accessLost}
            >Retry same command</button
          >
          <details>
            <summary>Save details</summary><code>{pending.requestId}</code>
          </details>
        </section>{/if}
    </form>
    <section class="appearance">
      <h3>Tags</h3>
      <p>
        Create reusable names, inspect usage across projects, and preview
        renames or merges.
      </p>
      <button
        disabled={dirty || busy || !!pending || accessLost}
        onclick={ontags}>Manage tags</button
      >
      {#if dirty || pending}<p>
          Save or discard your settings draft before managing tags.
        </p>{/if}
    </section>
    <section class="appearance">
      <h3>Appearance</h3>
      <label
        >Theme<select
          aria-label="Theme"
          bind:value={theme}
          onchange={() => applyTheme(theme)}
          ><option value="system">System</option><option value="light"
            >Light</option
          ><option value="dark">Dark</option></select
        ></label
      >
      <p>Theme changes apply immediately to this browser.</p>
    </section>
    <details class="access-section">
      <summary>Browser access</summary>
      <p>Revoke a device to end its session and stop future requests.</p>
      {#each sessions as session}<div class="item">
          <div>
            <strong
              >{session.device_label}{session.current
                ? " · this browser"
                : ""}</strong
            ><small
              >Last seen {session.last_seen_at.slice(0, 16).replace("T", " ")} UTC</small
            >
          </div>
          <button
            aria-label={session.current
              ? "Sign out this browser"
              : `Revoke access: ${session.device_label}`}
            title={session.current && (dirty || pending)
              ? "Save or discard your preferences before signing out this browser."
              : undefined}
            onclick={() => revoke(session.id)}
            disabled={busy ||
              accessLost ||
              !!pending ||
              (session.current && dirty)}
            >{session.current ? "Sign out" : "Revoke"}</button
          >
        </div>{:else}<p>
          {loading
            ? "Loading browser sessions…"
            : accessLost
              ? "Reconnect to view browser sessions."
              : "No active browser sessions."}
        </p>{/each}
      {#if dirty || pending}<p>
          Save or discard your preferences before signing out this browser.
        </p>{/if}
    </details>
    <details class="access-section" open={pairings.length > 0}>
      <summary
        >Pairing requests{#if pairings.length}
          · {pairings.length}{/if}</summary
      >
      <p>
        Approve only after comparing the challenge with the requesting browser.
      </p>
      {#each pairings as item}<div class="item">
          <div>
            <strong>{item.device_label}</strong><code>{item.challenge}</code>
          </div>
          <div class="actions">
            <button
              onclick={() => decide(item, false)}
              disabled={busy || accessLost || !!pending}>Deny</button
            ><button
              onclick={() => decide(item, true)}
              disabled={busy || accessLost || !!pending}>Approve</button
            >
          </div>
        </div>{:else}<p>
          {loading
            ? "Loading pairing requests…"
            : accessLost
              ? "Reconnect to view pairing requests."
              : "No pending requests."}
        </p>{/each}
    </details>
  </div>
  <footer>
    <p class="save-state" role="status">
      {info ||
        (busy
          ? "Applying changes…"
          : pending
            ? "Confirmation required"
            : dirty
              ? "Unsaved preferences"
              : loading
                ? "Loading preferences…"
                : baseline
                  ? "Preferences are up to date"
                  : "Preferences unavailable")}
    </p>
    <div class="actions">
      {#if dirty || pending}<button type="button" onclick={copyDraft}
          >Copy settings draft</button
        >{/if}
      <button
        class="primary"
        type="submit"
        form="workspace-preferences"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        disabled={!baseline ||
          !dirty ||
          busy ||
          !!pending ||
          accessLost ||
          confirmClose}>Save preferences</button
      >
    </div>
  </footer>
</dialog>

<style>
  dialog {
    width: min(600px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: 90dvh;
    padding: 0;
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  header,
  .row,
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  header,
  footer {
    flex-shrink: 0;
    padding: 16px 20px;
    background: var(--paper);
  }
  header {
    border-bottom: 1px solid var(--line);
  }
  footer {
    border-top: 1px solid var(--line);
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  .dialog-body {
    padding: 0 20px 20px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  h2 {
    margin: 0;
    font-size: 21px;
    line-height: 1.3;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  label {
    display: block;
    font-size: 13px;
    margin: 16px 0;
    flex: 1;
    min-width: 0;
  }
  input,
  select {
    width: 100%;
    margin-top: 8px;
  }
  p,
  small {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }
  small,
  code {
    display: block;
  }
  .item {
    padding: 15px 0;
    border-top: 1px solid var(--line);
    font-size: 13px;
  }
  .item > div {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .item > .actions {
    flex: 0 1 auto;
  }
  .item button {
    font-size: 12px;
  }
  code {
    margin-top: 8px;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .notice {
    margin: 16px 0;
    overflow-wrap: anywhere;
  }
  .discard {
    padding: 12px;
    border: 1px solid var(--notice-line);
    background: var(--notice-bg);
    border-radius: 8px;
  }
  .appearance,
  .access-section {
    border-top: 1px solid var(--line);
    padding-top: 16px;
    margin-top: 20px;
  }
  summary {
    min-height: 44px;
    padding: 10px 0;
    cursor: pointer;
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .save-state {
    margin: 0 0 10px;
  }
  button {
    min-height: 44px;
  }
  header button {
    min-width: 44px;
    flex-shrink: 0;
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
    .row {
      display: block;
    }
    .item {
      flex-wrap: wrap;
    }
    input,
    select {
      font-size: 16px;
    }
  }
</style>
