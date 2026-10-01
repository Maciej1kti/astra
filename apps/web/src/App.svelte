<script lang="ts">
  import PageHeading from "./lib/ui/PageHeading.svelte";
  import { viewLabel } from "./features/workspace/navigation";
  import Button from "./lib/ui/Button.svelte";
  import DeferredDialog from "./lib/ui/DeferredDialog.svelte";
  import { deferredComponent } from "./lib/ui/deferred-component.svelte";
  import { observePreloadFailures } from "./lib/ui/preload-recovery";

  import WorkspaceNavigation from "./features/workspace/WorkspaceNavigation.svelte";
  import WorkspaceHeader from "./features/workspace/WorkspaceHeader.svelte";
  import WorkspaceFilters from "./features/workspace/WorkspaceFilters.svelte";
  import CreateCardProject from "./features/workspace/CreateCardProject.svelte";
  import FocusCounterBar from "./features/cards/FocusCounterBar.svelte";
  import { focusCounterState } from "./features/cards/focus-counter-state.svelte";
  import type { DailyCounterSummary } from "./lib/contracts/api.generated";
  import FocusScreen from "./features/workspace/screens/FocusScreen.svelte";
  import ProjectsScreen from "./features/workspace/screens/ProjectsScreen.svelte";
  import BoardOverview from "./features/workspace/screens/BoardOverview.svelte";
  import UpdatesScreen from "./features/workspace/screens/UpdatesScreen.svelte";
  import ResourceListScreen from "./features/workspace/screens/ResourceListScreen.svelte";
  import "./styles/workspace.css";
  import {
    createTarget,
    resolutionTarget,
    type EditorTarget,
    type CreateType,
  } from "./features/editor/editor-target";
  import type { CardCreate } from "./lib/contracts/api.generated";
  import PairingScreen from "./features/session/PairingScreen.svelte";
  import { navigationState } from "./features/workspace/navigation-state.svelte";
  import { sessionState } from "./features/session/session.svelte";
  import { viewData } from "./features/workspace/view-data.svelte";
  import { onMount, onDestroy, untrack } from "svelte";
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
  import DateChange from "./features/planning/DateChange.svelte";
  import DateViews from "./features/planning/DateViews.svelte";
  import {
    loadCalendarView,
    loadGanttView,
  } from "./features/planning/planning-components";
  import MoveChange from "./features/board/MoveChange.svelte";
  import type {
    DateProposal,
    MoveProposal,
  } from "./features/planning/proposals";
  import { apiCode, type Resource, type Summary } from "./lib/api/api";
  import { getProject, replaceFocus } from "./lib/api/resources";
  import { loadEditorTarget } from "./features/editor/editor-opening";
  import type { FocusRef, FocusResource } from "./lib/contracts/api.generated";
  import { commandOperation } from "./lib/api/command-operation.svelte";

  const registrationUI = deferredComponent(
    () => import("./features/registration/RegistrationBrowser.svelte"),
  );
  const RegistrationBrowser = $derived(registrationUI.component);
  const editorUI = deferredComponent(
    () => import("./features/editor/Editor.svelte"),
  );
  const Editor = $derived(editorUI.component);
  const settingsUI = deferredComponent(
    () => import("./features/settings/Settings.svelte"),
  );
  const Settings = $derived(settingsUI.component);
  const tagsUI = deferredComponent(
    () => import("./features/tags/TagManager.svelte"),
  );
  const TagManager = $derived(tagsUI.component);
  const nativeUI = deferredComponent(
    () => import("./features/registration/NativeProject.svelte"),
  );
  const NativeProject = $derived(nativeUI.component);
  const deletionUI = deferredComponent(
    () => import("./features/registration/ProjectDeletion.svelte"),
  );
  const ProjectDeletion = $derived(deletionUI.component);
  const gitUI = deferredComponent(
    () => import("./features/host/GitObservation.svelte"),
  );
  const GitObservation = $derived(gitUI.component);
  const diagnosticsUI = deferredComponent(
    () => import("./features/host/Diagnostics.svelte"),
  );
  const Diagnostics = $derived(diagnosticsUI.component);

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
          settings ||
          adding ||
          nativeAdding ||
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

  const data = viewData(currentQuery, () => !!boot, message);
  const refresh = data.refresh;
  const more = data.more;
  const moreAttention = data.moreAttention;

  onMount(() => {
    applyTheme(readTheme());
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
        "The board could not be loaded. Retry, or reload after preserving any open draft.";
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
  });

  let dateDraft = $state<DateProposal | null>(null);
  let moveDraft = $state<MoveProposal | null>(null);

  let manageTags = $state(false);

  let nativeAdding = $state(false);

  let gitProject = $state("");

  let diagnostics = $state(false);
  let settings = $state(false);
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
  const focusCommand = commandOperation(() => !!boot);
  let focusProposal = $state<FocusRef[] | null>(null);
  let focusProposalVersion = $state("");
  let focusAcknowledged = $state<Pick<
    FocusResource,
    "items" | "version"
  > | null>(null);
  let focusAcknowledgedRevision = 0;
  let focusError = $state("");
  let focusCopyMessage = $state("");
  let focusConflict = $state(false);
  let focusReloading = $state(false);
  const focusPending = $derived(focusCommand.pending);
  const focusBusy = $derived(focusCommand.busy);
  const focusOrder = $derived(
    focusProposal ?? focusAcknowledged?.items ?? focus,
  );
  const orderedFocusCards = $derived.by(() => {
    const summaries = new Map(
      focusCards.map((item) => [
        `${item.project_id}:${item.id}`,
        counterEditing.present(item, today),
      ]),
    );
    return focusOrder.map((item): Summary => {
      return (
        summaries.get(focusReferenceKey(item)) ?? {
          type: "card",
          project_id: item.project_id,
          id: item.card_id,
          title: "Unavailable pinned card",
          version: "",
          availability: "unavailable",
        }
      );
    });
  });
  const focusVersion = $derived(
    focusProposal
      ? focusProposalVersion
      : (focusAcknowledged?.version ?? data.state.focusVersion),
  );
  const focusCanRetry = $derived(
    !!focusProposal &&
      focusCommand.phase === "rejected" &&
      !focusConflict &&
      !focusReloading,
  );
  const focusCanReload = $derived(
    focusConflict ||
      (!!focusAcknowledged && !focusAcknowledged.version) ||
      (!!focusProposal && focusCommand.phase === "rejected"),
  );

  $effect(() => {
    const acknowledged = focusAcknowledged;
    if (acknowledged && data.state.focusRevision > focusAcknowledgedRevision)
      focusAcknowledged = null;
  });

  function focusReferenceKey(item: Pick<FocusRef, "project_id" | "card_id">) {
    return `${item.project_id}:${item.card_id}`;
  }

  function reorderFocus(
    visible: Summary[],
    fullOrder: FocusRef[],
    expectedVersion: string,
  ) {
    if (
      !expectedVersion ||
      focusProposal ||
      focusCommand.pending ||
      focusCommand.busy ||
      focusConflict ||
      focusReloading
    )
      return;
    const reorderedVisible = visible.map(({ project_id, id }) => ({
      project_id,
      card_id: id,
    }));
    const slots = new Set(reorderedVisible.map(focusReferenceKey));
    let next = 0;
    const proposed = fullOrder.map((item) =>
      slots.has(focusReferenceKey(item)) ? reorderedVisible[next++] : item,
    );
    if (
      JSON.stringify(proposed) === JSON.stringify(fullOrder) ||
      next !== reorderedVisible.length
    )
      return;

    focusError = "";
    focusConflict = false;
    focusCopyMessage = "";
    focusProposal = proposed;
    focusProposalVersion = expectedVersion;
    data.invalidate();
    focusCommand.prepare(replaceFocus({ items: proposed }, expectedVersion));
    void transmitFocus();
  }

  async function transmitFocus() {
    if (!focusProposal || focusCommand.busy || !focusCommand.pending) return;
    focusError = "";
    try {
      const reply = await focusCommand.commit();
      const committed: Pick<FocusResource, "items" | "version"> = {
        items: focusProposal.map((item) => ({ ...item })),
        version: reply.result.version ?? "",
      };
      data.invalidate();
      focusAcknowledged = committed;
      focusAcknowledgedRevision = data.state.focusRevision;
      focusProposal = null;
      focusProposalVersion = "";
      focusConflict = false;
      void refresh().catch(message);
    } catch (cause) {
      focusError = cause instanceof Error ? cause.message : String(cause);
      focusConflict =
        focusCommand.phase === "rejected" &&
        apiCode(cause) === "VERSION_CONFLICT";
    }
  }

  function retryFocus() {
    void transmitFocus();
  }

  async function copyFocusCommand() {
    const pending = focusCommand.pending;
    if (!pending || !focusProposal) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            items: focusProposal,
            expected_version: focusProposalVersion,
            request_id: pending.requestId,
            epoch: pending.epoch,
          },
          null,
          2,
        ),
      );
      focusCopyMessage = "Pending focus command copied.";
    } catch {
      focusCopyMessage =
        "Clipboard access is unavailable. The request ID and order remain below.";
    }
  }

  function retryRejectedFocus() {
    if (!focusProposal || !focusCanRetry) return;
    focusError = "";
    focusCommand.prepare(
      replaceFocus({ items: focusProposal }, focusProposalVersion),
    );
    void transmitFocus();
  }

  async function reloadFocus() {
    if (!focusCanReload || focusCommand.pending || focusReloading) return;
    focusReloading = true;
    focusError = "";
    data.invalidate();
    try {
      await refresh(["focus"]);
      focusProposal = null;
      focusProposalVersion = "";
      focusAcknowledged = null;
      focusConflict = false;
    } catch (cause) {
      focusError = `The current focus order could not be reloaded: ${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      focusReloading = false;
    }
  }

  let error = $state("");
  const loading = $derived(session.loading);
  const connected = $derived(session.connected);
  const busy = $derived(session.busy);
  let editorInstance = $state<{ requestClose: () => boolean }>();

  let editor = $state<EditorTarget | null>(null);
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
      ? editorAcknowledgement?.resource
      : editor?.resource,
  );
  let adding = $state(false);
  let projectDeletion = $state<Summary | null>(null);

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
      folder: routing.current.folder,
      search: routing.current.search,
      archived: routing.current.archived,
      status: routing.current.status,
      priority: routing.current.priority,
      label: routing.current.label,
    };
  }
  let queryKey = $derived(viewQueryKey(currentQuery()));
  let queryReady = $derived(loadedQueryKey === queryKey);
  function sessionEnded() {
    editor?.opening?.cancel();
    invalidateTagSuggestions(false);
    routing.reset();

    data.reset();

    adding = false;
    choosingCardProject = null;
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

  let choosingCardProject = $state<Summary[] | null>(null);
  function create(
    type: CreateType,
    initialMetadata: Partial<CardCreate> = {},
    autoCreate = false,
  ) {
    let project = routing.current.project;
    if (routing.current.view === "focus") {
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
      error = "Select a project before creating a resource.";
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
    nativeAdding = true;
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
  });
  $effect(() => {
    if (adding) void registrationUI.load();
  });
  $effect(() => {
    if (editor) void editorUI.load();
  });
  $effect(() => {
    if (settings) void settingsUI.load();
  });
  $effect(() => {
    if (manageTags) void tagsUI.load();
  });
  $effect(() => {
    if (nativeAdding) void nativeUI.load();
  });
  $effect(() => {
    if (projectDeletion) void deletionUI.load();
  });
  $effect(() => {
    if (gitProject) void gitUI.load();
  });
  $effect(() => {
    if (diagnostics) void diagnosticsUI.load();
  });
  // Warm the most common action after the first view has rendered. Opening a
  // resource also starts this import alongside its read, without waiting here.
  $effect(() => {
    if (!boot || loading) return;
    const timer = setTimeout(() => void editorUI.load(), 150);
    return () => clearTimeout(timer);
  });
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
    const leaving = (event: BeforeUnloadEvent) => {
      if (
        focusProposal ||
        focusCommand.pending ||
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
  <div class="app" class:counter-editing={!!counterEditing.snapshot.draft}>
    <WorkspaceNavigation
      view={routing.current.view}
      {connected}
      {logout}
      onchange={routing.selectView}
    />
    <div class="workspace">
      <WorkspaceHeader
        project={routing.current.project}
        {projects}
        selectable={routing.current.view !== "projects"}
        focus={routing.current.view === "focus"}
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
      <main
        class="content"
        class:focus-content={routing.current.view === "focus"}
      >
        {#if routing.current.view === "focus"}
          <h1 class="sr">Focus</h1>
        {:else}
          <PageHeading title={viewLabel(routing.current.view)}>
            <Button
              variant="primary"
              onclick={routing.current.view === "projects"
                ? addProject
                : () => create(primaryResource(routing.current.view))}
              >＋ {routing.current.view === "projects"
                ? "Add project"
                : `Add ${primaryResource(routing.current.view)}`}</Button
            >
          </PageHeading>
        {/if}
        {#if error}<div class="notice" role="alert">
            {error}<Button
              variant="quiet"
              onclick={() => (error = "")}
              aria-label="Dismiss error">✕</Button
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
          onchange={routing.changeFilters}
          changeMonth={routing.changeMonth}
        />
        {#key routing.current.view}<div class="view-content">
            {#if (!queryReady || (projectionMessage && !projects.length)) && ["focus", "list", "updates", "projects"].includes(routing.current.view)}
              <div class="empty" role="status">Loading resources…</div>
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
                focusCount={focusOrder.length}
                {focusOrder}
                {focusVersion}
                focusPending={!!focusPending}
                {focusBusy}
                {focusConflict}
                focusRefreshing={focusReloading}
                {focusError}
                {focusCopyMessage}
                {focusCanRetry}
                {focusCanReload}
                focusRequestId={focusPending?.requestId ?? ""}
                {attentionRows}
                {attentionCursor}
                {attentionPaged}
                activeCardCursor={pageCursors.card ?? null}
                activeCardPaged={(pageHistory.card?.length ?? 0) > 1}
                {loadingMore}
                {open}
                onreorder={reorderFocus}
                onretry={retryFocus}
                onretrynew={retryRejectedFocus}
                onreload={reloadFocus}
                oncopycommand={copyFocusCommand}
                {moreAttention}
                moreActiveCards={(back = false) => more("card", back)}
              />
            {:else if routing.current.view === "projects"}
              <ProjectsScreen
                route={routing.current}
                {projects}
                {cards}
                {updates}
                {open}
                {addProject}
                onremove={deleteProject}
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
              <BoardOverview
                route={routing.current}
                {projects}
                {cards}
                {open}
              />
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
            {:else if routing.current.view === "updates"}
              <UpdatesScreen
                route={routing.current}
                {projects}
                {updates}
                {open}
              />
            {:else}
              <ResourceListScreen
                route={routing.current}
                {projects}
                {cards}
                {open}
              />
            {/if}
          </div>{/key}
        {#if routing.current.view === "focus"}
          <Button
            variant="primary"
            class="focus-add-action"
            onclick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              create("card");
            }}>＋ Add card</Button
          >
        {/if}
        {#if queryReady && ["board", "list", "updates"].includes(routing.current.view) && (routing.current.view !== "board" || !routing.current.project)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : "card"}{#if pageCursors[kind]}<div class="sectiontitle">
              <span>More resources are available.</span><button
                disabled={loadingMore}
                onclick={() => more(kind)}>Next page</button
              >
            </div>{/if}{/if}
        {#if queryReady && ["list", "updates"].includes(routing.current.view)}{@const kind =
            routing.current.view === "updates"
              ? "update"
              : "card"}{#if (pageHistory[kind]?.length ?? 0) > 1}<button
              disabled={loadingMore}
              onclick={() => more(kind, true)}>Previous page</button
            >{/if}{/if}
      </main>
    </div>
  </div>
{/if}
{#if choosingCardProject}<CreateCardProject
    projects={choosingCardProject}
    onclose={() => (choosingCardProject = null)}
    onselect={(project) => {
      choosingCardProject = null;
      routing.startDraft();
      setEditor(createTarget(project, "card"));
    }}
  />{/if}
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
{#if gitProject}{#if GitObservation}<GitObservation
      project={gitProject}
      onclose={() => (gitProject = "")}
    />{:else}<DeferredDialog
      title="Git status"
      error={gitUI.error}
      retry={gitUI.load}
      onclose={() => {
        gitProject = "";
      }}
    />{/if}{/if}
{#if diagnostics}{#if Diagnostics}<Diagnostics
      onclose={() => (diagnostics = false)}
    />{:else}<DeferredDialog
      title="Diagnostics"
      error={diagnosticsUI.error}
      retry={diagnosticsUI.load}
      onclose={() => {
        diagnostics = false;
      }}
    />{/if}{/if}
{#if settings}{#if Settings}<Settings
      ontags={() => {
        manageTags = true;
      }}
      onclose={() => (settings = false)}
      onsaved={() => {
        settings = false;
        void initialize();
      }}
    />{:else}<DeferredDialog
      title="Workspace settings"
      error={settingsUI.error}
      retry={settingsUI.load}
      onclose={() => {
        settings = false;
      }}
    />{/if}{/if}
{#if manageTags}{#if TagManager}<TagManager
      initialProject={routing.current.project ??
        routing.current.resource?.project ??
        ""}
      projectNames={Object.fromEntries(
        projects.map((item) => [item.id, item.title]),
      )}
      onclose={() => (manageTags = false)}
      onchanged={() => void refresh().catch(message)}
    />{:else}<DeferredDialog
      title="Project tags"
      error={tagsUI.error}
      retry={tagsUI.load}
      onclose={() => {
        manageTags = false;
      }}
    />{/if}{/if}
{#if editor}{#if Editor}{#key editor}{@const editorTarget = editor}<Editor
        workspaceTimezone={session.timezone}
        {weekStart}
        target={editor}
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
      />{/key}{:else}<DeferredDialog
      title="Edit resource"
      error={editorUI.error}
      retry={editorUI.load}
      onclose={() => {
        closeEditor();
      }}
    />{/if}{/if}
{#if projectDeletion}{#if ProjectDeletion}<ProjectDeletion
      project={projectDeletion}
      onclose={() => (projectDeletion = null)}
      ondeleted={projectDeleted}
    />{:else}<DeferredDialog
      title="Delete project"
      error={deletionUI.error}
      retry={deletionUI.load}
      onclose={() => {
        projectDeletion = null;
      }}
    />{/if}{/if}
<!-- Keep the registration identity alive while its dialog is closed. -->
{#if RegistrationBrowser}<RegistrationBrowser
    bind:open={adding}
    onregistered={async (id) => {
      routing.showProject(id);
      await refresh().catch(message);
    }}
  />{:else if adding}<DeferredDialog
    title="Add project"
    error={registrationUI.error}
    retry={registrationUI.load}
    onclose={() => {
      adding = false;
    }}
  />{/if}

{#if nativeAdding}{#if NativeProject}<NativeProject
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
    />{:else}<DeferredDialog
      title="Add project"
      error={nativeUI.error}
      retry={nativeUI.load}
      onclose={() => {
        nativeAdding = false;
      }}
    />{/if}{/if}

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
