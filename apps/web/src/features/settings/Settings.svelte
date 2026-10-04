<script lang="ts">
  import { formatTimestamp } from "../../lib/resources/resource-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import type {
    PreferencesResource as Preferences,
    Session,
    Pairing,
    UserList,
  } from "../../lib/contracts/api.generated";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { onMount, tick } from "svelte";
  import { applyTheme, readTheme, type Theme } from "./appearance";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api, command } from "../../lib/api/api";
  import { workspaceViews, viewLabel } from "../workspace/navigation";

  const operation = commandOperation(() => !accessLost);

  let theme = $state<Theme>(readTheme());

  let {
    onclose,
    onsaved,
    ontags,
    onuserchange,
    canSwitchUser = true,
  }: {
    onclose: () => void;
    onsaved: () => void;
    ontags: () => void;
    onuserchange: (id: string) => void;
    canSwitchUser?: boolean;
  } = $props();
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
  let users = $state<UserList | null>(null);
  let selectedUser = $state("");
  let userName = $state("");
  let commandKind = $state<"preferences" | "user">("preferences");
  let accessLost = $state(false);
  let confirmClose = $state(false);
  let generation = 0;
  let preferencesForm: HTMLFormElement;
  let closeTrigger: HTMLElement | null = null;
  let preferencesDirty = $derived(
    !!baseline &&
      (timezone !== baseline.timezone ||
        week !== (baseline.preferences.week_start ?? "monday") ||
        view !== (baseline.preferences.default_view ?? "focus")),
  );
  const dirty = $derived(preferencesDirty || !!userName);
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
      if (!confirmClose && preferencesDirty && !busy && !pending && !accessLost)
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
            new_user_name: userName,
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
      users = null;
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
      const [p, s, a, u] = await Promise.all([
        api<Preferences>("/api/v1/workspace/preferences"),
        api<{ items: Session[] }>("/api/v1/auth/sessions"),
        api<{ items: Pairing[] }>("/api/v1/auth/pairings"),
        api<UserList>("/api/v1/users"),
      ]);
      if (generation !== current) return;
      baseline = p;
      timezone = p.timezone;
      week = p.preferences.week_start ?? "monday";
      view = p.preferences.default_view ?? "focus";
      sessions = s.items;
      pairings = a.items;
      users = u;
      selectedUser = u.current_user_id;
    } catch (e) {
      if (generation === current)
        error = e instanceof Error ? e.message : String(e);
    } finally {
      if (generation === current) loading = false;
    }
  }
  async function save() {
    if (
      !baseline ||
      !preferencesDirty ||
      userName ||
      busy ||
      accessLost ||
      pending
    )
      return;
    commandKind = "preferences";
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
      const submitted = pending;
      await operation.commit();
      if (commandKind === "user") {
        userName = "";
        info = "User added. Switch to their workspace when you are ready.";
        users = await api<UserList>(
          "/api/v1/users",
          "GET",
          undefined,
          {},
          { fresh: true },
        );
        selectedUser = (submitted.payload as { id: string }).id;
      } else onsaved();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  async function addUser() {
    const owner = users?.items.find((user) => user.is_default);
    if (
      !users ||
      !owner ||
      !userName.trim() ||
      preferencesDirty ||
      busy ||
      pending ||
      accessLost
    )
      return;
    commandKind = "user";
    operation.prepare(
      command(
        "/api/v1/users",
        "POST",
        {
          id: crypto.randomUUID(),
          name: userName.trim(),
        },
        undefined,
        { userId: owner.id, epoch: users.command_epoch },
      ),
    );
    await transmit();
  }
  function switchUser() {
    if (
      !users ||
      selectedUser === users.current_user_id ||
      !canSwitchUser ||
      dirty ||
      busy ||
      pending ||
      accessLost
    )
      return;
    try {
      onuserchange(selectedUser);
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
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Workspace settings"
  onkeydown={keydown}
>
  <DialogHeader
    title="Workspace settings"
    onclose={close}
    disabled={busy}
    closeLabel="Close settings"
  />
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
    <section class="user-section" aria-labelledby="user-settings-title">
      <h3 id="user-settings-title">User</h3>
      <p>
        Each user has their own project folders and workspace. Paired browsers
        can switch between trusted users.
      </p>
      <div class="row">
        <label
          >Current user<select
            aria-label="Current user"
            bind:value={selectedUser}
            disabled={!users || busy || !!pending || dirty || accessLost}
          >
            {#each users?.items ?? [] as user}<option value={user.id}
                >{user.name}{user.is_default ? " · default" : ""}</option
              >{/each}
          </select></label
        >
        <button
          onclick={switchUser}
          disabled={!users ||
            selectedUser === users.current_user_id ||
            !canSwitchUser ||
            dirty ||
            busy ||
            !!pending ||
            accessLost}>Switch user</button
        >
      </div>
      {#if !canSwitchUser}<p>
          Finish the open edit or pending project operation before switching
          users.
        </p>{/if}
      <form
        class="row"
        onsubmit={(event) => {
          event.preventDefault();
          void addUser();
        }}
      >
        <label
          >New user name<input
            bind:value={userName}
            maxlength="120"
            autocomplete="off"
            disabled={!users ||
              preferencesDirty ||
              busy ||
              !!pending ||
              accessLost}
          /></label
        >
        <button
          type="submit"
          disabled={!users ||
            !userName.trim() ||
            preferencesDirty ||
            busy ||
            !!pending ||
            accessLost}>Add user</button
        >
      </form>
      {#if pending && commandKind === "user"}<section
          class="notice"
          role="status"
        >
          <p>User creation is awaiting confirmation.</p>
          <button type="button" onclick={transmit} disabled={busy || accessLost}
            >Retry same command</button
          >
          <details>
            <summary>Save details</summary><code>{pending.requestId}</code>
          </details>
        </section>{/if}
    </section>
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
          disabled={!baseline || busy || !!pending || !!userName || accessLost}
        /></label
      >
      <div class="row">
        <label
          >Week starts<select
            aria-label="Week starts"
            bind:value={week}
            disabled={!baseline ||
              busy ||
              !!pending ||
              !!userName ||
              accessLost}
            ><option value="monday">Monday</option><option value="sunday"
              >Sunday</option
            ></select
          ></label
        ><label
          >Default view<select
            aria-label="Default view"
            bind:value={view}
            disabled={!baseline ||
              busy ||
              !!pending ||
              !!userName ||
              accessLost}
            >{#each workspaceViews as name}<option value={name}
                >{viewLabel(name)}</option
              >{/each}</select
          ></label
        >
      </div>
      <p>
        Dates follow this timezone. Changing it does not move any saved all-day
        dates.
      </p>
      {#if pending && commandKind === "preferences"}<section class="notice">
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
      <p>Rename or merge tags used on cards in a project.</p>
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
            ><small>Last seen {formatTimestamp(session.last_seen_at)}</small>
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
  <footer class="dialog-footer">
    <p class="save-state" role="status">
      {info ||
        (busy
          ? "Applying changes…"
          : pending
            ? "Confirmation required"
            : dirty
              ? userName
                ? "New user draft"
                : "Unsaved preferences"
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
      <Button
        variant="primary"
        type="submit"
        form="workspace-preferences"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        disabled={!baseline ||
          !preferencesDirty ||
          !!userName ||
          busy ||
          !!pending ||
          accessLost ||
          confirmClose}>Save preferences</Button
      >
    </div>
  </footer>
</dialog>

<style>
  .row,
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
  }
  h3 {
    margin: 0;
    font-size: var(--text-card);
  }
  label {
    display: block;
    margin: var(--space-8) 0;
    flex: 1;
    min-width: 0;
  }
  input,
  select {
    width: 100%;
    margin-top: var(--space-4);
  }
  p,
  small {
    color: var(--muted);
    font-size: var(--text-label);
    line-height: var(--leading-body);
  }
  small,
  code {
    display: block;
  }
  .item {
    padding: var(--space-8) 0;
    border-top: var(--stroke) solid var(--line);
    font-size: var(--text-label);
  }
  .item > div {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .item > .actions {
    flex: 0 1 auto;
  }
  .item :global(button) {
    font-size: var(--text-sm);
  }
  code {
    margin-top: var(--space-4);
    font-size: var(--text-card);
    overflow-wrap: anywhere;
  }
  .notice {
    margin: var(--space-8) 0;
  }
  .appearance,
  .access-section {
    border-top: var(--stroke) solid var(--line);
    padding-top: var(--space-8);
    margin-top: var(--space-9);
  }
  .user-section {
    border-bottom: var(--stroke) solid var(--line);
    padding-bottom: var(--space-8);
    margin-bottom: var(--space-9);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .save-state {
    margin: 0;
    flex: 1;
  }
  @media (max-width: 520px) {
    .row {
      display: block;
    }
    .item {
      flex-wrap: wrap;
    }
    .save-state {
      flex-basis: 100%;
    }
  }
</style>
