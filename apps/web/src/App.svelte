<script lang="ts">
  import { errorMessage, serverMessage } from "./lib/api/messages.ts";
  import { motionEnvironment, revealScene } from "./lib/ui/motion";
  import PageHeading from "./lib/ui/PageHeading.svelte";
  import Button from "./lib/ui/Button.svelte";
  import Icon from "./lib/ui/Icon.svelte";
  import DeferredDialog from "./lib/ui/DeferredDialog.svelte";
  import DeferredHost from "./lib/ui/DeferredHost.svelte";
  import DeferredView from "./lib/ui/DeferredView.svelte";
  import { deferredComponent } from "./lib/ui/deferred-component.svelte";
  import { observePreloadFailures } from "./lib/ui/preload-recovery";
  import { calendarToday } from "./lib/ui/calendar-dates";

  import WorkspaceNavigation from "./features/workspace/WorkspaceNavigation.svelte";
  import WorkspaceHeader from "./features/workspace/WorkspaceHeader.svelte";
  import AddMenu from "./features/workspace/AddMenu.svelte";
  import WorkspaceFilters from "./features/workspace/WorkspaceFilters.svelte";
  import FocusCounterBar from "./features/cards/FocusCounterBar.svelte";
  import { focusCounterState } from "./features/cards/focus-counter-state.svelte";
  import type { DailyCounterSummary } from "./lib/contracts/api.generated";
  import FocusScreen from "./features/workspace/screens/FocusScreen.svelte";
  import type { ProjectState } from "./features/workspace/screens/projects-board";

  import "./styles/workspace.css";
  // Kept directly after the workspace rules so their cascade order is unchanged.
  import "./styles/focus.css";
  import {
    createTarget,
    resolutionTarget,
    type EditorTarget,
    type CreateType,
  } from "./features/editor/editor-target";
  import type { CardCreate } from "./lib/contracts/api.generated";

  import { navigationState } from "./features/workspace/navigation-state.svelte";
  import { sessionState } from "./features/session/session.svelte";
  import { viewData } from "./features/workspace/view-data.svelte";
  import { onMount, onDestroy, untrack } from "svelte";
  import type { AgentActivity } from "./features/agent/agent-chat";

  onMount(motionEnvironment);
  import {
    viewQueryKey,
    viewSections,
    affectedSections,
    invalidatesTags,
    type ViewQuery,
  } from "./features/workspace/view-queries";

  import { isAbortError } from "./lib/api/read-requests";
  import { invalidateTagSuggestions } from "./features/tags/tag-suggestions";
  import {
    readRoute,
    primaryResource,
    viewLabel,
  } from "./features/workspace/navigation";

  import {
    applyHand,
    applyTheme,
    readHand,
    readTheme,
  } from "./features/settings/appearance";
  import DateViews from "./features/planning/DateViews.svelte";
  import {
    loadCalendarView,
    loadGanttView,
  } from "./features/planning/planning-components";
  import type {
    DateProposal,
    MoveProposal,
  } from "./features/planning/proposals";
  import type { Resource, Summary } from "./lib/api/api";
  import {
    rememberUser,
    rememberDefaultUser,
    selectedUserId,
  } from "./lib/api/user-selection";
  import { getProject } from "./lib/api/resources";
  import { loadEditorTarget } from "./features/editor/editor-opening";
  import {
    focusOrderState,
    focusReferenceKey,
  } from "./features/workspace/focus-order-state.svelte";

  const moveUI = deferredComponent(
    () => import("./features/board/MoveChange.svelte"),
  );
  const dateUI = deferredComponent(
    () => import("./features/planning/DateChange.svelte"),
  );
  const cardProjectUI = deferredComponent(
    () => import("./features/workspace/CreateCardProject.svelte"),
  );

  const registrationUI = deferredComponent(
    () => import("./features/registration/RegistrationBrowser.svelte"),
  );
  const RegistrationBrowser = $derived(registrationUI.component);
  const agentUI = deferredComponent(
    () => import("./features/agent/AgentChat.svelte"),
  );
  const AgentChat = $derived(agentUI.component);
  const editorUI = deferredComponent(
    () => import("./features/editor/Editor.svelte"),
  );
  const settingsUI = deferredComponent(
    () => import("./features/settings/Settings.svelte"),
  );
  const tagsUI = deferredComponent(
    () => import("./features/tags/TagManager.svelte"),
  );
  const newProjectUI = deferredComponent(
    () => import("./features/registration/NewProject.svelte"),
  );
  const deletionUI = deferredComponent(
    () => import("./features/registration/ProjectDeletion.svelte"),
  );
  const gitUI = deferredComponent(
    () => import("./features/host/GitObservation.svelte"),
  );
  const diagnosticsUI = deferredComponent(
    () => import("./features/host/Diagnostics.svelte"),
  );
  const updatesUI = deferredComponent(
    () => import("./features/workspace/screens/UpdatesScreen.svelte"),
  );
  const listUI = deferredComponent(
    () => import("./features/workspace/screens/ResourceListScreen.svelte"),
  );
  const chartUI = deferredComponent(
    () => import("./features/charts/ChartView.svelte"),
  );
  const overviewUI = deferredComponent(
    () => import("./features/workspace/screens/BoardOverview.svelte"),
  );
  const projectsUI = deferredComponent(
    () => import("./features/workspace/screens/ProjectsScreen.svelte"),
  );
  const projectMoveUI = deferredComponent(
    () => import("./features/workspace/ProjectStateChange.svelte"),
  );

  const routing = navigationState(
    readRoute(
      new URLSearchParams(location.search),
      new Date().toISOString().slice(0, 10),
    ),
    {
      today: () => today,
      hasEditor: () => !!editor,
      requestClose: () => {
        if (editorInstance) return editorInstance.requestClose();
        closeEditor();
        return true;
      },
      dialogsOpen: () =>
        !!(
          dateDraft ||
          moveDraft ||
          projectMove ||
          settings ||
          adding ||
          agentOpen ||
          creatingProject ||
          manageTags ||
          gitProject ||
          diagnostics ||
          projectDeletion ||
          choosingCardProject
        ),
      clearEditor: () => {
        setEditor(null);
      },
      loadResource: (target, signal) => {
        void editorUI.load();
        return loadEditorTarget(
          {
            project_id: target.project,
            type: target.type as Summary["type"],
            id: target.id,
          },
          signal,
        );
      },
      showResource: (_target, loaded) => {
        setEditor(loaded);
      },
      refresh: () => refresh(),
      error: message,
    },
  );
  const assignRoute = routing.assign;
  const restoreRoute = routing.restore;
  const keepEditing = routing.keepEditing;
  const historyNavigation = () => {
    if (boot) routing.fromHistory();
  };

  const session = sessionState({
    error: message,
    ended: sessionEnded,
    preferences: (value) => {
      weekStart = value.preferences.week_start ?? "monday";
    },
    foreground: async () => {
      if (routing.current.project) await getProject(routing.current.project);
      await refresh();
    },
    changes: (events) => {
      if (events.some(invalidatesTags)) invalidateTagSuggestions();
      const sections = [
        ...new Set(
          events.flatMap((event) => affectedSections(event, currentQuery())),
        ),
      ];
      if (sections.length) void refresh(sections).catch(message);
    },
  });
  const startPairing = () => {
    error = "";
    return session.startPairing();
  };
  const checkPairing = () => {
    error = "";
    return session.checkPairing(initialize);
  };
  async function initialize() {
    error = "";
    await session.initialize(async (preferences) => {
      const route = readRoute(
        new URLSearchParams(location.search),
        today,
        preferences.preferences.default_view ?? "focus",
      );
      assignRoute(route);
      await refresh();
      if (route.view !== "calendar" && route.view !== "gantt")
        void editorUI.load();
      if (!editor && route.resource)
        await open({
          project_id: route.resource.project,
          type: route.resource.type as Summary["type"],
          id: route.resource.id,
        });
    });
  }
  async function logout() {
    try {
      await session.logout();
      error = "";
    } catch (cause) {
      message(cause);
    }
  }

  const pairingUI = deferredComponent(
    () => import("./features/session/PairingScreen.svelte"),
  );
  const PairingScreen = $derived(pairingUI.component);
  $effect(() => {
    if (!boot && !loading) void pairingUI.load();
  });

  const data = viewData(currentQuery, () => !!boot, message);
  const refresh = data.refresh;
  const more = data.more;
  const moreAttention = data.moreAttention;

  onMount(() => {
    applyTheme(readTheme());
    applyHand(readHand());
    return observePreloadFailures();
  });

  let Board = $state<
    typeof import("./features/board/Board.svelte").default | null
  >(null);
  let boardLoadError = $state("");
  async function loadBoard() {
    boardLoadError = "";
    try {
      Board = (await import("./features/board/Board.svelte")).default;
    } catch {
      boardLoadError =
        "Nie udało się wczytać tablicy. Spróbuj ponownie lub odśwież stronę po zachowaniu otwartej wersji roboczej.";
    }
  }
  $effect(() => {
    if (routing.current.view === "board" && routing.current.project && !Board)
      void loadBoard();
  });
  $effect(() => {
    const view = routing.current.view;
    if (view === "calendar") void loadCalendarView().catch(() => {});
    if (view === "gantt") void loadGanttView().catch(() => {});
    if (view === "chart") void chartUI.load();
    if (view === "updates") void updatesUI.load();
    if (view === "list") void listUI.load();
    if (view === "projects") void projectsUI.load();
    if (view === "board") void overviewUI.load();
  });

  let dateDraft = $state<DateProposal | null>(null);
  let moveDraft = $state<MoveProposal | null>(null);
  let projectMove = $state<{
    item: Summary;
    state: ProjectState;
    settle: (saved: boolean) => void;
  } | null>(null);
  /** Closes a project move, unless a later one replaced it. */
  function settleProject(proposal: typeof projectMove, saved: boolean) {
    if (!proposal || projectMove !== proposal) return;
    const { settle } = proposal;
    projectMove = null;
    settle(saved);
    if (saved) void refresh(["projects"]).catch(message);
  }
  /** Closes a card move and tells the board that showed it how it ended. */
  function settleMove(saved: boolean) {
    const proposal = moveDraft;
    moveDraft = null;
    proposal?.onsettled?.(saved);
  }

  let manageTags = $state(false);

  let creatingProject = $state(false);

  let gitProject = $state("");

  let diagnostics = $state(false);
  let settings = $state(false);
  let registrationPending = $state(false);
  let boardDraft = $state(false);
  const viewRevision = $derived(data.state.revision);
  let weekStart = $state("monday");

  const attentionRows = $derived(data.state.attentionRows);
  const attentionCursor = $derived(data.state.attentionCursor);
  const attentionPaged = $derived(data.state.attentionPaged);
  const pageHistory = $derived(data.state.pageHistory);
  const pageCursors = $derived(data.state.pageCursors);

  const queryNotice = $derived(data.state.queryNotice);
  const sectionNotices = $derived(data.state.sectionNotices);
  const projectionMessage = $derived(
    [
      ...new Set(
        viewSections(currentQuery())
          .map((section) => sectionNotices[section])
          .filter(Boolean),
      ),
    ].join(" "),
  );

  const loadedQueryKey = $derived(data.state.loadedQueryKey);
  let clockTime = $state(Date.now());
  const loadingMore = $derived(data.state.loadingMore);
  const focusCards = $derived(data.state.focusCards);
  const boot = $derived(session.boot);
  // Browser-local chart choices belong to one instance and profile.
  const preferenceKey = $derived(
    boot ? `${boot.instance_id}:${boot.user?.id ?? "default"}` : "",
  );
  const pairing = $derived(session.pairing);

  const projects = $derived(data.state.projects);
  const cards = $derived(data.state.cards);
  const updates = $derived(data.state.updates);
  const focus = $derived(data.state.focus);
  const counterEditing = focusCounterState(
    () => !!boot,
    () => {
      data.invalidate();
      void refresh().catch(message);
    },
  );
  let counterBar: FocusCounterBar | undefined = $state();
  function editFocusCounter(
    item: Summary,
    counter: DailyCounterSummary,
    value: number,
    focus = false,
  ) {
    counterEditing.controller.edit(item, counter, value);
    if (focus) void counterBar?.focusValue();
  }
  function dismissFocusCounter() {
    const rejected = counterEditing.snapshot.rejected;
    counterEditing.controller.dismiss();
    if (rejected) {
      data.invalidate();
      void refresh().catch(message);
    }
  }
  const focusOrder = focusOrderState({
    allowed: () => !!boot,
    items: () => focus,
    version: () => data.state.focusVersion,
    revision: () => data.state.focusRevision,
    invalidate: () => data.invalidate(),
    refresh: (sections) => refresh(sections),
    failed: message,
  });
  const orderedFocusCards = $derived.by(() => {
    const summaries = new Map(
      focusCards.map((item) => [
        `${item.project_id}:${item.id}`,
        counterEditing.present(item, today),
      ]),
    );
    return focusOrder.items.map((item): Summary => {
      return (
        summaries.get(focusReferenceKey(item)) ?? {
          type: "card",
          project_id: item.project_id,
          id: item.card_id,
          title: "Niedostępna przypięta karta",
          version: "",
          availability: "unavailable",
        }
      );
    });
  });

  let error = $state("");
  const loading = $derived(session.loading);
  const connected = $derived(session.connected);
  const busy = $derived(session.busy);
  let editorInstance = $state<{ requestClose: () => boolean }>();

  // A target is replaced, never edited; the editor owns the reactive draft.
  let editor = $state.raw<EditorTarget | null>(null);
  function setEditor(next: EditorTarget | null) {
    editor?.opening?.cancel();
    editor = next;
  }
  onDestroy(() => editor?.opening?.cancel());
  // Keep the editor instance and its queued draft alive when a write is acknowledged.
  let editorAcknowledgement = $state.raw<{
    target: EditorTarget;
    resource: Resource;
  } | null>(null);
  const editorResource = $derived(
    editorAcknowledgement?.target === editor
      ? editorAcknowledgement.resource
      : editor?.resource,
  );
  let adding = $state(false);
  let projectDeletion = $state<Summary | null>(null);
  // The floating Agent button, and the chat dialog that outlives its closing.
  let agentOpen = $state(false);
  let agentChat = $state<{ activity: AgentActivity; holds: boolean }>({
    activity: "",
    holds: false,
  });
  const agentEnabled = $derived(boot?.agent_enabled === true);

  let today = $derived(boot ? calendarToday(boot.timezone, clockTime) : "");
  function currentQuery(): ViewQuery {
    return {
      view: routing.current.view,
      project: routing.current.project,
      folder: routing.current.folder,
      search: routing.current.search,
      archived: routing.current.archived,
      status: routing.current.status,
      priority: routing.current.priority,
      label: routing.current.label,
    };
  }
  let queryKey = $derived(viewQueryKey(currentQuery()));
  const projectOverview = $derived(routing.current.view === "projects");
  // In Calendar the page action plans the new card on the day being shown.
  const scheduledCreate = $derived(
    routing.current.view === "calendar" &&
      !!routing.current.project &&
      !!routing.current.calendarDate,
  );
  let queryReady = $derived(loadedQueryKey === queryKey);
  function sessionEnded() {
    editor?.opening?.cancel();
    routing.reset();

    data.reset();

    adding = false;
    choosingCardProject = null;
    // Read-only dialogs hold no work. Owners of drafts and unresolved commands
    // stay mounted and are covered by the pairing layer until access returns.
    if (!agentChat.holds) agentOpen = false;
    diagnostics = false;
    gitProject = "";
    error = "Sesja wygasła. Połącz tę przeglądarkę ponownie, aby kontynuować.";
  }
  function commandWarning(event: Event) {
    const warnings = (event as CustomEvent<{ code: string; message: string }[]>)
      .detail;
    error = warnings.map((item) => serverMessage(item.code)).join(" ");
  }
  function message(e: unknown) {
    if (isAbortError(e)) return;
    error = errorMessage(e);
  }

  async function open(item: Pick<Summary, "type" | "id" | "project_id">) {
    error = "";
    await routing.openResource({
      project: item.project_id,
      type: item.type,
      id: item.id,
    });
  }

  let choosingCardProject = $state<Summary[] | null>(null);
  function create(
    type: CreateType,
    initialMetadata: Partial<CardCreate> = {},
    autoCreate = false,
  ) {
    let project = routing.current.project;
    if (routing.current.view === "focus" || !project) {
      const candidates = projects.filter(
        (p) =>
          p.availability === "ready" &&
          (!routing.current.folder || p.folder === routing.current.folder),
      );
      if (candidates.length > 1) {
        choosingCardProject = candidates;
        return;
      }
      project = candidates[0]?.id ?? "";
    }
    if (!project) {
      error = "Wybierz projekt przed utworzeniem elementu.";
      return;
    }
    routing.startDraft();
    setEditor(createTarget(project, type, initialMetadata, autoCreate));
  }
  async function saved() {
    setEditor(null);
    if (routing.pending) await restoreRoute(routing.pending);
    else await refresh().catch(message);
  }
  function autosaved(target: EditorTarget, resource: Resource) {
    if (editor !== target) return;
    editorAcknowledgement = { target, resource };
    void refresh().catch(message);
  }
  async function deleted() {
    const removed = editor;
    const removedResource = editorResource;
    const next = routing.pending;
    setEditor(null);
    if (next) {
      const destination = new URLSearchParams(next);
      if (
        destination.get("project") === removed?.project &&
        destination.get("type") === "card" &&
        destination.get("resource") === removedResource?.metadata.id
      ) {
        destination.delete("type");
        destination.delete("resource");
      }
      await restoreRoute(destination);
    } else {
      routing.assign({ ...routing.current, resource: undefined });
      await refresh().catch(message);
    }
  }
  function deleteProject(project: Summary) {
    projectDeletion = project;
  }
  async function projectDeleted(id: string) {
    projectDeletion = null;
    const route = routing.current;
    if (route.project === id || route.resource?.project === id) {
      routing.assign({
        ...route,
        view: "projects",
        project: "",
        resource: undefined,
      });
    }
    await refresh(["projects"]).catch(message);
  }
  function addProject() {
    creatingProject = true;
  }
  /** Either add-project dialog registered a project: show it. */
  function projectAdded(id: string) {
    creatingProject = false;
    routing.showProject(id);
    void refresh().catch(message);
  }

  function closeEditor() {
    setEditor(null);
    if (routing.pending) void restoreRoute(routing.pending);
  }

  $effect(() => {
    if (!boot || loading || routing.restoring) return;
    routing.sync(
      editor && editorResource
        ? {
            project: editor.project,
            type: editor.type,
            id: editorResource.metadata.id,
          }
        : undefined,
    );
  });
  const queryScopeKey = $derived(
    viewQueryKey({ ...currentQuery(), search: "" }),
  );
  let previousQueryScope = "";
  $effect(() => {
    const requestedQuery = queryKey;
    const scope = queryScopeKey;
    const searchOnly = previousQueryScope === scope;
    previousQueryScope = scope;
    if (
      !boot ||
      loading ||
      routing.restoring ||
      untrack(() => loadedQueryKey === requestedQuery)
    )
      return;
    untrack(() => {
      data.invalidate();
    });
    if (searchOnly) {
      const timer = setTimeout(() => void refresh().catch(message), 200);
      return () => clearTimeout(timer);
    }
    untrack(() => void refresh().catch(message));
    return undefined;
  });
  $effect(() => {
    if (adding) void registrationUI.load();
  });
  // Load the chat so a conversation in progress resumes after a reload.
  $effect(() => {
    if (agentEnabled) void agentUI.load();
  });
  // Warm the most common action after the first view has rendered. Opening a
  // resource also starts this import alongside its read, without waiting here.
  $effect(() => {
    if (!boot || loading) return;
    const timer = setTimeout(() => void editorUI.load(), 150);
    return () => clearTimeout(timer);
  });
  const canSwitchUser = $derived(
    !(
      editor ||
      dateDraft ||
      moveDraft ||
      projectMove ||
      adding ||
      agentChat.holds ||
      creatingProject ||
      manageTags ||
      projectDeletion ||
      registrationPending ||
      boardDraft ||
      focusOrder.unresolved ||
      counterEditing.snapshot.draft ||
      counterEditing.snapshot.pending
    ),
  );
  function switchUser(id: string) {
    if (!canSwitchUser) return;
    rememberUser(id);
    location.assign(location.pathname);
  }
  function openDefaultUser() {
    if (!canSwitchUser) return;
    try {
      rememberDefaultUser();
      location.assign(location.pathname);
    } catch (cause) {
      message(cause);
    }
  }
  onMount(() => {
    const clockTimer = setInterval(() => {
      clockTime = Date.now();
      if (
        boot &&
        routing.current.view === "focus" &&
        document.visibilityState === "visible"
      )
        void refresh(["focus", "attention", "card", "event"]).catch(message);
    }, 60_000);
    window.addEventListener("popstate", historyNavigation);
    window.addEventListener("command-warning", commandWarning);
    // The Focus order guards itself; the counter controller is framework-
    // independent and has no guard of its own.
    const leaving = (event: BeforeUnloadEvent) => {
      if (
        projectMove ||
        counterEditing.snapshot.draft ||
        counterEditing.snapshot.pending
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    void initialize();
    return () => {
      clearInterval(clockTimer);
      data.invalidate();
      window.removeEventListener("popstate", historyNavigation);
      window.removeEventListener("command-warning", commandWarning);
      window.removeEventListener("beforeunload", leaving);
    };
  });
</script>

<svelte:head><title>Astra</title></svelte:head>
{#if !boot}
  {#if PairingScreen}
    <PairingScreen
      {pairing}
      {loading}
      {busy}
      {error}
      bind:device={session.device}
      {startPairing}
      {checkPairing}
      onrestart={session.restartPairing}
      ondiagnostics={() => (diagnostics = true)}
      ondefaultuser={selectedUserId() && canSwitchUser
        ? openDefaultUser
        : undefined}
    />
  {:else}
    <main class="welcome">
      <p role="status">Sprawdzanie połączenia…</p>
      {#if pairingUI.error}
        <p class="notice" role="alert">{pairingUI.error}</p>
        <Button onclick={() => void pairingUI.load()}>Spróbuj ponownie</Button>
        <Button onclick={() => location.reload()}>Odśwież aplikację</Button>
      {/if}
    </main>
  {/if}
{:else}
  <div class="app" class:counter-editing={!!counterEditing.snapshot.draft}>
    <WorkspaceNavigation
      view={routing.current.view}
      {connected}
      {logout}
      onchange={routing.selectView}
    />
    <div class="workspace">
      <WorkspaceHeader
        userName={boot.user?.name ?? "Właściciel"}
        defaultUser={boot.user?.is_default ?? true}
        project={routing.current.project}
        {projects}
        selectable={!projectOverview}
        focus={["focus", "projects"].includes(routing.current.view)}
        folder={routing.current.folder}
        onfolderchange={(folder) => routing.changeFilters({ folder })}
        {today}
        onprojectchange={(project) => routing.changeFilters({ project })}
        ongit={() => (gitProject = routing.current.project)}
        ondiagnostics={() => (diagnostics = true)}
        onsettings={() => (settings = true)}
        onrefresh={() => refresh().catch(message)}
        {logout}
      />
      <main class="content floating-content">
        {#if routing.current.view === "focus"}
          <h1 class="sr">Focus</h1>
        {:else if routing.current.view !== "chart"}
          <PageHeading title={viewLabel(routing.current.view)}>
            <Button
              variant="primary"
              title={scheduledCreate
                ? "Nowa karta zaplanowana na wybrany dzień"
                : undefined}
              onclick={projectOverview
                ? addProject
                : scheduledCreate
                  ? () =>
                      create("card", {
                        schedule: {
                          start: routing.current.calendarDate,
                          end: routing.current.calendarDate,
                        },
                      })
                  : () => create(primaryResource(routing.current.view))}
              ><Icon name="plus" small />{projectOverview
                ? "Dodaj projekt"
                : routing.current.view === "updates"
                  ? "Dodaj aktualizację"
                  : "Dodaj kartę"}</Button
            >
          </PageHeading>
        {/if}
        {#if error}<div class="notice">
            <span role="alert">{error}</span><Button
              variant="quiet"
              onclick={() => (error = "")}
              aria-label="Zamknij komunikat błędu"
              ><Icon name="close" small /></Button
            >
          </div>{/if}
        {#if !connected}<div class="connection">
            Trwa przywracanie połączenia. Wersje robocze pozostają otwarte;
            sprawdź wynik przerwanego zapisu.
          </div>{/if}
        {#if projectionMessage}<p role="status" class="notice">
            {projectionMessage}
          </p>{/if}
        {#if queryNotice}<p role="status" class="notice">{queryNotice}</p>{/if}
        {#if routing.current.view !== "chart"}<WorkspaceFilters
            route={routing.current}
            onchange={routing.changeFilters}
            changeMonth={routing.changeMonth}
          />{/if}
        {#key routing.current.view}<div
            class="view-content"
            use:revealScene={{
              ...(routing.current.view === "projects"
                ? { distance: "0px" }
                : {}),
              ready:
                queryReady &&
                !["calendar", "gantt", "chart"].includes(
                  routing.current.view,
                ) &&
                !(routing.current.view === "board" && routing.current.project),
              key: routing.current.project,
            }}
          >
            {#if (!queryReady || (projectionMessage && !projects.length)) && ["focus", "list", "updates", "projects"].includes(routing.current.view)}
              <div class="empty" role="status">Ładowanie danych…</div>
            {:else if routing.current.view === "focus"}
              <FocusScreen
                {today}
                timezone={boot?.timezone ?? "UTC"}
                now={clockTime}
                counterState={counterEditing.snapshot}
                oncounter={editFocusCounter}
                route={routing.current}
                {projects}
                {cards}
                events={data.state.events}
                eventCursor={pageCursors.event ?? null}
                eventPaged={(pageHistory.event?.length ?? 0) > 1}
                moreEvents={(back = false) => more("event", back)}
                focusCards={orderedFocusCards}
                order={focusOrder}
                {attentionRows}
                {attentionCursor}
                {attentionPaged}
                activeCardCursor={pageCursors.card ?? null}
                activeCardPaged={(pageHistory.card?.length ?? 0) > 1}
                {loadingMore}
                {open}
                {moreAttention}
                moreActiveCards={(back = false) => more("card", back)}
              />
            {:else if routing.current.view === "projects"}
              <DeferredView
                source={projectsUI}
                loading="Ładowanie projektów…"
                retry="Ponów ładowanie projektów"
                quiet
              >
                {#snippet children(ProjectsScreen)}<ProjectsScreen
                    route={routing.current}
                    {projects}
                    {open}
                    {addProject}
                    onremove={deleteProject}
                    disabled={!!projectMove || !!editor || !connected}
                    onmove={(item, state, settle) => {
                      if (projectMove) settle(false);
                      else projectMove = { item, state, settle };
                    }}
                  />{/snippet}
              </DeferredView>
            {:else if routing.current.view === "board" && routing.current.project}{#if Board}{#key routing.current.project}<Board
                    project={routing.current.project}
                    search={routing.current.search}
                    revision={viewRevision}
                    {open}
                    onpropose={(proposal) => (moveDraft = proposal)}
                    oncreate={create}
                    ondraftchange={(value) => (boardDraft = value)}
                  />{/key}{:else if boardLoadError}<p>
                  <span role="alert">{boardLoadError}</span>
                  <button onclick={loadBoard}>Ponów ładowanie tablicy</button>
                </p>{:else}<p role="status">Ładowanie tablicy…</p>{/if}
            {:else if routing.current.view === "board"}
              <DeferredView
                source={overviewUI}
                loading="Ładowanie tablicy…"
                quiet
              >
                {#snippet children(BoardOverview)}<BoardOverview
                    route={routing.current}
                    {projects}
                    {cards}
                    {open}
                  />{/snippet}
              </DeferredView>
            {:else if routing.current.view === "calendar" || routing.current.view === "gantt"}<DateViews
                project={routing.current.project}
                month={routing.current.month}
                view={routing.current.view}
                revision={viewRevision}
                {weekStart}
                calendarDate={routing.current.calendarDate}
                calendarLayout={routing.current.calendarLayout}
                workspaceToday={today}
                workspaceTimezone={session.timezone}
                onCalendarNavigate={routing.navigateCalendar}
                search={routing.current.search}
                {open}
                writePending={!!dateDraft}
                onpropose={(proposal) => {
                  if (!dateDraft) dateDraft = proposal;
                }}
                oncreate={(initial) => create("card", initial)}
              />
            {:else if routing.current.view === "chart"}
              <DeferredView
                source={chartUI}
                loading="Ładowanie wykresu…"
                retry="Ponów ładowanie wykresu"
                quiet
              >
                {#snippet children(ChartView)}<ChartView
                    project={routing.current.project}
                    {today}
                    revision={viewRevision}
                    {preferenceKey}
                    {open}
                  />{/snippet}
              </DeferredView>
            {:else if routing.current.view === "updates"}
              <DeferredView
                source={updatesUI}
                loading="Ładowanie aktualizacji…"
              >
                {#snippet children(UpdatesScreen)}<UpdatesScreen
                    route={routing.current}
                    {projects}
                    {updates}
                    {open}
                  />{/snippet}
              </DeferredView>
            {:else}
              <DeferredView source={listUI} loading="Ładowanie listy…">
                {#snippet children(ResourceListScreen)}<ResourceListScreen
                    route={routing.current}
                    {projects}
                    {cards}
                    {open}
                  />{/snippet}
              </DeferredView>
            {/if}
          </div>{/key}
        <div class="floating-actions">
          <AddMenu
            agent={agentEnabled}
            activity={agentChat.activity}
            onchoose={(choice) => {
              if (choice === "agent") agentOpen = true;
              else if (choice === "project") addProject();
              else create("card");
            }}
          />
        </div>
        {#if queryReady && ["board", "list", "updates"].includes(routing.current.view) && (routing.current.view !== "board" || !routing.current.project)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : "card"}{#if pageCursors[kind]}<div class="sectiontitle">
              <span>Dostępne są kolejne dane.</span><button
                disabled={loadingMore}
                onclick={() => more(kind)}>Następna strona</button
              >
            </div>{/if}{/if}
        {#if queryReady && ["list", "updates"].includes(routing.current.view)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : "card"}{#if (pageHistory[kind]?.length ?? 0) > 1}<button
              disabled={loadingMore}
              onclick={() => more(kind, true)}>Poprzednia strona</button
            >{/if}{/if}
      </main>
    </div>
  </div>
{/if}
{#if choosingCardProject}{@const candidates = choosingCardProject}<DeferredHost
    source={cardProjectUI}
    title="Dodaj kartę"
    onclose={() => (choosingCardProject = null)}
  >
    {#snippet children(CreateCardProject)}<CreateCardProject
        projects={candidates}
        onclose={() => (choosingCardProject = null)}
        onselect={(project) => {
          choosingCardProject = null;
          routing.startDraft();
          setEditor(createTarget(project, "card"));
        }}
      />{/snippet}
  </DeferredHost>{/if}
{#if dateDraft}{@const proposal = dateDraft}<DeferredHost
    source={dateUI}
    title="Zmień daty"
    onclose={() => (dateDraft = null)}
  >
    {#snippet children(DateChange)}{#key proposal}<DateChange
          {...proposal}
          onclose={() => (dateDraft = null)}
          onsaved={() => {
            dateDraft = null;
            void refresh().catch(message);
          }}
        />{/key}{/snippet}
  </DeferredHost>{/if}
{#if moveDraft}{@const proposal = moveDraft}<DeferredHost
    source={moveUI}
    title="Przenieś kartę"
    onclose={() => settleMove(false)}
  >
    {#snippet children(MoveChange)}{#key proposal}<MoveChange
          {...proposal}
          onclose={() => settleMove(false)}
          onsaved={() => {
            settleMove(true);
            void refresh().catch(message);
          }}
        />{/key}{/snippet}
  </DeferredHost>{/if}
{#if projectMove}{@const proposal = projectMove}<DeferredHost
    source={projectMoveUI}
    title="Przenieś projekt"
    onclose={() => settleProject(proposal, false)}
  >
    {#snippet children(ProjectStateChange)}{#key proposal}<ProjectStateChange
          item={proposal.item}
          state={proposal.state}
          onclose={() => settleProject(proposal, false)}
          onsaved={() => settleProject(proposal, true)}
        />{/key}{/snippet}
  </DeferredHost>{/if}
{#if gitProject}<DeferredHost
    source={gitUI}
    title="Stan Git"
    onclose={() => (gitProject = "")}
  >
    {#snippet children(GitObservation)}<GitObservation
        project={gitProject}
        onclose={() => (gitProject = "")}
      />{/snippet}
  </DeferredHost>{/if}
{#if diagnostics}<DeferredHost
    source={diagnosticsUI}
    foreground={!boot}
    title="Diagnostyka"
    onclose={() => (diagnostics = false)}
  >
    {#snippet children(Diagnostics)}<Diagnostics
        foreground={!boot}
        onclose={() => (diagnostics = false)}
      />{/snippet}
  </DeferredHost>{/if}
{#if settings}<DeferredHost
    source={settingsUI}
    title="Ustawienia przestrzeni roboczej"
    onclose={() => (settings = false)}
  >
    {#snippet children(Settings)}<Settings
        {canSwitchUser}
        {agentEnabled}
        onuserchange={switchUser}
        ontags={() => {
          manageTags = true;
        }}
        onclose={() => (settings = false)}
        onsaved={() => {
          settings = false;
          void initialize();
        }}
      />{/snippet}
  </DeferredHost>{/if}
{#if manageTags}<DeferredHost
    source={tagsUI}
    title="Tagi projektu"
    onclose={() => (manageTags = false)}
  >
    {#snippet children(TagManager)}<TagManager
        initialProject={routing.current.project}
        projectNames={Object.fromEntries(
          projects.map((item) => [item.id, item.title]),
        )}
        onclose={() => (manageTags = false)}
        onchanged={() => void refresh().catch(message)}
      />{/snippet}
  </DeferredHost>{/if}
{#if editor}{@const editorTarget = editor}<DeferredHost
    source={editorUI}
    title="Edytuj element"
    onclose={closeEditor}
  >
    {#snippet children(Editor)}{#key editorTarget}<Editor
          workspaceTimezone={session.timezone}
          userName={boot?.user?.name ?? "Właściciel"}
          {weekStart}
          target={editorTarget}
          bind:this={editorInstance}
          onclose={closeEditor}
          onkeepediting={() => {
            if (routing.pending) keepEditing();
          }}
          onchanged={() => refresh().catch(message)}
          onresolve={(decision) => {
            routing.startDraft();
            setEditor(resolutionTarget(editorTarget.project, decision));
          }}
          onsaved={() => void saved()}
          onautosaved={(resource) => autosaved(editorTarget, resource)}
          ondeleted={() => void deleted()}
        />{/key}{/snippet}
  </DeferredHost>{/if}
{#if projectDeletion}{@const project = projectDeletion}<DeferredHost
    source={deletionUI}
    title="Usuń projekt"
    onclose={() => (projectDeletion = null)}
  >
    {#snippet children(ProjectDeletion)}<ProjectDeletion
        {project}
        onclose={() => (projectDeletion = null)}
        ondeleted={projectDeleted}
      />{/snippet}
  </DeferredHost>{/if}
<!-- Keep the registration identity alive while its dialog is closed. -->
{#if RegistrationBrowser}<RegistrationBrowser
    bind:open={adding}
    onpendingchange={(value) => (registrationPending = value)}
    onregistered={projectAdded}
  />{:else if adding}<DeferredDialog
    title="Dodaj projekt"
    error={registrationUI.error}
    retry={registrationUI.load}
    onclose={() => {
      adding = false;
    }}
  />{/if}

<!-- Keep the conversation alive while its dialog is closed. -->
{#if AgentChat}<AgentChat
    bind:open={agentOpen}
    view={routing.current.view}
    project={routing.current.project}
    userId={boot?.user?.id ?? ""}
    onstate={(state) => (agentChat = state)}
    onsettings={() => (settings = true)}
  />{:else if agentOpen}<DeferredDialog
    title="Agent"
    error={agentUI.error}
    retry={agentUI.load}
    onclose={() => {
      agentOpen = false;
    }}
  />{/if}

{#if creatingProject}<DeferredHost
    source={newProjectUI}
    title="Dodaj projekt"
    onclose={() => (creatingProject = false)}
  >
    {#snippet children(NewProject)}<NewProject
        onclose={() => (creatingProject = false)}
        onbrowse={() => {
          creatingProject = false;
          adding = true;
        }}
        onadded={projectAdded}
      />{/snippet}
  </DeferredHost>{/if}

<FocusCounterBar
  bind:this={counterBar}
  snapshot={counterEditing.snapshot}
  connected={!!boot}
  {today}
  onchange={(value) => counterEditing.controller.setValue(value)}
  onsave={() => counterEditing.controller.save()}
  onretry={() => counterEditing.controller.resolve(false)}
  oncheck={() => counterEditing.controller.resolve(true)}
  oncancel={dismissFocusCounter}
/>
