<script lang="ts">
  import WorkspaceNavigation from "./features/workspace/WorkspaceNavigation.svelte";
  import WorkspaceHeader from "./features/workspace/WorkspaceHeader.svelte";
  import WorkspaceFilters from "./features/workspace/WorkspaceFilters.svelte";
  import FocusScreen from "./features/workspace/screens/FocusScreen.svelte";
  import ProjectsScreen from "./features/workspace/screens/ProjectsScreen.svelte";
  import BoardOverview from "./features/workspace/screens/BoardOverview.svelte";
  import UpdatesScreen from "./features/workspace/screens/UpdatesScreen.svelte";
  import ResourceListScreen from "./features/workspace/screens/ResourceListScreen.svelte";
  import "./styles/workspace.css";
  import {
    editTarget,
    createTarget,
    type EditorTarget,
    type CreateType,
  } from "./features/editor/editor-target";
  import type { CardCreate } from "./lib/contracts/api.generated";
  import PairingScreen from "./features/session/PairingScreen.svelte";
  import { navigationState } from "./features/workspace/navigation-state.svelte";
  import { sessionState } from "./features/session/session.svelte";
  import { viewData } from "./features/workspace/view-data.svelte";
  import { onMount, untrack } from "svelte";
  import {
    viewQueryKey,
    viewSections,
    affectedSections,
    invalidatesTags,
    type ViewQuery,
  } from "./features/workspace/view-queries";

  import { isAbortError } from "./lib/api/read-requests";
  import { invalidateTagSuggestions } from "./features/tags/tag-suggestions";
  import { readRoute, primaryResource } from "./features/workspace/navigation";

  import { applyTheme, readTheme } from "./features/settings/appearance";
  import RegistrationBrowser from "./features/registration/RegistrationBrowser.svelte";
  import DateChange from "./features/planning/DateChange.svelte";
  import MoveChange from "./features/board/MoveChange.svelte";
  import type {
    DateProposal,
    MoveProposal,
  } from "./features/planning/proposals";
  import Editor from "./features/editor/Editor.svelte";
  import Settings from "./features/settings/Settings.svelte";
  import TagManager from "./features/tags/TagManager.svelte";
  import NativeProject from "./features/registration/NativeProject.svelte";
  import FocusOrder from "./features/workspace/FocusOrder.svelte";
  import GitObservation from "./features/host/GitObservation.svelte";
  import Diagnostics from "./features/host/Diagnostics.svelte";
  import type { Summary } from "./lib/api/api";
  import { getResource, getProject } from "./lib/api/resources";

  const routing = navigationState(
    readRoute(
      new URLSearchParams(location.search),
      new Date().toISOString().slice(0, 10),
    ),
    {
      today: () => today,
      hasEditor: () => !!editor,
      requestClose: () => editorInstance?.requestClose() ?? false,
      dialogsOpen: () =>
        !!(
          dateDraft ||
          moveDraft ||
          settings ||
          adding ||
          nativeAdding ||
          arrangeFocus ||
          manageTags ||
          gitProject ||
          diagnostics
        ),
      clearEditor: () => {
        editor = null;
      },
      loadResource: (target) =>
        getResource({
          project_id: target.project,
          type: target.type as Summary["type"],
          id: target.id,
        }),
      showResource: (target, resource) => {
        editor = editTarget(target.project, resource);
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
      weekStart = preferences.preferences.week_start ?? "monday";
      await refresh();
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

  const data = viewData(currentQuery, () => !!boot, message);
  const refresh = data.refresh;
  const more = data.more;
  const moreAttention = data.moreAttention;

  onMount(() => applyTheme(readTheme()));

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
        "The board could not be loaded. Retry, or reload after preserving any open draft.";
    }
  }
  $effect(() => {
    if (routing.current.view === "board" && routing.current.project && !Board)
      void loadBoard();
  });

  let dateDraft = $state<DateProposal | null>(null);
  let moveDraft = $state<MoveProposal | null>(null);

  let manageTags = $state(false);

  let nativeAdding = $state(false);

  let arrangeFocus = $state(false);

  let gitProject = $state("");

  let diagnostics = $state(false);
  let settings = $state(false);
  let DateViews = $state<
    typeof import("./features/planning/DateViews.svelte").default | null
  >(null);
  const viewRevision = $derived(data.state.revision);
  let weekStart = $state("monday");
  let dateViewLoadError = $state("");
  async function loadDateViews() {
    dateViewLoadError = "";
    try {
      DateViews = (await import("./features/planning/DateViews.svelte"))
        .default;
    } catch {
      dateViewLoadError =
        "The planning view could not be loaded. Retry, or reload after preserving any open draft.";
    }
  }
  $effect(() => {
    if (
      (routing.current.view === "calendar" ||
        routing.current.view === "gantt") &&
      !DateViews
    )
      void loadDateViews();
  });

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
  const pairing = $derived(session.pairing);

  const projects = $derived(data.state.projects);
  const cards = $derived(data.state.cards);
  const milestones = $derived(data.state.milestones);
  const updates = $derived(data.state.updates);
  const focus = $derived(data.state.focus);

  let error = $state("");
  const loading = $derived(session.loading);
  const connected = $derived(session.connected);
  const busy = $derived(session.busy);
  let editorInstance = $state<{ requestClose: () => boolean }>();

  let editor = $state<EditorTarget | null>(null);
  let adding = $state(false);

  let today = $derived(
    boot
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: boot.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(clockTime)
      : "",
  );
  function currentQuery(): ViewQuery {
    return {
      view: routing.current.view,
      project: routing.current.project,
      search: routing.current.search,
      collection: routing.current.collection,
      archived: routing.current.archived,
      status: routing.current.status,
      priority: routing.current.priority,
      label: routing.current.label,
    };
  }
  let queryKey = $derived(viewQueryKey(currentQuery()));
  let queryReady = $derived(loadedQueryKey === queryKey);
  let selectedProject = $derived(
    projects.find((p) => p.id === routing.current.project),
  );
  function sessionEnded() {
    invalidateTagSuggestions(false);
    routing.reset();

    data.reset();

    adding = false;
    error = "Your session ended. Reconnect this browser to continue.";
  }
  function commandWarning(event: Event) {
    const warnings = (event as CustomEvent<{ code: string; message: string }[]>)
      .detail;
    error = warnings.map((item) => item.message || item.code).join(" ");
  }
  function message(e: unknown) {
    if (isAbortError(e)) return;
    error = e instanceof Error ? e.message : String(e);
  }

  async function open(item: Pick<Summary, "type" | "id" | "project_id">) {
    error = "";
    await routing.openResource({
      project: item.project_id,
      type: item.type,
      id: item.id,
    });
  }

  function create(
    type: CreateType,
    initialMetadata: Partial<CardCreate> = {},
    autoCreate = false,
  ) {
    if (!routing.current.project) {
      error = "Select a project before creating a resource.";
      return;
    }
    routing.startDraft();
    editor = createTarget(
      routing.current.project,
      type,
      initialMetadata,
      autoCreate,
    );
  }
  async function saved() {
    editor = null;
    if (routing.pending) await restoreRoute(routing.pending);
    else await refresh().catch(message);
  }
  function addProject() {
    nativeAdding = true;
  }

  function closeEditor() {
    editor = null;
    if (routing.pending) void restoreRoute(routing.pending);
  }

  $effect(() => {
    if (!boot || loading || routing.restoring) return;
    routing.sync(
      editor?.resource
        ? {
            project: editor.project,
            type: editor.type,
            id: editor.resource.metadata.id,
          }
        : undefined,
    );
  });
  $effect(() => {
    const requestedQuery = queryKey;
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
    const timer = setTimeout(() => {
      void requestedQuery;
      void refresh().catch(message);
    }, 200);
    return () => clearTimeout(timer);
  });
  onMount(() => {
    const clockTimer = setInterval(() => (clockTime = Date.now()), 60_000);
    window.addEventListener("popstate", historyNavigation);
    window.addEventListener("command-warning", commandWarning);
    void initialize();
    return () => {
      clearInterval(clockTimer);
      data.invalidate();
      window.removeEventListener("popstate", historyNavigation);
      window.removeEventListener("command-warning", commandWarning);
    };
  });
</script>

<svelte:head
  ><title>Local Projects</title><meta
    name="theme-color"
    content="#f5f5ef"
  /></svelte:head
>
{#if !boot}
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
  />
{:else}
  <div class="app">
    <WorkspaceNavigation
      view={routing.current.view}
      {connected}
      {logout}
      onchange={routing.selectView}
    />
    <div class="workspace">
      <WorkspaceHeader
        project={routing.current.project}
        projectName={selectedProject?.title}
        {today}
        ongit={() => (gitProject = routing.current.project)}
        ondiagnostics={() => (diagnostics = true)}
        onsettings={() => (settings = true)}
        onrefresh={() => refresh().catch(message)}
        {logout}
      />
      <main class="content">
        <div class="heading">
          <div>
            <p class="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
            <h1>
              {routing.current.view === "focus"
                ? "Make room for what matters."
                : routing.current.view === "gantt"
                  ? "The bigger picture."
                  : routing.current.view === "projects"
                    ? "Your projects."
                    : routing.current.view === "updates"
                      ? "The latest from your work."
                      : routing.current.view[0].toUpperCase() +
                        routing.current.view.slice(1) +
                        "."}
            </h1>
            <p>
              {routing.current.view === "focus"
                ? "Your focus and the things that need a decision."
                : routing.current.view === "projects"
                  ? "Real folders. Shared context. One place to see progress."
                  : routing.current.view === "calendar"
                    ? "Planned work, deadlines and reviews — kept distinct."
                    : routing.current.view === "gantt"
                      ? "See the sequence, connect cards and understand the finish date."
                      : "Keep the next step visible."}
            </p>
          </div>
          <button
            class="primary"
            onclick={routing.current.view === "projects"
              ? addProject
              : () =>
                  create(
                    primaryResource(
                      routing.current.view,
                      routing.current.collection,
                    ),
                  )}
            >＋ {routing.current.view === "projects"
              ? "Add project"
              : `Add ${primaryResource(routing.current.view, routing.current.collection)}`}</button
          >
        </div>
        {#if error}<div class="notice" role="alert">
            {error}<button
              class="quiet"
              onclick={() => (error = "")}
              aria-label="Dismiss error">✕</button
            >
          </div>{/if}
        {#if !connected}<div class="connection">
            Connection is recovering. Drafts remain open; verify the result of
            any interrupted save.
          </div>{/if}
        {#if projectionMessage}<p role="status" class="notice">
            {projectionMessage}
          </p>{/if}
        {#if queryNotice}<p role="status" class="notice">{queryNotice}</p>{/if}
        <WorkspaceFilters
          route={routing.current}
          {projects}
          onchange={routing.changeFilters}
          changeMonth={routing.changeMonth}
        />
        {#if (!queryReady || (projectionMessage && !projects.length)) && ["list", "updates", "projects"].includes(routing.current.view)}
          <div class="empty" role="status">Loading resources…</div>
        {:else if routing.current.view === "focus"}
          <FocusScreen
            route={routing.current}
            {projects}
            {cards}
            {milestones}
            {focusCards}
            focusCount={focus.length}
            {attentionRows}
            {attentionCursor}
            {attentionPaged}
            {loadingMore}
            {open}
            onarrange={() => (arrangeFocus = true)}
            {moreAttention}
          />
        {:else if routing.current.view === "projects"}
          <ProjectsScreen
            route={routing.current}
            {projects}
            {cards}
            {updates}
            {open}
            {addProject}
          />
        {:else if routing.current.view === "board" && routing.current.project}{#if Board}{#key routing.current.project}<Board
                project={routing.current.project}
                search={routing.current.search}
                revision={viewRevision}
                {open}
                onpropose={(proposal) => (moveDraft = proposal)}
                oncreate={create}
              />{/key}{:else if boardLoadError}<p role="alert">
              {boardLoadError}
              <button onclick={loadBoard}>Retry loading board</button>
            </p>{:else}<p role="status">Loading board…</p>{/if}
        {:else if routing.current.view === "board"}
          <BoardOverview route={routing.current} {projects} {cards} {open} />
        {:else if routing.current.view === "calendar" || routing.current.view === "gantt"}{#if DateViews}<DateViews
              project={routing.current.project}
              month={routing.current.month}
              view={routing.current.view}
              revision={viewRevision}
              {weekStart}
              calendarDate={routing.current.calendarDate}
              calendarLayout={routing.current.calendarLayout}
              workspaceToday={today}
              onCalendarNavigate={routing.navigateCalendar}
              search={routing.current.search}
              {open}
              onpropose={(proposal) => (dateDraft = proposal)}
              oncreate={(schedule) => create("card", { schedule })}
            />{:else if dateViewLoadError}<p role="alert">
              {dateViewLoadError}
              <button onclick={loadDateViews}
                >Retry loading planning view</button
              >
            </p>{:else}<p role="status">Loading date views…</p>{/if}
        {:else if routing.current.view === "updates"}
          <UpdatesScreen route={routing.current} {projects} {updates} {open} />
        {:else}
          <ResourceListScreen
            route={routing.current}
            {projects}
            {cards}
            {milestones}
            {open}
          />
        {/if}
        {#if queryReady && ["board", "list", "updates"].includes(routing.current.view) && (routing.current.view !== "board" || !routing.current.project)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : routing.current.view === "list" &&
                  routing.current.collection === "milestones"
                ? "milestone"
                : "card"}{#if pageCursors[kind]}<div class="sectiontitle">
              <span>More resources are available.</span><button
                disabled={loadingMore}
                onclick={() => more(kind)}>Next page</button
              >
            </div>{/if}{/if}
        {#if queryReady && ["list", "updates"].includes(routing.current.view)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : routing.current.collection === "milestones"
                ? "milestone"
                : "card"}{#if (pageHistory[kind]?.length ?? 0) > 1}<button
              disabled={loadingMore}
              onclick={() => more(kind, true)}>Previous page</button
            >{/if}{/if}
        <footer class="pagefooter">
          Your files are the source of truth. <span>Local Projects · v0.1</span>
        </footer>
      </main>
    </div>
  </div>
{/if}
{#if dateDraft}{#key dateDraft}<DateChange
      {...dateDraft}
      onclose={() => (dateDraft = null)}
      onsaved={() => {
        dateDraft = null;
        void refresh().catch(message);
      }}
    />{/key}{/if}
{#if moveDraft}{#key moveDraft}<MoveChange
      {...moveDraft}
      onclose={() => (moveDraft = null)}
      onsaved={() => {
        moveDraft = null;
        void refresh().catch(message);
      }}
    />{/key}{/if}
{#if gitProject}<GitObservation
    project={gitProject}
    onclose={() => (gitProject = "")}
  />{/if}
{#if diagnostics}<Diagnostics onclose={() => (diagnostics = false)} />{/if}
{#if settings}<Settings
    ontags={() => {
      settings = false;
      manageTags = true;
    }}
    onclose={() => (settings = false)}
    onsaved={() => {
      settings = false;
      void initialize();
    }}
  />{/if}
{#if manageTags}<TagManager
    projectNames={Object.fromEntries(
      projects.map((item) => [item.id, item.title]),
    )}
    onclose={() => (manageTags = false)}
    onchanged={() => void refresh().catch(message)}
  />{/if}
{#if editor}{#key editor}<Editor
      target={editor}
      bind:this={editorInstance}
      onclose={closeEditor}
      onkeepediting={() => {
        if (routing.pending) keepEditing();
      }}
      onchanged={() => refresh().catch(message)}
      onsaved={() => void saved()}
    />{/key}{/if}
<!-- Keep the registration identity alive while its dialog is closed. -->
<RegistrationBrowser
  bind:open={adding}
  onregistered={async (id) => {
    routing.showProject(id);
    await refresh().catch(message);
  }}
/>

{#if arrangeFocus}<FocusOrder
    cards={focusCards}
    onclose={() => (arrangeFocus = false)}
    onsaved={() => {
      arrangeFocus = false;
      void refresh().catch(message);
    }}
  />{/if}

{#if nativeAdding}<NativeProject
    onclose={() => (nativeAdding = false)}
    onbrowse={() => {
      nativeAdding = false;
      adding = true;
    }}
    onadded={(id) => {
      nativeAdding = false;
      routing.showProject(id);
      void refresh().catch(message);
    }}
  />{/if}
