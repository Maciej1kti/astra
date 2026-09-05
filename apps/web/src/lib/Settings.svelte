<script lang="ts">
  import { onMount } from "svelte";
  import { applyTheme, readTheme, type Theme } from "./appearance";
  let theme = $state<Theme>(readTheme());
  import { modal } from "./dialog";
  import { api, command, send, ApiError, type Pending } from "./api";
  let { onclose, onsaved }: { onclose: () => void; onsaved: () => void } =
    $props();
  type Preferences = {
    timezone: string;
    locale: string;
    preferences: { week_start?: string; default_view?: string };
    version: string;
  };
  type Session = {
    id: string;
    device_label: string;
    current: boolean;
    last_seen_at: string;
  };
  type Pairing = { id: string; device_label: string; challenge: string };
  let baseline = $state<Preferences | null>(null),
    timezone = $state(""),
    week = $state("monday"),
    view = $state("focus"),
    error = $state(""),
    busy = $state(false),
    pending = $state<Pending | null>(null);
  let sessions = $state<Session[]>([]),
    pairings = $state<Pairing[]>([]);
  onMount(() => {
    void load();
  });
  async function load() {
    try {
      const [p, s, a] = await Promise.all([
        api<Preferences>("/api/v1/workspace/preferences"),
        api<{ items: Session[] }>("/api/v1/auth/sessions"),
        api<{ items: Pairing[] }>("/api/v1/auth/pairings"),
      ]);
      baseline = p;
      timezone = p.timezone;
      week = p.preferences.week_start ?? "monday";
      view = p.preferences.default_view ?? "focus";
      sessions = s.items;
      pairings = a.items;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function save() {
    if (!baseline) return;
    pending = command(
      "/api/v1/workspace/preferences",
      "PATCH",
      {
        timezone,
        locale: "en",
        preferences: { week_start: week, default_view: view },
      },
      baseline.version,
    );
    await transmit();
  }
  async function transmit() {
    if (!pending) return;
    busy = true;
    error = "";
    try {
      const result = await send(pending);
      if (result.state) {
        error = `Save is ${result.state}. Retry the same command to check its outcome.`;
        return;
      }
      pending = null;
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError && e.status < 500) pending = null;
    } finally {
      busy = false;
    }
  }
  async function revoke(id: string) {
    busy = true;
    try {
      await api(`/api/v1/auth/sessions/${id}`, "DELETE", {});
      if (sessions.find((s) => s.id === id)?.current) {
        onsaved();
        return;
      }
      sessions = sessions.filter((s) => s.id !== id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function decide(item: Pairing, approve: boolean) {
    busy = true;
    try {
      await api(
        `/api/v1/auth/pairings/${item.id}/${approve ? "approve" : "deny"}`,
        "POST",
        approve ? { challenge: item.challenge } : {},
      );
      pairings = pairings.filter((p) => p.id !== item.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  use:modal
  aria-label="Workspace settings"
  oncancel={(e) => {
    e.preventDefault();
    if (!busy) onclose();
  }}
>
  <header>
    <h2>Workspace settings</h2>
    <button onclick={onclose} disabled={busy} aria-label="Close settings"
      >✕</button
    >
  </header>
  <form
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
        disabled={!baseline || busy}
      /></label
    >
    <div class="row">
      <label
        >Week starts<select
          aria-label="Week starts"
          bind:value={week}
          disabled={busy}
          ><option value="monday">Monday</option><option value="sunday"
            >Sunday</option
          ></select
        ></label
      ><label
        >Default view<select
          aria-label="Default view"
          bind:value={view}
          disabled={busy}
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
    {#if error}<div class="notice" role="alert">{error}</div>{/if}
    {#if pending}<p>Pending command: {pending.requestId}</p>
      <button type="button" onclick={transmit} disabled={busy}
        >Retry same command</button
      >{/if}
    <button
      class="primary"
      type="submit"
      disabled={!baseline || busy || !!pending}>Save preferences</button
    >
  </form>
  <h3>Appearance on this browser</h3>
  <label
    >Theme<select
      aria-label="Theme"
      bind:value={theme}
      onchange={() => applyTheme(theme)}
      ><option value="system">System</option><option value="light">Light</option
      ><option value="dark">Dark</option></select
    ></label
  >
  <h3>Browser access</h3>
  <p>Revoke a device to end its session and stop future requests.</p>
  {#each sessions as session}<div class="item">
      <div>
        <strong
          >{session.device_label}{session.current
            ? " · this browser"
            : ""}</strong
        ><small
          >Last seen {session.last_seen_at
            .slice(0, 16)
            .replace("T", " ")}</small
        >
      </div>
      <button onclick={() => revoke(session.id)} disabled={busy}>Revoke</button>
    </div>{/each}
  <h3>Pairing requests</h3>
  <p>Approve only after comparing the challenge with the requesting browser.</p>
  {#each pairings as item}<div class="item">
      <div>
        <strong>{item.device_label}</strong><code>{item.challenge}</code>
      </div>
      <button onclick={() => decide(item, false)} disabled={busy}>Deny</button
      ><button onclick={() => decide(item, true)} disabled={busy}
        >Approve</button
      >
    </div>{:else}<p>No pending requests.</p>{/each}
</dialog>

<style>
  dialog {
    width: min(560px, 100vw);
    max-width: 100vw;
    max-height: 90dvh;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
    color: var(--ink);
    padding: 28px;
  }
  dialog::backdrop {
    background: #152d2860;
  }
  header,
  .row,
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  h2 {
    font:
      28px Georgia,
      serif;
  }
  h3 {
    margin-top: 30px;
    font-size: 16px;
  }
  label {
    display: block;
    font-size: 12px;
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
    font-size: 12px;
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
  }
  .item button {
    font-size: 12px;
  }
  code {
    margin-top: 8px;
    font-size: 15px;
  }
  .notice {
    margin-bottom: 15px;
  }
</style>
