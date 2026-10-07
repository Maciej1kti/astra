<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import type {
    Root,
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
  import {
    pluginIds,
    pluginList,
    plugins,
    togglePlugin,
  } from "../../lib/plugins/registry";
  import { onMount, tick } from "svelte";
  import AppearanceSettings from "./AppearanceSettings.svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api, command } from "../../lib/api/api";
  import TimezoneMap from "./TimezoneMap.svelte";
  import { knownZones, offsetLabel, zoneOffset } from "./timezone-map";
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
  let enabledPlugins = $state("");
  let root = $state("");
  let roots = $state<Root[]>([]);
  let publish = $state(true);
  // Whether this host publishes at all; the choice is hidden when it does not.
  let githubHost = $state(false);
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
    plugins: "wtyczki",
    root: "katalog nowych projektów",
    publish: "publikowanie na GitHubie",
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
        enabledPlugins !== pluginList(baseline.preferences.plugins) ||
        root !== (baseline.preferences.project_root_id ?? "") ||
        (githubHost &&
          publish !== (baseline.preferences.publish_repositories ?? true)) ||
        (agentEnabled &&
          agent !== (baseline.preferences.agent_provider ?? "claude"))),
  );
  const dirty = $derived(preferencesDirty || !!userName);
  /** A preference field is editable only while its draft can still be saved. */
  const locked = $derived(
    !baseline || busy || !!pending || !!userName || accessLost || conflict,
  );
  const switchLocked = $derived(
    !users || !canSwitchUser || dirty || busy || !!pending || accessLost,
  );
  const status = $derived(
    info ||
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
                ? ""
                : "Ustawienia niedostępne"),
  );

  const zones = knownZones();
  const zoneSet = new Set(zones);
  // Without a list of zones the browser still accepts the ones it knows.
  const zoneAvailable = (zone: string) =>
    zoneSet.size ? zoneSet.has(zone) : zoneOffset(zone, new Date()) !== null;
  let now = $state(new Date());
  const zoneNow = $derived.by(() => {
    const offset = zoneOffset(timezone, now);
    if (offset === null) return "";
    return `${new Intl.DateTimeFormat("pl-PL", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(now)} · ${offsetLabel(offset)}`;
  });

  const sections = $derived([
    { id: "settings-profile", label: "Profil" },
    { id: "settings-time", label: "Czas i widok" },
    { id: "settings-projects", label: "Projekty" },
    ...(agentEnabled ? [{ id: "settings-agent", label: "Agent" }] : []),
    { id: "settings-plugins", label: "Wtyczki" },
    { id: "settings-tags", label: "Tagi" },
    { id: "settings-appearance", label: "Wygląd" },
    { id: "settings-access", label: "Dostęp" },
  ]);
  let body = $state<HTMLElement>();
  let current = $state("settings-profile");
  function show(id: string) {
    current = id;
    body?.querySelector(`#${id}`)?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  /** The section at the top of the scrolled body is the one the rail marks. */
  function track() {
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    let found = sections[0]?.id ?? "";
    for (const { id } of sections) {
      const node = body.querySelector(`#${id}`);
      if (node && node.getBoundingClientRect().top - top <= 48) found = id;
    }
    // The last sections may never reach the top of a body scrolled to its end.
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2)
      found = sections.at(-1)?.id ?? found;
    current = found;
  }
  const providers: { value: AgentProvider; label: string; maker: string }[] = [
    { value: "claude", label: "Claude Code", maker: "Anthropic" },
    { value: "codex", label: "Codex", maker: "OpenAI" },
  ];
  const initial = (name: string) =>
    (name.trim()[0] ?? "?").toLocaleUpperCase("pl");
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
            plugins: pluginIds(enabledPlugins),
            ...(root && root !== baseline?.preferences.project_root_id
              ? { project_root_id: root }
              : {}),
            ...(githubHost ? { publish_repositories: publish } : {}),
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
    const tick = window.setInterval(() => (now = new Date()), 30_000);
    return () => {
      generation++;
      window.clearInterval(tick);
    };
  });
  async function load() {
    // A retained draft keeps its baseline; only the access lists are read again.
    const retained = dirty || !!pending || conflict;
    const current = ++generation;
    loading = true;
    error = "";
    try {
      const [p, s, a, u, r, host] = await Promise.all([
        retained ? null : api<Preferences>("/api/v1/workspace/preferences"),
        api<{ items: Session[] }>("/api/v1/auth/sessions"),
        api<{ items: Pairing[] }>("/api/v1/auth/pairings"),
        api<UserList>("/api/v1/users"),
        api<{ items: Root[] }>("/api/v1/roots"),
        api<{ github_enabled?: boolean }>("/api/v1/bootstrap"),
      ]);
      if (generation !== current) return;
      if (p) {
        baseline = p;
        ({
          timezone,
          week,
          view,
          agent,
          plugins: enabledPlugins,
          root,
          publish,
        } = settingsDraft(p));
      }
      roots = r.items;
      githubHost = host.github_enabled === true;
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
            plugins: pluginIds(enabledPlugins),
            ...(root && root !== baseline.preferences.project_root_id
              ? { project_root_id: root }
              : {}),
            ...(githubHost ? { publish_repositories: publish } : {}),
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
        {
          timezone,
          week,
          view,
          agent,
          plugins: enabledPlugins,
          root,
          publish,
        },
      );
      baseline = current;
      ({
        timezone,
        week,
        view,
        agent,
        plugins: enabledPlugins,
        root,
        publish,
      } = rebased.draft);
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
  function switchUser(id: string) {
    selectedUser = id;
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
  class="app-dialog dialog-large settings-dialog"
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label="Ustawienia przestrzeni roboczej"
  onkeydown={keydown}
>
  <DialogHeader
    title="Ustawienia"
    onclose={close}
    disabled={busy}
    closeLabel="Zamknij ustawienia"
  >
    {#snippet actions()}
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
    {/snippet}
  </DialogHeader>
  <div class="settings-shell">
    <nav class="settings-rail" aria-label="Sekcje ustawień">
      {#each sections as section (section.id)}<button
          type="button"
          class="quiet"
          aria-current={current === section.id ? "true" : undefined}
          onclick={() => show(section.id)}>{section.label}</button
        >{/each}
    </nav>
    <!-- Fields name this form, so each section stays a block of its own. -->
    <form
      id="workspace-preferences"
      bind:this={preferencesForm}
      hidden
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    ></form>
    <div class="dialog-body" bind:this={body} onscroll={track}>
      {#if loading}<p role="status">
          Ładowanie ustawień przestrzeni roboczej…
        </p>{/if}
      <SessionNotice
        lost={accessLost}
        message="Sesja wygasła. Wersja robocza ustawień została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
      />
      {#if error}<div class="notice" role="alert">{error}</div>{/if}
      <div class="save-state" class:idle={!status && !dirty && !pending}>
        <p role="status">{status}</p>
        {#if dirty || pending}<button type="button" onclick={copyDraft}
            >Kopiuj wersję roboczą ustawień</button
          >{/if}
      </div>
      {#if conflict}<section class="notice">
          <p role="alert">
            Ustawienia zmieniły się w innym miejscu, więc tej wersji roboczej
            nie można już zapisać. Wczytaj aktualne ustawienia: zmienione przez
            Ciebie pola pozostaną w formularzu do ponownego, świadomego zapisu.
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

      <section id="settings-profile" aria-labelledby="settings-profile-title">
        <header>
          <h3 id="settings-profile-title">Profil</h3>
          <p>
            Każdy użytkownik ma własne foldery projektów i przestrzeń roboczą.
            Sparowane przeglądarki mogą przełączać się między zaufanymi
            użytkownikami.
          </p>
        </header>
        <ul class="people" aria-label="Użytkownicy">
          {#each users?.items ?? [] as user (user.id)}
            {@const active = user.id === users?.current_user_id}
            <li class:active aria-current={active ? "true" : undefined}>
              <span class="avatar" aria-hidden="true">{initial(user.name)}</span
              >
              <span class="person"
                ><strong>{user.name}</strong>{#if user.is_default}<small
                    >Domyślny profil hosta</small
                  >{/if}</span
              >
              {#if active}<span class="active-mark">Bieżący użytkownik</span
                >{:else}<button
                  type="button"
                  aria-label={`Przełącz na użytkownika ${user.name}`}
                  disabled={switchLocked}
                  onclick={() => switchUser(user.id)}>Przełącz</button
                >{/if}
            </li>
          {/each}
        </ul>
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
              placeholder="Na przykład Tomek"
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
        {#if pending && commandKind === "user"}<div
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
          </div>{/if}
      </section>

      <section id="settings-time" aria-labelledby="settings-time-title">
        <header>
          <h3 id="settings-time-title">Czas i widok</h3>
          <p>
            Daty są zgodne z wybraną strefą czasową. Jej zmiana nie przesuwa
            zapisanych dat całodniowych.
          </p>
        </header>
        <div class="zone">
          <TimezoneMap
            zone={timezone}
            {now}
            available={zoneAvailable}
            disabled={locked}
            onpick={(zone) => (timezone = zone)}
          />
          <div class="zone-field">
            <label
              >Strefa czasowa<input
                form="workspace-preferences"
                list="settings-zones"
                bind:value={timezone}
                placeholder="Europe/Warsaw"
                autocomplete="off"
                spellcheck="false"
                required
                disabled={locked}
              /></label
            >
            <datalist id="settings-zones"
              >{#each zones as zone}<option value={zone}
                ></option>{/each}</datalist
            >
            <p class="zone-now" class:unknown={!zoneNow}>
              {zoneNow || "Nieznana strefa czasowa"}
            </p>
          </div>
        </div>
        <div class="row">
          <label
            >Początek tygodnia<select
              form="workspace-preferences"
              aria-label="Początek tygodnia"
              bind:value={week}
              disabled={locked}
              ><option value="monday">Poniedziałek</option><option
                value="sunday">Niedziela</option
              ></select
            ></label
          ><label
            >Widok domyślny<select
              form="workspace-preferences"
              aria-label="Widok domyślny"
              bind:value={view}
              disabled={locked}
              >{#each workspaceViews as name}<option value={name}
                  >{viewLabel(name)}</option
                >{/each}</select
            ></label
          >
        </div>
      </section>

      <section id="settings-projects" aria-labelledby="settings-projects-title">
        <header>
          <h3 id="settings-projects-title">Projekty</h3>
          <p>Gdzie powstają nowe projekty i czy trafiają na GitHuba.</p>
        </header>
        <label
          >Katalog nowych projektów<select
            form="workspace-preferences"
            aria-label="Katalog nowych projektów"
            bind:value={root}
            disabled={locked}
            >{#if !baseline?.preferences.project_root_id}<option value=""
                >{roots.length === 1
                  ? `Automatycznie: ${roots[0]?.display_path}`
                  : "Nie wybrano"}</option
              >{:else if !roots.some((item) => item.id === baseline?.preferences.project_root_id)}<option
                value={baseline.preferences.project_root_id}
                >Katalog nie jest już zatwierdzony</option
              >{/if}{#each roots as item}<option value={item.id}
                >{item.label} · {item.display_path}</option
              >{/each}</select
          ></label
        >
        <p class="field-hint">
          {roots.length
            ? "Dodanie projektu tworzy w tym katalogu folder o nazwie projektu."
            : "Brak zatwierdzonych katalogów. Właściciel hosta dodaje je poleceniem projectctl add-root."}
        </p>
        {#if githubHost}<label class="toggle"
            ><span
              ><strong>Publikuj nowe projekty na GitHubie</strong><small
                >Nowy projekt dostaje prywatne repozytorium na koncie hosta. Po
                wyłączeniu projekty powstają tylko lokalnie; pojedynczy projekt
                opublikujesz w jego oknie Git.</small
              ></span
            ><input
              form="workspace-preferences"
              type="checkbox"
              role="switch"
              bind:checked={publish}
              disabled={locked}
            /></label
          >{/if}
      </section>

      {#if agentEnabled}<section
          id="settings-agent"
          aria-labelledby="settings-agent-title"
        >
          <header>
            <h3 id="settings-agent-title">Agent</h3>
            <p>Który agent kodujący odpowiada na wiadomości w czacie Astry.</p>
          </header>
          <div class="choices" role="radiogroup" aria-label="Dostawca agenta">
            {#each providers as provider (provider.value)}<label
                class="choice"
                class:chosen={agent === provider.value}
                ><input
                  form="workspace-preferences"
                  type="radio"
                  name="settings-agent"
                  value={provider.value}
                  checked={agent === provider.value}
                  onchange={() => (agent = provider.value)}
                  disabled={locked}
                /><span class="monogram" aria-hidden="true"
                  >{provider.label[0]}</span
                ><span
                  ><strong>{provider.label}</strong><small
                    >{provider.maker}</small
                  ></span
                ></label
              >{/each}
          </div>
        </section>{/if}

      <section id="settings-plugins" aria-labelledby="settings-plugins-title">
        <header>
          <h3 id="settings-plugins-title">Wtyczki</h3>
          <p>
            Dodatkowe funkcje dostarczane z aplikacją. Włączasz je dla swojego
            profilu; inni użytkownicy mają własny wybór.
          </p>
        </header>
        {#each plugins as plugin (plugin.id)}
          <label class="toggle"
            ><span
              ><strong>{plugin.name}</strong><small>{plugin.description}</small
              ></span
            ><input
              form="workspace-preferences"
              type="checkbox"
              role="switch"
              checked={pluginIds(enabledPlugins).includes(plugin.id)}
              onchange={(event) => {
                enabledPlugins = togglePlugin(
                  enabledPlugins,
                  plugin.id,
                  event.currentTarget.checked,
                );
              }}
              disabled={locked}
            /></label
          >
        {/each}
        {#if pending && commandKind === "preferences"}<div class="notice">
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
          </div>{/if}
      </section>

      <section id="settings-tags" aria-labelledby="settings-tags-title">
        <header>
          <h3 id="settings-tags-title">Tagi</h3>
          <p>Zmień nazwę lub połącz tagi używane na kartach projektu.</p>
        </header>
        <button
          disabled={dirty || busy || !!pending || accessLost}
          onclick={ontags}>Zarządzaj tagami</button
        >
        {#if dirty || pending}<p class="field-hint">
            Zapisz lub odrzuć wersję roboczą ustawień przed zarządzaniem tagami.
          </p>{/if}
      </section>

      <section
        id="settings-appearance"
        aria-labelledby="settings-appearance-title"
      >
        <header>
          <h3 id="settings-appearance-title">Wygląd</h3>
          <p>Zmiany wyglądu są od razu stosowane w tej przeglądarce.</p>
        </header>
        <AppearanceSettings />
      </section>

      <section id="settings-access" aria-labelledby="settings-access-title">
        <header>
          <h3 id="settings-access-title">Dostęp</h3>
          <p>Przeglądarki, które mogą otwierać tę przestrzeń roboczą.</p>
        </header>
        <h4>
          Prośby o parowanie{#if pairings.length}<span class="count"
              >{pairings.length}</span
            >{/if}
        </h4>
        {#each pairings as item}<div class="item request">
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
          </div>{:else}<p class="empty">
            {loading
              ? "Ładowanie próśb o parowanie…"
              : accessLost
                ? "Połącz się ponownie, aby zobaczyć prośby o parowanie."
                : "Brak oczekujących próśb."}
          </p>{/each}
        {#if pairings.length}<p class="field-hint">
            Zatwierdź dopiero po porównaniu kodu z przeglądarką proszącą o
            dostęp.
          </p>{/if}
        <details class="devices">
          <summary
            ><span>Dostęp przeglądarek</span>{#if sessions.length}<span
                class="count">{sessions.length}</span
              >{/if}</summary
          >
          <p>
            Cofnij dostęp urządzenia, aby zakończyć jego sesję i zatrzymać
            kolejne żądania.
          </p>
          {#each sessions as session}<div class="item">
              <div>
                <strong
                  >{session.device_label}{session.current
                    ? " · ta przeglądarka"
                    : ""}</strong
                ><small
                  >Ostatnia aktywność {formatTimestamp(
                    session.last_seen_at,
                  )}</small
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
      </section>
    </div>
  </div>
</dialog>

<style>
  .settings-shell {
    display: grid;
    grid-template-columns: var(--settings-rail) minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }
  .settings-rail {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-8) var(--space-4) var(--space-8) var(--space-6);
    border-right: var(--stroke) solid var(--line);
    background: var(--wash);
    overflow-y: auto;
  }
  .settings-rail button {
    justify-content: flex-start;
    min-height: var(--space-14);
    padding: var(--space-3) var(--space-6);
    border: 0;
    border-radius: var(--radius-control);
    color: var(--muted);
    font-size: var(--text-base);
    text-align: left;
  }
  .settings-rail button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .settings-rail button[aria-current="true"] {
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: var(--weight-medium);
  }
  .dialog-body {
    scroll-padding-top: var(--space-8);
  }
  section[id] {
    padding-block: var(--space-10);
    border-top: var(--stroke) solid var(--line);
  }
  section[id]:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
  section[id]:last-of-type {
    padding-bottom: var(--space-4);
  }
  section > header {
    margin-bottom: var(--space-8);
  }
  section > header p {
    margin: var(--space-2) 0 0;
    max-width: var(--measure);
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-tight);
  }
  h4 {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin: 0 0 var(--space-2);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
  }
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
  label {
    display: block;
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--muted);
  }
  section > label,
  section > .row {
    margin-top: var(--space-8);
  }
  input:not([type="checkbox"], [type="radio"]),
  select {
    width: 100%;
    margin-top: var(--space-3);
    font-size: var(--text-base);
    color: var(--ink);
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
  small {
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
  }
  .field-hint {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
  }
  .notice {
    margin: var(--space-8) 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  /* What is unsaved or in flight, said once above the sections. */
  .save-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    margin-bottom: var(--space-8);
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-6);
    border-radius: var(--radius-control);
    background: var(--notice-bg);
  }
  .save-state p {
    margin: 0;
    color: var(--notice-ink);
  }
  .save-state.idle {
    position: absolute;
    width: var(--stroke);
    height: var(--stroke);
    overflow: hidden;
    clip-path: inset(50%);
    padding: 0;
    margin: 0;
  }
  .save-state button {
    font-size: var(--text-sm);
  }

  .people {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-4) var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
  }
  .people li.active {
    border-color: var(--accent-ink);
    background: var(--accent);
  }
  .avatar,
  .monogram {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--space-14);
    height: var(--space-14);
    border-radius: var(--radius-pill);
    background: var(--soft);
    color: var(--ink);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }
  .active .avatar {
    background: var(--accent-ink);
    color: var(--paper);
  }
  .person {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .person strong,
  .toggle strong,
  .choice strong {
    display: block;
    color: var(--ink);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
  }
  .active-mark {
    color: var(--accent-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  .people button {
    font-size: var(--text-sm);
  }

  .zone {
    display: grid;
    gap: var(--space-6);
  }
  .zone-field {
    display: flex;
    align-items: flex-end;
    gap: var(--space-8);
  }
  .zone-now {
    flex: none;
    margin: 0 0 var(--space-5);
    color: var(--ink);
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
    font-variant-numeric: tabular-nums;
  }
  .zone-now::first-letter {
    text-transform: uppercase;
  }
  .zone-now.unknown {
    color: var(--danger);
    font-size: var(--text-base);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-8);
    margin-top: var(--space-6);
    padding: var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .toggle input {
    appearance: none;
    flex: none;
    position: relative;
    width: var(--space-14);
    height: var(--space-10);
    margin: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--line-strong);
    cursor: inherit;
  }
  .toggle input::after {
    content: "";
    position: absolute;
    inset: var(--space-1) auto var(--space-1) var(--space-1);
    width: var(--space-9);
    border-radius: var(--radius-pill);
    background: var(--paper);
    box-shadow: var(--shadow-sm);
  }
  .toggle input:checked {
    background: var(--accent-ink);
  }
  .toggle input:checked::after {
    translate: var(--space-8) 0;
  }
  .toggle input:disabled {
    opacity: var(--disabled-opacity);
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(
      auto-fit,
      minmax(var(--field-min-width), 1fr)
    );
    gap: var(--space-6);
  }
  .choice {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-6);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .choice:hover {
    border-color: var(--line-strong);
  }
  .choice.chosen {
    border-color: var(--accent-ink);
    box-shadow: inset 0 0 0 var(--stroke) var(--accent-ink);
  }
  .choice input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }
  .choice:has(input:focus-visible) {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-offset);
  }
  .choice.chosen .monogram {
    background: var(--accent-ink);
    color: var(--paper);
  }
  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-9);
    height: var(--space-9);
    padding-inline: var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--soft);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  h4 .count {
    background: var(--notice-bg);
    color: var(--notice-ink);
  }
  .empty {
    margin: 0;
  }
  .item {
    padding: var(--space-6) 0;
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
  .item.request {
    margin-top: var(--space-4);
    padding: var(--space-6);
    border: var(--stroke) solid var(--notice-line);
    border-radius: var(--radius-control);
    background: var(--notice-bg);
  }
  code {
    margin-top: var(--space-2);
    font-size: var(--text-lg);
    overflow-wrap: anywhere;
  }
  .devices {
    margin-top: var(--space-8);
  }
  .devices summary {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--tap-target);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  @media (prefers-reduced-motion: no-preference) {
    .toggle input,
    .toggle input::after {
      transition:
        background-color var(--motion-quick) var(--motion-ease),
        translate var(--motion-quick) var(--motion-ease);
    }
    .choice {
      transition: border-color var(--motion-quick) var(--motion-ease);
    }
  }
  @media (max-width: 700px) {
    .settings-shell {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    /* The sections become a strip of their names above the content. */
    .settings-rail {
      flex-direction: row;
      padding: var(--space-3) var(--space-6);
      border-right: 0;
      border-bottom: var(--stroke) solid var(--line);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .settings-rail button {
      flex: none;
      white-space: nowrap;
    }
  }
  @media (max-width: 520px) {
    .row,
    .zone-field {
      display: block;
    }
    .zone-now {
      margin: var(--space-4) 0 0;
    }
    .row > label + label,
    .row > button {
      margin-top: var(--space-6);
    }
    .item {
      flex-wrap: wrap;
    }
  }
</style>
