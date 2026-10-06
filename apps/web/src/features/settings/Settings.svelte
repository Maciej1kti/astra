<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import type {
    AgentProvider,
    PreferencesResource as Preferences,
    Session,
    Pairing,
    UserList,
  } from "../../lib/contracts/api.generated";
  import CommandRecovery from "../../lib/ui/CommandRecovery.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import {
    commandOperation,
    sessionAccess,
    unloadGuard,
  } from "../../lib/api/command-operation.svelte";
  import { rebaseSettingsDraft, settingsDraft } from "./settings-draft";
  import { onMount, tick } from "svelte";
  import { applyTheme, readTheme, type Theme } from "./appearance";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api, command } from "../../lib/api/api";
  import { workspaceViews, viewLabel } from "../workspace/navigation";

  const access = sessionAccess({
    ended: () => {
      generation++;
      sessions = [];
      pairings = [];
      users = null;
      loading = false;
      // Without a draft nothing is retained; pairing needs no dialog below it.
      if (!dirty && !pending) onclose();
    },
    restored: () => void load(),
  });
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);
  unloadGuard(() => dirty || !!pending);

  let theme = $state<Theme>(readTheme());

  let {
    onclose,
    onsaved,
    ontags,
    onuserchange,
    canSwitchUser = true,
    agentEnabled = false,
  }: {
    onclose: () => void;
    onsaved: () => void;
    ontags: () => void;
    onuserchange: (id: string) => void;
    canSwitchUser?: boolean;
    agentEnabled?: boolean;
  } = $props();
  let baseline = $state<Preferences | null>(null);
  let timezone = $state("");
  let week = $state("monday");
  let view = $state("focus");
  let agent = $state<AgentProvider>("claude");
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
  // A rejected conflict keeps the draft visible but never resubmits it as is.
  const conflict = $derived(
    operation.conflict && commandKind === "preferences",
  );
  const labels = {
    timezone: "strefa czasowa",
    week: "początek tygodnia",
    view: "widok domyślny",
    agent: "dostawca agenta",
  };
  let confirmClose = $state(false);
  let generation = 0;
  let preferencesForm: HTMLFormElement;
  let closeTrigger: HTMLElement | null = null;
  let preferencesDirty = $derived(
    !!baseline &&
      (timezone !== baseline.timezone ||
        week !== (baseline.preferences.week_start ?? "monday") ||
        view !== (baseline.preferences.default_view ?? "focus") ||
        (agentEnabled &&
          agent !== (baseline.preferences.agent_provider ?? "claude"))),
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
        preferencesForm.requestSubmit();
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
            ...(agentEnabled ? { agent_provider: agent } : {}),
            expected_version: baseline?.version,
            pending,
            new_user_name: userName,
          },
          null,
          2,
        ),
      );
      info = "Skopiowano wersję roboczą ustawień.";
    } catch {
      error =
        "Schowek jest niedostępny. Zaznacz i skopiuj pola wersji roboczej.";
    }
  }
  onMount(() => {
    void load();
    return () => {
      generation++;
    };
  });
  async function load() {
    // A retained draft keeps its baseline; only the access lists are read again.
    const retained = dirty || !!pending || conflict;
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const [p, s, a, u] = await Promise.all([
        retained ? null : api<Preferences>("/api/v1/workspace/preferences"),
        api<{ items: Session[] }>("/api/v1/auth/sessions"),
        api<{ items: Pairing[] }>("/api/v1/auth/pairings"),
        api<UserList>("/api/v1/users"),
      ]);
      if (generation !== current) return;
      if (p) {
        baseline = p;
        ({ timezone, week, view, agent } = settingsDraft(p));
      }
      sessions = s.items;
      pairings = a.items;
      users = u;
      selectedUser = u.current_user_id;
    } catch (e) {
      if (generation === current) error = errorMessage(e);
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
      pending ||
      conflict
    )
      return;
    commandKind = "preferences";
    operation.prepare(
      command(
        "/api/v1/workspace/preferences",
        "PATCH",
        {
          timezone,
          locale: "pl",
          preferences: {
            week_start: week,
            default_view: view,
            ...(agentEnabled ? { agent_provider: agent } : {}),
          },
        },
        baseline.version,
      ),
    );
    await transmit();
  }
  async function transmit() {
    await runCommand("submit");
  }
  async function check() {
    await runCommand("status");
  }
  /** Both continuations keep the original request ID, epoch and payload. */
  async function runCommand(action: "submit" | "status") {
    if (!pending || busy || accessLost) return;
    error = "";
    info = "";
    try {
      const submitted = pending;
      if (action === "status") await operation.confirm();
      else await operation.commit();
      if (commandKind === "user") {
        userName = "";
        info =
          "Dodano użytkownika. Przełącz się na jego przestrzeń roboczą, gdy wszystko będzie gotowe.";
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
      error = errorMessage(cause);
    }
  }
  /** The explicit way out of a conflict; it reads but never writes. */
  async function loadCurrent() {
    if (!baseline || !conflict || busy || accessLost) return;
    working = true;
    error = "";
    info = "";
    try {
      const current = await api<Preferences>(
        "/api/v1/workspace/preferences",
        "GET",
        undefined,
        {},
        { fresh: true },
      );
      const rebased = rebaseSettingsDraft(
        settingsDraft(baseline),
        settingsDraft(current),
        { timezone, week, view, agent },
      );
      baseline = current;
      ({ timezone, week, view, agent } = rebased.draft);
      operation.acknowledge();
      info = rebased.kept.length
        ? `Wczytano aktualne ustawienia. Twoje zmiany (${rebased.kept.map((field) => labels[field]).join(", ")}) pozostały w formularzu; zapisz je ponownie, jeśli nadal są potrzebne.`
        : "Wczytano aktualne ustawienia.";
    } catch (cause) {
      // The conflict stays recorded, so the stale draft remains locked.
      error = errorMessage(cause);
    } finally {
      working = false;
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
      error = errorMessage(cause);
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
      info = "Cofnięto dostęp przeglądarki.";
    } catch (e) {
      error = errorMessage(e);
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
      info = approve
        ? "Zatwierdzono prośbę o parowanie."
        : "Odrzucono prośbę o parowanie.";
    } catch (e) {
      error = errorMessage(e);
    } finally {
      working = false;
    }
  }
</script>

<dialog
  class="app-dialog"
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Ustawienia przestrzeni roboczej"
  onkeydown={keydown}
>
  <DialogHeader
    title="Ustawienia przestrzeni roboczej"
    onclose={close}
    disabled={busy}
    closeLabel="Zamknij ustawienia"
  />
  <div class="dialog-body">
    {#if loading}<p role="status">
        Ładowanie ustawień przestrzeni roboczej…
      </p>{/if}
    <SessionNotice
      lost={accessLost}
      message="Sesja wygasła. Wersja robocza ustawień została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
    />
    {#if error}<div class="notice" role="alert">{error}</div>{/if}
    {#if conflict}<section class="notice">
        <p role="alert">
          Ustawienia zmieniły się w innym miejscu, więc tej wersji roboczej nie
          można już zapisać. Wczytaj aktualne ustawienia: zmienione przez Ciebie
          pola pozostaną w formularzu do ponownego, świadomego zapisu.
        </p>
        <button
          type="button"
          onclick={loadCurrent}
          disabled={busy || accessLost}>Wczytaj aktualne ustawienia</button
        >
      </section>{/if}
    {#if !loading && !baseline && !accessLost}<button onclick={load}
        >Wczytaj ustawienia ponownie</button
      >{/if}
    {#if confirmClose}<div
        class="notice discard"
        role="alertdialog"
        aria-labelledby="settings-discard-question"
      >
        <p id="settings-discard-question">
          {pending
            ? "Wynik polecenia może nadal być nieznany. Odrzucenie wersji roboczej nie anuluje zapisu na serwerze."
            : "Odrzucić niezapisane ustawienia?"}
        </p>
        <div class="actions">
          <button onclick={keepEditing} use:focusConfirmation
            >Kontynuuj edycję</button
          >
          <button onclick={onclose}>Odrzuć wersję roboczą ustawień</button>
        </div>
      </div>{/if}
    <section class="user-section" aria-labelledby="user-settings-title">
      <h3 id="user-settings-title">Użytkownik</h3>
      <p>
        Każdy użytkownik ma własne foldery projektów i przestrzeń roboczą.
        Sparowane przeglądarki mogą przełączać się między zaufanymi
        użytkownikami.
      </p>
      <div class="row">
        <label
          >Bieżący użytkownik<select
            aria-label="Bieżący użytkownik"
            bind:value={selectedUser}
            disabled={!users || busy || !!pending || dirty || accessLost}
          >
            {#each users?.items ?? [] as user}<option value={user.id}
                >{user.name}{user.is_default ? " · domyślny" : ""}</option
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
            accessLost}>Zmień użytkownika</button
        >
      </div>
      {#if !canSwitchUser}<p>
          Zakończ otwartą edycję lub oczekującą operację projektu przed zmianą
          użytkownika.
        </p>{/if}
      <form
        class="row"
        onsubmit={(event) => {
          event.preventDefault();
          void addUser();
        }}
      >
        <label
          >Nazwa nowego użytkownika<input
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
            accessLost}>Dodaj użytkownika</button
        >
      </form>
      {#if pending && commandKind === "user"}<section
          class="notice"
          role="status"
        >
          <p>Utworzenie użytkownika oczekuje na potwierdzenie.</p>
          <CommandRecovery
            {pending}
            {busy}
            {accessLost}
            oncheck={check}
            onretry={transmit}
          />
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
        >Strefa czasowa<input
          bind:value={timezone}
          placeholder="Europe/Warsaw"
          required
          disabled={!baseline ||
            busy ||
            !!pending ||
            !!userName ||
            accessLost ||
            conflict}
        /></label
      >
      <p class="field-hint">
        Daty są zgodne z tą strefą czasową. Jej zmiana nie przesuwa zapisanych
        dat całodniowych.
      </p>
      <div class="row">
        <label
          >Początek tygodnia<select
            aria-label="Początek tygodnia"
            bind:value={week}
            disabled={!baseline ||
              busy ||
              !!pending ||
              !!userName ||
              accessLost ||
              conflict}
            ><option value="monday">Poniedziałek</option><option value="sunday"
              >Niedziela</option
            ></select
          ></label
        ><label
          >Widok domyślny<select
            aria-label="Widok domyślny"
            bind:value={view}
            disabled={!baseline ||
              busy ||
              !!pending ||
              !!userName ||
              accessLost ||
              conflict}
            >{#each workspaceViews as name}<option value={name}
                >{viewLabel(name)}</option
              >{/each}</select
          ></label
        >
      </div>
      {#if agentEnabled}<label
          >Dostawca agenta<select
            aria-label="Dostawca agenta"
            bind:value={agent}
            disabled={!baseline ||
              busy ||
              !!pending ||
              !!userName ||
              accessLost ||
              conflict}
            ><option value="claude">Claude Code</option><option value="codex"
              >Codex</option
            ></select
          ></label
        >{/if}
      {#if pending && commandKind === "preferences"}<section class="notice">
          <p>
            Oczekujące polecenie: czeka na potwierdzenie. Przesłane ustawienia
            pozostają niezmienione.
          </p>
          <CommandRecovery
            {pending}
            {busy}
            {accessLost}
            oncheck={check}
            onretry={transmit}
          />
        </section>{/if}
    </form>
    <section class="appearance">
      <h3>Tagi</h3>
      <p>Zmień nazwę lub połącz tagi używane na kartach projektu.</p>
      <button
        disabled={dirty || busy || !!pending || accessLost}
        onclick={ontags}>Zarządzaj tagami</button
      >
      {#if dirty || pending}<p>
          Zapisz lub odrzuć wersję roboczą ustawień przed zarządzaniem tagami.
        </p>{/if}
    </section>
    <section class="appearance">
      <h3>Wygląd</h3>
      <label
        >Motyw<select
          aria-label="Motyw"
          bind:value={theme}
          onchange={() => applyTheme(theme)}
          ><option value="system">Systemowy</option><option value="light"
            >Jasny</option
          ><option value="dark">Ciemny</option></select
        ></label
      >
      <p>Zmiany motywu są od razu stosowane w tej przeglądarce.</p>
    </section>
    <details class="access-section">
      <summary>Dostęp przeglądarek</summary>
      <p>
        Cofnij dostęp urządzenia, aby zakończyć jego sesję i zatrzymać kolejne
        żądania.
      </p>
      {#each sessions as session}<div class="item">
          <div>
            <strong
              >{session.device_label}{session.current
                ? "· ta przeglądarka"
                : ""}</strong
            ><small
              >Ostatnia aktywność {formatTimestamp(session.last_seen_at)}</small
            >
          </div>
          <button
            aria-label={session.current
              ? "Wyloguj tę przeglądarkę"
              : `Cofnij dostęp: ${session.device_label}`}
            title={session.current && (dirty || pending)
              ? "Zapisz lub odrzuć ustawienia przed wylogowaniem tej przeglądarki."
              : undefined}
            onclick={() => revoke(session.id)}
            disabled={busy ||
              accessLost ||
              !!pending ||
              (session.current && dirty)}
            >{session.current ? "Wyloguj" : "Cofnij dostęp"}</button
          >
        </div>{:else}<p>
          {loading
            ? "Ładowanie sesji przeglądarek…"
            : accessLost
              ? "Połącz się ponownie, aby zobaczyć sesje przeglądarek."
              : "Brak aktywnych sesji przeglądarek."}
        </p>{/each}
      {#if dirty || pending}<p>
          Zapisz lub odrzuć ustawienia przed wylogowaniem tej przeglądarki.
        </p>{/if}
    </details>
    <details class="access-section" open={pairings.length > 0}>
      <summary
        >Prośby o parowanie{#if pairings.length}
          · {pairings.length}{/if}</summary
      >
      <p>
        Zatwierdź dopiero po porównaniu kodu z przeglądarką proszącą o dostęp.
      </p>
      {#each pairings as item}<div class="item">
          <div>
            <strong>{item.device_label}</strong><code>{item.challenge}</code>
          </div>
          <div class="actions">
            <button
              onclick={() => decide(item, false)}
              disabled={busy || accessLost || !!pending}>Odrzuć</button
            ><button
              onclick={() => decide(item, true)}
              disabled={busy || accessLost || !!pending}>Zatwierdź</button
            >
          </div>
        </div>{:else}<p>
          {loading
            ? "Ładowanie próśb o parowanie…"
            : accessLost
              ? "Połącz się ponownie, aby zobaczyć prośby o parowanie."
              : "Brak oczekujących próśb."}
        </p>{/each}
    </details>
  </div>
  <footer class="dialog-footer">
    <p class="save-state" role="status">
      {info ||
        (busy
          ? "Stosowanie zmian…"
          : pending
            ? "Wymagane potwierdzenie"
            : dirty
              ? userName
                ? "Wersja robocza nowego użytkownika"
                : "Niezapisane ustawienia"
              : loading
                ? "Ładowanie ustawień…"
                : baseline
                  ? "Ustawienia są aktualne"
                  : "Ustawienia niedostępne")}
    </p>
    <div class="actions">
      {#if dirty || pending}<button type="button" onclick={copyDraft}
          >Kopiuj wersję roboczą ustawień</button
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
          conflict ||
          confirmClose}>Zapisz ustawienia</Button
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
  .row {
    align-items: flex-end;
  }
  .row > :global(button) {
    margin-bottom: var(--space-8);
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
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
    font-size: var(--text-base);
    line-height: var(--leading-body);
  }
  small,
  code {
    display: block;
  }
  .field-hint {
    margin: calc(-1 * var(--space-4)) 0 0;
  }
  .item {
    padding: var(--space-8) 0;
    border-top: var(--stroke) solid var(--line);
    font-size: var(--text-base);
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
    font-size: var(--text-lg);
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
