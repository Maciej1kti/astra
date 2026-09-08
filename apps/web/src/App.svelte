<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import ResourceMetadata from "./lib/ResourceMetadata.svelte";
  import { resourceLabel } from "./lib/resource-presentation";
  import {
    readRoute,
    writeRoute,
    searchOnlyNavigation,
    primaryResource,
    workspaceViews,
    type View,
    type WorkspaceRoute,
  } from "./lib/navigation";
  import type { CalendarLayout } from "./lib/planning-navigation";
  import { applyTheme, readTheme } from "./lib/appearance";
  onMount(() => applyTheme(readTheme()));
  import { modal } from "./lib/dialog";
  let Board = $state<typeof import("./lib/Board.svelte").default | null>(null);
  $effect(() => {
    if (view === "board" && project)
      void import("./lib/Board.svelte")
        .then((module) => (Board = module.default))
        .catch(message);
  });
  import DateChange from "./lib/DateChange.svelte";
  import MoveChange from "./lib/MoveChange.svelte";
  import type { DateProposal, MoveProposal } from "./lib/proposals";
  let dateDraft = $state<DateProposal | null>(null),
    moveDraft = $state<MoveProposal | null>(null);
  import Editor from "./lib/Editor.svelte";
  import Settings from "./lib/Settings.svelte";
  import NativeProject from "./lib/NativeProject.svelte";
  let nativeAdding = $state(false);
  import FocusOrder from "./lib/FocusOrder.svelte";
  let arrangeFocus = $state(false);
  import GitObservation from "./lib/GitObservation.svelte";
  let gitProject = $state("");
  import Diagnostics from "./lib/Diagnostics.svelte";
  let diagnostics = $state(false);
  let settings = $state(false);
  let DateViews = $state<
    typeof import("./lib/DateViews.svelte").default | null
  >(null);
  let viewRevision = $state(0),
    weekStart = $state("monday");
  $effect(() => {
    if (view === "calendar" || view === "gantt")
      void import("./lib/DateViews.svelte").then(
        (module) => (DateViews = module.default),
      );
  });
  import {
    api,
    all,
    configure,
    command,
    send,
    resourcePath,
    ApiError,
    type Bootstrap,
    type Summary,
    type Resource,
    type Pending,
  } from "./lib/api";
  type Pairing = {
    id: string;
    challenge: string;
    state: string;
    pending_csrf_token: string;
    device_label: string;
  };
  type Attention = {
    id: string;
    project_id: string;
    target: { type: "project" | "card" | "milestone"; id: string };
    reason: string;
    label: string;
    date?: string;
  };
  let registrationPending = $state<Pending | null>(null),
    registrationJob = $state<string | null>(null);
  let attentionRows = $state<Attention[]>([]),
    attentionCursor = $state<string | null>(null),
    attentionPaged = $state(false);
  let pageHistory = $state<Record<string, (string | null)[]>>({});
  let pageCursors = $state<Record<string, string | null>>({});
  let unreadOnly = $state(false);
  let refreshGeneration = 0;
  let navigationGeneration = 0;
  let loadedQueryKey = $state("");
  let clockTime = $state(Date.now());
  let loadingMore = $state(false);
  let focusCards = $state<Summary[]>([]);
  type Root = { id: string; label: string; display_path: string };
  let boot = $state<Bootstrap | null>(null),
    pairing = $state<Pairing | null>(null),
    device = $state("My browser");
  let projects = $state<Summary[]>([]),
    cards = $state<Summary[]>([]),
    milestones = $state<Summary[]>([]),
    updates = $state<Summary[]>([]),
    focus = $state<{ project_id: string; card_id: string }[]>([]);
  const initialRoute = readRoute(
    new URLSearchParams(location.search),
    new Date().toISOString().slice(0, 10),
  );
  let view = $state<View>(initialRoute.view),
    project = $state(initialRoute.project),
    search = $state(initialRoute.search),
    collection = $state<"cards" | "milestones">(initialRoute.collection),
    archived = $state(initialRoute.archived),
    statusFilter = $state(initialRoute.status),
    priorityFilter = $state(initialRoute.priority),
    labelFilter = $state(initialRoute.label),
    calendarDate = $state(initialRoute.calendarDate),
    calendarLayout = $state<CalendarLayout>(initialRoute.calendarLayout),
    error = $state(""),
    loading = $state(true),
    connected = $state(false),
    busy = $state(false);
  let editorInstance = $state<{ requestClose: () => boolean }>();
  let navElement = $state<HTMLElement>();
  let restoringRoute = $state(false);
  let lastRouteUrl = location.pathname + location.search;
  let routeReady = false;
  let pendingNavigation: URLSearchParams | null = null;
  let editor = $state<{
      project: string;
      type: string;
      resource: Resource | null;
      initialMetadata?: Record<string, unknown>;
      autoCreate?: boolean;
    } | null>(null),
    adding = $state(false),
    roots = $state<Root[]>([]),
    root = $state(""),
    relative = $state(""),
    projectName = $state(""),
    tracked = $state(false),
    plan = $state<{
      plan_id: string;
      project_id: string;
      display_path: string;
      changes: { path: string; action: string; description: string }[];
      warnings: { message: string }[];
    } | null>(null);
  let browsing = $state(false),
    directoryReady = $state(false),
    directoryCursor = $state<string | null>(null),
    directoryPaged = $state(false);
  let browseGeneration = 0;
  let directories = $state<
    { name: string; relative_path: string; registered: boolean }[]
  >([]);
  let month = $state(initialRoute.month);
  let source: EventSource | undefined,
    refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const views = workspaceViews;
  const statuses = ["planned", "active", "review", "done", "cancelled"];
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
  let filtered = $derived(
    cards.filter(
      (c) =>
        (!project || c.project_id === project) &&
        (view === "list" ? !!c.archived === archived : !c.archived) &&
        (view === "list" ||
          c.title.toLowerCase().includes(search.trim().toLowerCase())),
    ),
  );
  let visibleUpdates = $derived(
    updates.filter(
      (c) => (!project || c.project_id === project) && (!unreadOnly || !c.read),
    ),
  );
  let queryKey = $derived(
    JSON.stringify([
      view,
      project,
      search,
      collection,
      view === "list" && archived,
      view === "list" && statusFilter,
      view === "list" && priorityFilter,
      view === "list" && labelFilter,
    ]),
  );
  let queryReady = $derived(loadedQueryKey === queryKey);
  let selectedProject = $derived(projects.find((p) => p.id === project));
  let visibleFocus = $derived(
    focusCards.filter(
      (item) =>
        (!project || item.project_id === project) &&
        !item.archived &&
        item.title.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  let attention = $derived.by(() => {
    const grouped = new Map<string, Attention & { reasons: string[] }>();
    for (const item of attentionRows) {
      if (
        (project && item.project_id !== project) ||
        !item.label.toLowerCase().includes(search.trim().toLowerCase())
      )
        continue;
      const key = `${item.project_id}:${item.target.type}:${item.target.id}`;
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.reasons.includes(item.reason))
          existing.reasons.push(item.reason);
      } else grouped.set(key, { ...item, reasons: [item.reason] });
    }
    return [...grouped.values()];
  });
  function sessionEnded() {
    refreshGeneration++;
    navigationGeneration++;
    pendingNavigation = null;
    restoringRoute = false;
    routeReady = false;
    loadedQueryKey = "";
    clearTimeout(refreshTimer);
    source?.close();
    boot = null;
    connected = false;
    projects = [];
    cards = [];
    milestones = [];
    updates = [];
    focus = [];
    focusCards = [];
    attentionRows = [];
    roots = [];
    directories = [];
    browseGeneration++;
    directoryReady = false;
    adding = false;
    error = "Your session ended. Reconnect this browser to continue.";
  }
  function commandWarning(event: Event) {
    const warnings = (event as CustomEvent<{ code: string; message: string }[]>)
      .detail;
    error = warnings.map((item) => item.message || item.code).join(" ");
  }
  function message(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  async function initialize() {
    loading = true;
    error = "";
    try {
      boot = await api<Bootstrap>("/api/v1/bootstrap");
      configure(boot);
      window.dispatchEvent(new Event("session-restored"));
      const preferences = await api<{
        preferences: { default_view?: View; week_start?: string };
      }>("/api/v1/workspace/preferences");
      const route = readRoute(
        new URLSearchParams(location.search),
        today,
        preferences.preferences.default_view ?? "focus",
      );
      assignRoute(route);
      weekStart = preferences.preferences.week_start ?? "monday";
      await refresh();
      connect();
      if (!editor && route.resource)
        await open({
          project_id: route.resource.project,
          type: route.resource.type as Summary["type"],
          id: route.resource.id,
        });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        boot = null;
        projects = [];
        cards = [];
        milestones = [];
        updates = [];
        focus = [];
        try {
          pairing = await api<Pairing>("/api/v1/auth/pairings/current");
        } catch {
          pairing = null;
        }
      } else message(e);
    } finally {
      loading = false;
    }
  }

  async function attentionPage(cursor?: string | null) {
    return api<{ items: Attention[]; page: { next_cursor: string | null } }>(
      `/api/v1/views/attention?limit=200${project ? `&project_id=${project}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
  }
  async function moreAttention(first = false) {
    if (loadingMore) return;
    loadingMore = true;
    const generation = refreshGeneration;
    try {
      const result = await attentionPage(first ? null : attentionCursor);
      if (generation !== refreshGeneration) return;
      attentionRows = result.items;
      attentionCursor = result.page.next_cursor;
      attentionPaged = !first;
    } catch (e) {
      message(e);
    } finally {
      loadingMore = false;
    }
  }
  async function foreground() {
    if (document.visibilityState !== "visible" || !boot) return;
    try {
      const current = await api<Bootstrap>("/api/v1/bootstrap");
      configure(current);
      boot = current;
      if (project) await api(`/api/v1/projects/${project}`);
      await refresh();
    } catch (e) {
      message(e);
    }
  }
  async function resourcePage(type: string, cursor?: string | null) {
    const params = new URLSearchParams({ type, limit: "200" });
    if (["list", "updates"].includes(view) && search.trim())
      params.set("q", search.trim());
    if (project && view !== "projects") params.set("project_id", project);
    if (
      view === "list" &&
      type === (collection === "cards" ? "card" : "milestone")
    ) {
      if (statusFilter) params.set("status", statusFilter);
      if (type === "card") {
        if (archived) params.set("archived", "true");
        if (priorityFilter) params.set("priority", priorityFilter);
        if (labelFilter) params.set("label", labelFilter);
      }
    }
    if (cursor) params.set("cursor", cursor);
    return api<{ items: Summary[]; page: { next_cursor: string | null } }>(
      `/api/v1/views/list?${params}`,
    );
  }
  async function refresh() {
    const generation = ++refreshGeneration;
    const requestedQuery = queryKey;
    const [p, f, a, c, m, u] = await Promise.all([
      all("/api/v1/projects"),
      api<{ items: typeof focus }>("/api/v1/workspace/focus"),
      attentionPage(),
      resourcePage("card"),
      resourcePage("milestone"),
      resourcePage("update"),
    ]);
    const pinned: Summary[] = [];
    // Focus is bounded by the workspace contract; do not scan archives to resolve it.
    for (const ref of f.items) {
      const cached = c.items.find(
        (item) => item.id === ref.card_id && item.project_id === ref.project_id,
      );
      if (cached) pinned.push(cached);
      else {
        try {
          const resource = await api<Resource>(
            resourcePath({
              type: "card",
              id: ref.card_id,
              project_id: ref.project_id,
            }),
          );
          pinned.push({
            ...resource.metadata,
            type: "card",
            id: ref.card_id,
            project_id: ref.project_id,
            version: resource.version,
            availability: "available",
          } as Summary);
        } catch {
          pinned.push({
            type: "card",
            id: ref.card_id,
            project_id: ref.project_id,
            title: "Unavailable pinned card",
            version: "",
            availability: "unavailable",
          });
        }
      }
    }
    if (generation !== refreshGeneration) return;
    loadedQueryKey = requestedQuery;
    viewRevision++;
    focusCards = pinned;
    projects = p;
    focus = f.items;
    attentionRows = a.items;
    attentionCursor = a.page.next_cursor;
    attentionPaged = false;
    cards = c.items;
    milestones = m.items;
    updates = u.items;
    pageHistory = { card: [null], milestone: [null], update: [null] };
    pageCursors = {
      card: c.page.next_cursor,
      milestone: m.page.next_cursor,
      update: u.page.next_cursor,
    };
  }
  async function more(type: string, back = false) {
    if (
      loadingMore ||
      (!back && !pageCursors[type]) ||
      (back && (pageHistory[type]?.length ?? 0) < 2)
    )
      return;
    loadingMore = true;
    const generation = refreshGeneration;
    try {
      const history = pageHistory[type] ?? [null];
      const target = back ? history[history.length - 2] : pageCursors[type];
      const next = await resourcePage(type, target);
      if (generation !== refreshGeneration) return;
      pageHistory[type] = back ? history.slice(0, -1) : [...history, target];
      if (type === "card") cards = next.items;
      else if (type === "milestone") milestones = next.items;
      else updates = next.items;
      pageCursors[type] = next.page.next_cursor;
    } catch (e) {
      message(e);
    } finally {
      loadingMore = false;
    }
  }
  function connect() {
    source?.close();
    if (!boot) return;
    source = new EventSource(
      `/api/v1/events?cursor=${encodeURIComponent(boot.snapshot_cursor)}`,
    );
    source.onopen = () => (connected = true);
    source.onerror = () => {
      connected = false;
      // A closed stream may be a network outage or a revoked session. Probe once;
      // the API layer distinguishes 401 without discarding drafts on a timeout.
      void api("/api/v1/bootstrap").catch(() => {});
    };
    for (const kind of [
      "changed",
      "health_changed",
      "resync_required",
      "workspace_changed",
    ])
      source.addEventListener(kind, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void refresh().catch(message);
        }, 150);
      });
  }
  async function startPairing() {
    busy = true;
    error = "";
    try {
      pairing = await api<Pairing>("/api/v1/auth/pairings", "POST", {
        device_label: device,
      });
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function checkPairing() {
    busy = true;
    error = "";
    try {
      pairing = await api<Pairing>("/api/v1/auth/pairings/current");
      if (pairing.state === "approved" || pairing.state === "claimed") {
        await api(
          "/api/v1/auth/pairings/claim",
          "POST",
          {},
          { "X-CSRF-Token": pairing.pending_csrf_token },
        );
        await initialize();
      }
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function open(item: Pick<Summary, "type" | "id" | "project_id">) {
    const generation = ++navigationGeneration;
    const requestedView = view,
      requestedProject = project;
    error = "";
    try {
      const resource = await api<Resource>(resourcePath(item));
      if (
        generation !== navigationGeneration ||
        view !== requestedView ||
        project !== requestedProject
      )
        return;
      editor = {
        project: item.project_id,
        type: item.type,
        resource,
      };
    } catch (e) {
      if (generation === navigationGeneration && view === requestedView && project === requestedProject) message(e);
    }
  }
  function create(
    type: string,
    initialMetadata: Record<string, unknown> = {},
    autoCreate = false,
  ) {
    if (!project) {
      error = "Select a project before creating a resource.";
      return;
    }
    navigationGeneration++;
    editor = { project, type, resource: null, initialMetadata, autoCreate };
  }
  async function saved() {
    editor = null;
    if (pendingNavigation) await restoreRoute(pendingNavigation);
    else await refresh().catch(message);
  }
  function addProject() {
    nativeAdding = true;
  }
  async function browseProjects() {
    adding = true;
    if (registrationPending) {
      try {
        roots = (await api<{ items: Root[] }>("/api/v1/roots")).items;
      } catch (e) {
        message(e);
      }
      return;
    }
    plan = null;
    projectName = "";
    directoryReady = false;
    error = "";
    try {
      roots = (await api<{ items: Root[] }>("/api/v1/roots")).items;
      root = roots[0]?.id ?? "";
      relative = "";
      if (root) await browse("");
    } catch (e) {
      message(e);
    }
  }
  async function browse(path: string, cursor: string | null = null) {
    if (registrationPending || busy) return;
    const generation = ++browseGeneration,
      selectedRoot = root;
    relative = path;
    plan = null;
    directoryReady = false;
    browsing = true;
    directories = [];
    error = "";
    try {
      const page = await api<{
        items: typeof directories;
        next_cursor: string | null;
      }>(
        `/api/v1/roots/${selectedRoot}/directories?relative_path=${encodeURIComponent(path)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (generation !== browseGeneration) return;
      directories = page.items;
      directoryCursor = page.next_cursor;
      directoryPaged = !!cursor;
      directoryReady = true;
    } catch (e) {
      if (generation === browseGeneration) message(e);
    } finally {
      if (generation === browseGeneration) browsing = false;
    }
  }
  async function preview() {
    if (!directoryReady || browsing || registrationPending) return;
    busy = true;
    error = "";
    try {
      plan = await api("/api/v1/registration-plans", "POST", {
        root_id: root,
        relative_path: relative || ".",
        ...(projectName ? { name: projectName } : {}),
        git_mode: tracked ? "tracked" : "private",
      });
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function register() {
    if (!plan) return;
    busy = true;
    try {
      if (!registrationJob) {
        registrationPending ??= command("/api/v1/registrations", "POST", {
          plan_id: plan.plan_id,
        });
        const result = await send(registrationPending);
        registrationJob = result.job_id ?? null;
        if (!registrationJob)
          throw new Error(
            "Registration result is pending. Retry the same request.",
          );
      }
      const job = await api<{ state: string }>(
        `/api/v1/jobs/${registrationJob}`,
      );
      if (job.state !== "done")
        throw new Error(
          `Registration is ${job.state}. Job: ${registrationJob}`,
        );
      project = plan.project_id;
      view = "board";
      search = "";
      adding = false;
      registrationPending = null;
      registrationJob = null;
      await refresh();
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function logout() {
    try {
      await api("/api/v1/auth/logout", "POST", {});
      source?.close();
      boot = null;
      pairing = null;
      connected = false;
    } catch (e) {
      message(e);
    }
  }
  function projectLabel(id: string) {
    return projects.find((p) => p.id === id)?.title ?? "Unavailable project";
  }
  function changeMonth(delta: number) {
    const [year, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, m - 1 + delta, 1))
      .toISOString()
      .slice(0, 7);
  }
  function assignRoute(route: WorkspaceRoute) {
    view = route.view;
    project = route.project;
    search = route.search;
    collection = route.collection;
    archived = route.archived;
    statusFilter = route.status;
    priorityFilter = route.priority;
    labelFilter = route.label;
    unreadOnly = route.unreadOnly;
    month = route.month;
    calendarDate = route.calendarDate;
    calendarLayout = route.calendarLayout;
  }
  async function restoreRoute(params: URLSearchParams) {
    const generation = ++navigationGeneration;
    restoringRoute = true;
    pendingNavigation = null;
    try {
      const route = readRoute(params, today);
      assignRoute(route);
      editor = null;
      if (route.resource) {
        const resource = await api<Resource>(
          resourcePath({
            project_id: route.resource.project,
            type: route.resource.type as Summary["type"],
            id: route.resource.id,
          }),
        );
        if (generation !== navigationGeneration) return;
        editor = {
          project: route.resource.project,
          type: route.resource.type,
          resource,
        };
      }
      await refresh();
      if (generation !== navigationGeneration) return;
      await tick();
      lastRouteUrl = location.pathname + location.search;
      routeReady = false;
    } catch (e) {
      if (generation === navigationGeneration) message(e);
    } finally {
      if (generation === navigationGeneration) restoringRoute = false;
    }
  }
  function keepEditing() {
    pendingNavigation = null;
    history.pushState(null, "", lastRouteUrl);
    restoringRoute = false;
  }
  function closeEditor() {
    editor = null;
    if (pendingNavigation) void restoreRoute(pendingNavigation);
  }
  function historyNavigation() {
    if (!boot) return;
    const target = new URLSearchParams(location.search);
    restoringRoute = true;
    if (editor) {
      pendingNavigation = target;
      if (!editorInstance?.requestClose()) keepEditing();
    } else if (
      dateDraft ||
      moveDraft ||
      settings ||
      adding ||
      nativeAdding ||
      arrangeFocus
    ) {
      // Keep dialogs and their draft state intact while browser navigation is requested.
      history.pushState(null, "", lastRouteUrl);
      restoringRoute = false;
      error =
        "Close the open dialog before changing views with browser navigation.";
    } else void restoreRoute(target);
  }
  $effect(() => {
    if (!boot || loading || restoringRoute) return;
    const route = writeRoute({
      view,
      project,
      search,
      collection,
      archived,
      status: statusFilter,
      priority: priorityFilter,
      label: labelFilter,
      unreadOnly,
      month,
      calendarDate,
      calendarLayout,
      ...(editor?.resource
        ? {
            resource: {
              project: editor.project,
              type: editor.type,
              id: editor.resource.metadata.id,
            },
          }
        : {}),
    });
    const url = `${location.pathname}?${route}`;
    if (
      !routeReady ||
      searchOnlyNavigation(
        new URL(lastRouteUrl, location.origin).searchParams,
        route,
      )
    )
      history.replaceState(null, "", url);
    else if (url !== lastRouteUrl) history.pushState(null, "", url);
    routeReady = true;
    lastRouteUrl = url;
  });
  $effect(() => {
    const requestedQuery = queryKey;
    if (
      !boot ||
      loading ||
      restoringRoute ||
      untrack(() => loadedQueryKey === requestedQuery)
    )
      return;
    untrack(() => {
      refreshGeneration++;
      pageCursors = {};
      pageHistory = {};
    });
    const timer = setTimeout(() => {
      void requestedQuery;
      void refresh().catch(message);
    }, 200);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    const selectedView = view,
      navigation = navElement;
    if (!navigation) return;
    const reveal = () => {
      const active = navigation.querySelector<HTMLElement>(
        `button[data-view="${selectedView}"]`,
      );
      if (active && navigation.scrollWidth > navigation.clientWidth)
        navigation.scrollTo({
          left: Math.max(
            0,
            active.offsetLeft -
              navigation.offsetLeft -
              (navigation.clientWidth - active.offsetWidth) / 2,
          ),
          behavior: "instant",
        });
    };
    void tick().then(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(navigation);
    return () => observer.disconnect();
  });
  onMount(() => {
    const clockTimer = setInterval(() => (clockTime = Date.now()), 60_000);
    window.addEventListener("popstate", historyNavigation);
    window.addEventListener("session-ended", sessionEnded);
    window.addEventListener("command-warning", commandWarning);
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    void initialize();
    return () => {
      clearInterval(clockTimer);
      window.removeEventListener("popstate", historyNavigation);
      window.removeEventListener("session-ended", sessionEnded);
      window.removeEventListener("command-warning", commandWarning);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
      source?.close();
      clearTimeout(refreshTimer);
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
  <main class="welcome">
    <div class="brand"><span class="brandmark">lp</span> LOCAL PROJECTS</div>
    <p class="eyebrow">Your work, on your own machine</p>
    <h1>A clearer view<br />of what’s next.</h1>
    <p class="lead">
      Projects, decisions and progress.<br />Connected to the folders you
      already use.
    </p>
    <section class="pairbox">
      <h2>{pairing ? "Approve this browser" : "Connect your browser"}</h2>
      {#if loading}<p>Checking connection…</p>{:else if pairing}<p>
          Compare this challenge on the host machine:
        </p>
        <div class="challenge">{pairing.challenge}</div>
        <p>Status: <strong>{pairing.state}</strong></p>
        <code
          >projectctl --socket /path/to/projectd.sock approve {pairing.id} --challenge
          "{pairing.challenge}"</code
        ><button class="primary" onclick={checkPairing} disabled={busy}
          >I approved this browser</button
        ><button class="quiet" onclick={() => (pairing = null)}
          >Start again</button
        >{:else}<label
          >Device name<input bind:value={device} maxlength="120" /></label
        ><button
          class="primary"
          onclick={startPairing}
          disabled={busy || !device.trim()}
          >Request access <span>↗</span></button
        >
        <p class="small">
          Approval is required on the host. This app does not grant access from
          a link alone.
        </p>{/if}{#if error}<p class="notice" role="alert">{error}</p>{/if}
      <button onclick={() => (diagnostics = true)}>Host diagnostics</button>
    </section>
  </main>
{:else}
  <div class="app">
    <aside>
      <div class="brand">
        <span class="brandmark">lp</span><span>LOCAL<br />PROJECTS</span>
      </div>
      <p class="navlabel">WORKSPACE</p>
      <nav bind:this={navElement} aria-label="Workspace views">
        {#each views as item, i}<button
            aria-label={item === "gantt"
              ? "Timeline"
              : item[0].toUpperCase() + item.slice(1)}
            data-view={item}
            aria-current={view === item ? "page" : undefined}
            class:chosen={view === item}
            onclick={() => {
              if (view !== item) navigationGeneration++;
              view = item;
            }}
            ><span class="navicon" aria-hidden="true"
              >{["◉", "▦", "▥", "▦", "≋", "☷", "◷"][i]}</span
            ><span
              >{item === "gantt"
                ? "Timeline"
                : item[0].toUpperCase() + item.slice(1)}</span
            >{#if item === "updates"}<small>{updates.length}</small
              >{/if}</button
          >{/each}
      </nav>
      <div class="asidebottom">
        <span class:live={connected} class="dot"></span>{connected
          ? "Connected to host"
          : "Reconnecting…"}<button class="quiet" onclick={logout}
          >Sign out</button
        >
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span
          class="workspace-label"
          title={selectedProject?.title ?? "All projects"}
          >Workspace <span class="slash">/</span>
          {selectedProject?.title ?? "All projects"}</span
        >
        <div>
          {#if project}<button
              class="quiet"
              onclick={() => (gitProject = project)}>Git</button
            >{/if}
          <span class="date">{today}</span><button
            class="quiet"
            aria-label="Host diagnostics"
            onclick={() => (diagnostics = true)}>ⓘ</button
          ><button
            class="quiet"
            aria-label="Workspace settings"
            onclick={() => (settings = true)}>⚙</button
          ><button
            class="quiet"
            onclick={() => refresh().catch(message)}
            aria-label="Refresh">↻</button
          ><button class="quiet mobile-signout" onclick={logout}
            >Sign out</button
          >
        </div>
      </header>
      <main class="content">
        <div class="heading">
          <div>
            <p class="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
            <h1>
              {view === "focus"
                ? "Make room for what matters."
                : view === "gantt"
                  ? "The bigger picture."
                  : view === "projects"
                    ? "Your projects."
                    : view === "updates"
                      ? "The latest from your work."
                      : view[0].toUpperCase() + view.slice(1) + "."}
            </h1>
            <p>
              {view === "focus"
                ? "Your focus and the things that need a decision."
                : view === "projects"
                  ? "Real folders. Shared context. One place to see progress."
                  : view === "calendar"
                    ? "Planned work, deadlines and reviews — kept distinct."
                    : view === "gantt"
                      ? "See the sequence, connect cards and understand the finish date."
                      : "Keep the next step visible."}
            </p>
          </div>
          <button
            class="primary"
            onclick={view === "projects"
              ? addProject
              : () => create(primaryResource(view, collection))}
            >＋ {view === "projects"
              ? "Add project"
              : `Add ${primaryResource(view, collection)}`}</button
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
        <div class="toolbar">
          {#if view !== "projects"}<label class="sr" for="project"
              >Project</label
            ><select
              id="project"
              bind:value={project}
              onchange={() => navigationGeneration++}
              ><option value="">All projects</option
              >{#each projects as item}<option value={item.id}
                  >{item.title}</option
                >{/each}</select
            >{/if}<input
            class="search"
            aria-label={["list", "updates"].includes(view)
              ? "Search content"
              : "Filter loaded titles"}
            bind:value={search}
            placeholder={["list", "updates"].includes(view)
              ? "Search content…"
              : "Filter loaded titles…"}
          />{#if view === "updates"}<label
              ><input type="checkbox" bind:checked={unreadOnly} /> Unread only</label
            >{/if}{#if view === "list"}<select
              aria-label="Resource type"
              bind:value={collection}
              onchange={() => (statusFilter = "")}
              ><option value="cards">Cards</option><option value="milestones"
                >Milestones</option
              ></select
            ><select aria-label="Status filter" bind:value={statusFilter}>
              <option value="">All statuses</option>
              {#each collection === "cards" ? statuses : ["planned", "active", "achieved", "cancelled"] as status}<option
                  value={status}>{resourceLabel(status)}</option
                >{/each}
            </select>
            {#if collection === "cards"}<select
                aria-label="Card visibility"
                bind:value={archived}
              >
                <option value={false}>Active cards</option><option value={true}
                  >Archived cards</option
                >
              </select><select
                aria-label="Priority filter"
                bind:value={priorityFilter}
              >
                <option value="">All priorities</option
                >{#each ["urgent", "high", "normal", "low"] as priority}<option
                    value={priority}>{resourceLabel(priority)}</option
                  >{/each}
              </select><input
                aria-label="Tag filter"
                placeholder="Exact tag…"
                bind:value={labelFilter}
              />{/if}
            {#if statusFilter || priorityFilter || labelFilter || archived}<button
                onclick={() => {
                  statusFilter = "";
                  priorityFilter = "";
                  labelFilter = "";
                  archived = false;
                }}>Clear filters</button
              >{/if}
          {/if}{#if view === "gantt"}<div class="month">
              <button
                onclick={() => changeMonth(-1)}
                aria-label="Previous month">←</button
              ><input
                type="month"
                aria-label="Month"
                bind:value={month}
              /><button onclick={() => changeMonth(1)} aria-label="Next month"
                >→</button
              >
            </div>{/if}
        </div>
        {#if !queryReady && ["list", "updates", "projects"].includes(view)}
          <div class="empty" role="status">Loading resources…</div>
        {:else if view === "focus"}
          <div class="stats">
            <div>
              <span>IN MOTION</span><strong
                >{filtered.filter((c) => c.status === "active").length}</strong
              >
              <p>Loaded active cards</p>
            </div>
            <div>
              <span>NEEDS A LOOK</span><strong>{attention.length}</strong>
              <p>Blocked, overdue or up for review</p>
            </div>
            <div>
              <span>ON THE HORIZON</span><strong
                >{milestones.filter(
                  (m) => !["achieved", "cancelled"].includes(m.status ?? ""),
                ).length}</strong
              >
              <p>Loaded open milestones</p>
            </div>
          </div>
          <div class="sectiontitle">
            <h2>In focus</h2>
            <span
              >{visibleFocus.length} pinned{project || search
                ? " in selection"
                : ""}</span
            >
            {#if focus.length > 1}<button onclick={() => (arrangeFocus = true)}
                >Arrange focus</button
              >{/if}
          </div>
          <div class="grid">
            {#each visibleFocus as item}{#if item}<button
                  class="card"
                  onclick={() => open(item)}
                  ><small>{projectLabel(item.project_id)}</small>
                  <h3>{item.title}</h3>
                  <ResourceMetadata {item} showStatus /></button
                >{/if}{:else}<div class="empty">
                {project || search
                  ? "No pinned cards match this selection. Change the project or clear the title filter."
                  : "No pinned cards yet. Open a card and pin it to keep it here."}
              </div>{/each}
          </div>
          <div class="sectiontitle">
            <h2>Needs your attention</h2>
            <span>{attention.length} items</span>
          </div>
          {#each attention as item}<button
              class="listrow"
              onclick={() =>
                open({
                  project_id: item.project_id,
                  type: item.target.type,
                  id: item.target.id,
                })}
              ><span class="priority"></span>
              <div>
                <strong>{item.label}</strong><small
                  >{projectLabel(item.project_id)}</small
                >
              </div>
              <span class="attention-reasons"
                >{#each item.reasons as reason}<span class="badge"
                    >{resourceLabel(reason)}</span
                  >{/each}</span
              ><span aria-hidden="true">↗</span></button
            >{:else}<div class="empty">
              <strong>A little breathing room.</strong>
              <p>No blocked, overdue or review items in this selection.</p>
            </div>{/each}
          {#if attentionCursor}<button
              disabled={loadingMore}
              onclick={() => moreAttention()}>Next attention page</button
            >{/if}
          {#if attentionPaged}<button
              disabled={loadingMore}
              onclick={() => moreAttention(true)}>First attention page</button
            >{/if}
        {:else if view === "projects"}<div class="grid">
            {#each projects.filter((p) => p.title
                .toLowerCase()
                .includes(search.trim().toLowerCase())) as item}<button
                class="card projectcard"
                onclick={() => open(item)}
                ><div class="projectinitial">
                  {item.title.slice(0, 2).toUpperCase()}
                </div>
                <span class="badge">{item.status}</span>
                <h2>{item.title}</h2>
                <p>
                  {cards.filter(
                    (c) =>
                      c.project_id === item.id &&
                      !["done", "cancelled"].includes(c.status ?? ""),
                  ).length} loaded open cards · {updates.filter(
                    (c) => c.project_id === item.id,
                  ).length} updates
                </p>
                <footer>
                  <span>{item.availability}</span><span>Open project ↗</span>
                </footer></button
              >{:else}<div class="empty">
                <strong>Start with a folder.</strong>
                <p>Add a project from an approved directory to begin.</p>
                <button onclick={addProject}>Add your first project</button>
              </div>{/each}
          </div>
        {:else if view === "board" && project}{#if Board}{#key project}<Board
                {project}
                {search}
                revision={viewRevision}
                {open}
                onpropose={(proposal) => (moveDraft = proposal)}
                oncreate={create}
              />{/key}{:else}<p role="status">Loading board…</p>{/if}
        {:else if view === "board"}<p role="status">
            All projects is an overview. Select a project above to drag and
            reorder cards.
          </p>
          <div class="board">
            {#each statuses as status}<section class="column">
                <div class="sectiontitle">
                  <h2>{status}</h2>
                  <span
                    >{filtered.filter((c) => c.status === status).length}</span
                  >
                </div>
                {#each filtered
                  .filter((c) => c.status === status)
                  .sort( (a, b) => (a.position ?? "").localeCompare(b.position ?? "") ) as item}<button
                    class="card"
                    onclick={() => open(item)}
                    ><small>{projectLabel(item.project_id)}</small>
                    <h3>{item.title}</h3>
                    <ResourceMetadata {item} compact /></button
                  >{:else}<p class="columnempty">Nothing here yet</p>{/each}
              </section>{/each}
          </div>
        {:else if view === "calendar" || view === "gantt"}{#if DateViews}<DateViews
              {project}
              {month}
              {view}
              revision={viewRevision}
              {weekStart}
              {calendarDate}
              {calendarLayout}
              workspaceToday={today}
              onCalendarNavigate={(date, layout) => {
                calendarDate = date;
                calendarLayout = layout;
              }}
              {search}
              {open}
              onpropose={(proposal) => (dateDraft = proposal)}
              oncreate={(schedule) => create("card", { schedule })}
            />{:else}<p>Loading date views…</p>{/if}
        {:else if view === "updates"}<div class="updates">
            {#each visibleUpdates as item}<button
                class="update"
                onclick={() => open(item)}
                ><span class="updateicon">↗</span>
                <div>
                  <small
                    >{projectLabel(item.project_id)} · {item.recorded_at?.slice(
                      0,
                      10,
                    )}</small
                  >
                  <h3>{item.title}</h3>
                  <span class="badge"
                    >{resourceLabel(item.kind ?? "update")}</span
                  >
                  <span class="badge">{item.read ? "Read" : "Unread"}</span>
                </div></button
              >{:else}<div class="empty">
                No updates yet. Record a result, blocker or decision.
              </div>{/each}
          </div>
        {:else}<div class="table">
            <div class="tablehead">
              <span>Title / project</span><span>Card details</span>
            </div>
            {#each collection === "cards" ? filtered : milestones.filter((m) => !project || m.project_id === project) as item}<button
                class="listrow"
                onclick={() => open(item)}
                ><div>
                  <strong>{item.title}</strong><small
                    >{projectLabel(item.project_id)}</small
                  >
                </div>
                <div class="row-metadata">
                  <ResourceMetadata {item} showStatus compact />
                </div></button
              >{:else}<div class="empty">
                {archived && collection === "cards"
                  ? "No archived cards match this selection. Clear filters to see more archived cards."
                  : "No items match this selection. Try another project or clear the filters."}
              </div>{/each}
          </div>{/if}
        {#if queryReady && ["board", "list", "updates"].includes(view) && (view !== "board" || !project)}{@const kind =
            view === "updates"
              ? "update"
              : view === "list" && collection === "milestones"
                ? "milestone"
                : "card"}{#if pageCursors[kind]}<div class="sectiontitle">
              <span>More resources are available.</span><button
                disabled={loadingMore}
                onclick={() => more(kind)}>Next page</button
              >
            </div>{/if}{/if}
        {#if queryReady && ["list", "updates"].includes(view)}{@const kind =
            view === "updates"
              ? "update"
              : collection === "milestones"
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
    onclose={() => (settings = false)}
    onsaved={() => {
      settings = false;
      void initialize();
    }}
  />{/if}
{#if editor}{#key editor}<Editor
      {...editor}
      bind:this={editorInstance}
      onclose={closeEditor}
      onkeepediting={() => {
        if (pendingNavigation) keepEditing();
      }}
      onchanged={() => refresh().catch(message)}
      onsaved={() => void saved()}
    />{/key}{/if}
{#if adding}<div class="modalshade">
    <dialog
      use:modal
      class="modal"
      aria-label="Add project"
      oncancel={(e) => {
        e.preventDefault();
        if (!busy) adding = false;
      }}
    >
      <header>
        <h2>Add a project</h2>
        <button
          onclick={() => (adding = false)}
          aria-label="Close"
          disabled={busy}>✕</button
        >
      </header>
      <p>Choose the project folder on this host. Files stay in that folder.</p>
      {#if !roots.length}<p>
          No directories have been approved yet. On the host, run:
        </p>
        <code
          >projectctl --socket /path/to/projectd.sock add-root /absolute/path
          --label "Projects"</code
        >{:else}<label
          >Project folders<select
            bind:value={root}
            disabled={!!registrationPending || busy}
            onchange={() => browse("")}
            >{#each roots as r}<option value={r.id}>{r.label}</option
              >{/each}</select
          ></label
        >
        <p class="breadcrumb">
          {roots.find((r) => r.id === root)?.display_path}/{relative}
        </p>
        <button
          disabled={!relative || busy || !!registrationPending || browsing}
          onclick={() => browse(relative.split("/").slice(0, -1).join("/"))}
          >↑ Parent directory</button
        >
        <div class="directories">
          {#if browsing}<p role="status">Loading folders…</p>{/if}
          {#each directories as directory}<button
              disabled={busy || !!registrationPending || browsing}
              aria-label={`Open folder: ${directory.name}`}
              onclick={() => browse(directory.relative_path)}
              >▱ {directory.name}{directory.registered ? " · registered" : ""}
              <span>→</span></button
            >{:else}{#if directoryReady}<p>
                No subfolders here. You can select this folder.
              </p>{/if}{/each}
        </div>
        {#if directoryPaged}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative)}>First folder page</button
          >{/if}
        {#if directoryCursor}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative, directoryCursor)}
            >More folders</button
          >{/if}
        <label
          >Project name<input
            bind:value={projectName}
            disabled={!!registrationPending || busy}
            oninput={() => (plan = null)}
            placeholder="Use folder name"
          /></label
        ><label class="check"
          ><input
            type="checkbox"
            disabled={!!registrationPending || busy}
            bind:checked={tracked}
            onchange={() => (plan = null)}
          /> Track .project files in the project’s Git repository</label
        >{#if plan}<section class="notice">
            <strong>Selected folder</strong>
            <p class="breadcrumb">{plan.display_path}</p>
            <p>
              Add planning files in .project and project instructions in
              AGENTS.md. Existing content is preserved.
            </p>
            {#each plan.warnings as warning}<p>{warning.message}</p>{/each}
            <details>
              <summary>Files to update</summary>
              {#each plan.changes.filter((change) => change.action !== "no_change") as change}<p
                  class="breadcrumb"
                >
                  {change.path}
                </p>{/each}
            </details>
          </section>
          <button class="primary" onclick={register} disabled={busy}
            >{registrationJob
              ? "Check registration"
              : registrationPending
                ? "Retry same registration"
                : "Add selected project"}</button
          >{#if registrationPending}<p>
              Request: {registrationPending.requestId}
            </p>{/if}{:else}<button
            class="primary"
            onclick={preview}
            disabled={busy || browsing || !directoryReady}
            >Choose this folder</button
          >{/if}{/if}{#if error}<p class="notice">{error}</p>{/if}
    </dialog>
  </div>{/if}

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
      void browseProjects();
    }}
    onadded={(id) => {
      nativeAdding = false;
      project = id;
      view = "board";
      search = "";
      void refresh().catch(message);
    }}
  />{/if}

<style>
  :global(:root) {
    --bg: #f5f5ef;
    --paper: #fffefa;
    --ink: #263b32;
    --muted: #616e63;
    --line: #e2e5dc;
    --green: #245840;
    --accent: #dce8a9;
    --hover: #f0f3e8;
    --soft: #edf0e6;
    --wash: var(--soft);
    --notice-bg: #fff0e5;
    --notice-ink: #803c22;
    --notice-line: #efccb9;
    --plan-bg: #dce8c8;
    --review-bg: #eee8f4;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: var(--ink);
    background: var(--bg);
    font-synthesis: none;
  }
  :global(:root[data-theme="dark"]) {
    --bg: #17221d;
    --paper: #202e27;
    --ink: #e7eee4;
    --muted: #a9b7aa;
    --line: #46554a;
    --green: #366748;
    --accent: #405436;
    --hover: #314236;
    --soft: #2a392e;
    --notice-bg: #463325;
    --notice-ink: #ffcea5;
    --notice-line: #8a6449;
    --plan-bg: #364e30;
    --review-bg: #45384f;
    color-scheme: dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"]):not([data-theme="dark"])) {
      --bg: #17221d;
      --paper: #202e27;
      --ink: #e7eee4;
      --muted: #a9b7aa;
      --line: #46554a;
      --green: #366748;
      --accent: #405436;
      --hover: #314236;
      --soft: #2a392e;
      --notice-bg: #463325;
      --notice-ink: #ffcea5;
      --notice-line: #8a6449;
      --plan-bg: #364e30;
      --review-bg: #45384f;
      color-scheme: dark;
    }
  }
  :global(body) {
    margin: 0;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
    font-size: 14px;
  }
  :global(button) {
    cursor: pointer;
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink);
    border-radius: 8px;
    padding: 10px 14px;
    min-height: 42px;
  }
  :global(button:hover) {
    border-color: #a5b69e;
    background: var(--hover);
  }
  :global(button:disabled) {
    opacity: 0.5;
    cursor: default;
  }
  :global(input),
  :global(select),
  :global(textarea) {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    padding: 11px 12px;
    min-width: 0;
  }
  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible) {
    outline: 3px solid #87a76d;
    outline-offset: 2px;
  }
  :global(.primary) {
    background: var(--green);
    color: white;
    border-color: var(--green);
    font-weight: 600;
    white-space: nowrap;
  }
  :global(.primary:hover) {
    background: #173f2d;
    color: white;
  }
  :global(.quiet) {
    background: transparent;
    border-color: transparent;
  }
  :global(.eyebrow) {
    font-size: 10px;
    letter-spacing: 0.14em;
    font-weight: 700;
    color: var(--muted);
  }
  :global(.notice) {
    background: var(--notice-bg);
    color: var(--notice-ink);
    padding: 14px;
    border: 1px solid var(--notice-line);
    border-radius: 8px;
    overflow-wrap: anywhere;
  }
  :global(.sr) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    line-height: 1.5;
  }
  .brandmark {
    background: var(--green);
    color: var(--accent);
    font-family: Georgia, serif;
    font-size: 28px;
    line-height: 42px;
    width: 42px;
    text-align: center;
    border-radius: 12px;
    letter-spacing: -3px;
    padding-right: 3px;
  }
  .welcome {
    max-width: 1040px;
    margin: 8vh auto;
    padding: 32px;
    position: relative;
  }
  .welcome > .eyebrow {
    margin-top: 90px;
  }
  .welcome h1 {
    font:
      normal clamp(42px, 5vw, 64px)/1.08 Georgia,
      serif;
    letter-spacing: -2px;
  }
  .lead {
    font-size: 18px;
    color: var(--muted);
    line-height: 1.7;
  }
  .pairbox {
    position: absolute;
    width: 380px;
    right: 32px;
    top: 155px;
    background: var(--paper);
    border: 1px solid var(--line);
    padding: 30px;
    border-radius: 18px;
  }
  .pairbox h2 {
    font-size: 21px;
  }
  .pairbox label {
    display: block;
  }
  .pairbox input {
    width: 100%;
    margin: 10px 0 18px;
  }
  .pairbox > .primary {
    width: 100%;
    margin: 12px 0;
  }
  .small {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.6;
  }
  .challenge {
    font-size: 25px;
    letter-spacing: 3px;
    background: var(--bg);
    padding: 16px;
    text-align: center;
    font-family: monospace;
  }
  .pairbox code,
  .modal code {
    display: block;
    font-size: 11px;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  .app {
    display: flex;
    min-height: 100vh;
  }
  aside {
    width: 218px;
    flex-shrink: 0;
    border-right: 1px solid var(--line);
    padding: 30px 20px;
    position: fixed;
    inset: 0 auto 0 0;
    background: var(--soft);
    display: flex;
    flex-direction: column;
  }
  .navlabel {
    font-size: 9px;
    letter-spacing: 0.15em;
    color: var(--muted);
    margin: 48px 14px 14px;
  }
  nav {
    display: grid;
    gap: 6px;
  }
  nav button {
    display: flex;
    align-items: center;
    text-align: left;
    border-color: transparent;
    background: transparent;
    font-size: 13px;
    gap: 14px;
    padding: 12px;
  }
  .navicon {
    font-size: 19px;
    width: 20px;
    color: #7e8d7d;
  }
  nav button.chosen {
    background: var(--accent);
    font-weight: 650;
  }
  nav button.chosen .navicon {
    color: var(--green);
  }
  nav small {
    margin-left: auto;
    color: var(--muted);
  }
  .asidebottom {
    margin-top: auto;
    font-size: 11px;
    color: var(--muted);
  }
  .asidebottom button {
    display: block;
    font-size: 11px;
    padding-left: 0;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 7px;
    background: #bd8745;
  }
  .dot.live {
    background: #638653;
  }
  .workspace {
    margin-left: 218px;
    width: calc(100% - 218px);
  }
  .topbar {
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--line);
    padding: 0 24px;
    font-size: 12px;
  }
  .topbar > div {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }
  .slash {
    color: #a7afa4;
    margin: 0 14px;
  }
  .date {
    color: var(--muted);
  }
  .content {
    max-width: 1500px;
    padding: 24px 24px 20px;
    margin: auto;
  }
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-bottom: 20px;
  }
  h1 {
    font:
      650 26px/1.25 Inter,
      ui-sans-serif,
      system-ui,
      sans-serif;
    letter-spacing: -0.5px;
    margin: 10px 0;
  }
  .heading p:not(.eyebrow) {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.6;
  }
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .toolbar select {
    min-width: 170px;
  }
  .search {
    margin-left: auto;
    width: 220px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    margin-bottom: 22px;
  }
  .stats > div {
    padding: 16px 20px;
    border-right: 1px solid var(--line);
  }
  .stats > div:last-child {
    border: 0;
  }
  .stats span {
    font-size: 9px;
    letter-spacing: 0.13em;
    color: var(--muted);
    display: block;
  }
  .stats strong {
    display: block;
    font:
      600 30px ui-sans-serif,
      system-ui,
      sans-serif;
    margin: 8px 0 6px;
  }
  .stats p {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }
  .sectiontitle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 20px 0 14px;
  }
  .sectiontitle h2 {
    font-size: 15px;
    font-weight: 600;
  }
  .sectiontitle > span {
    font-size: 11px;
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
    gap: 18px;
  }
  .card {
    padding: 16px;
    text-align: left;
    border-radius: 12px;
    width: 100%;
  }
  .card small {
    font-size: 10px;
    color: var(--muted);
  }
  .card h3 {
    font-size: 15px;
    line-height: 1.45;
    font-weight: 600;
    margin: 8px 0 12px;
  }
  .badge {
    font-size: 10px;
    background: var(--soft);
    padding: 5px 8px;
    border-radius: 5px;
    white-space: nowrap;
    text-transform: capitalize;
  }
  .card footer {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 10px;
    color: var(--muted);
    border-top: 1px solid var(--line);
    padding-top: 16px;
    margin-top: 20px;
  }
  .card footer > span:last-child {
    margin-left: auto;
  }
  .projectinitial {
    background: var(--accent);
    color: var(--ink);
    padding: 12px;
    border-radius: 10px;
    display: inline-block;
    font-family: Georgia, serif;
    font-size: 22px;
    margin-bottom: 10px;
  }
  .projectcard > .badge {
    float: right;
  }
  .projectcard h2 {
    font:
      23px Georgia,
      serif;
  }
  .projectcard p {
    font-size: 12px;
    color: var(--muted);
  }
  .listrow {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 16px;
    text-align: left;
    padding: 18px 20px;
    margin-bottom: 8px;
    border-radius: 10px;
  }
  .listrow > div {
    flex: 1;
    min-width: 0;
  }
  .listrow strong {
    font-size: 13px;
    font-weight: 550;
  }
  .listrow small {
    display: block;
    font-size: 10px;
    color: var(--muted);
    margin-top: 6px;
  }
  .listrow > span:last-child {
    font-size: 12px;
  }
  .priority {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #b2c495;
    flex-shrink: 0;
  }
  .empty {
    background: var(--soft);
    border: 1px dashed var(--line);
    padding: 30px;
    border-radius: 12px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.7;
    grid-column: 1/-1;
  }
  .empty strong {
    font:
      22px Georgia,
      serif;
    color: var(--ink);
  }
  .pagefooter {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #92998e;
    border-top: 1px solid var(--line);
    padding-top: 20px;
    margin-top: 28px;
  }
  .board {
    display: flex;
    gap: 16px;
    overflow: auto;
    padding-bottom: 20px;
  }
  .column {
    min-width: 230px;
    flex: 1;
  }
  .column .sectiontitle h2 {
    text-transform: capitalize;
    font-size: 12px;
  }
  .column .card {
    margin-bottom: 12px;
    padding: 18px;
  }
  .columnempty {
    padding: 24px 10px;
    border: 1px dashed var(--line);
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    border-radius: 10px;
  }
  .month {
    display: flex;
    gap: 6px;
  }
  .month input {
    width: 160px;
  }
  .table {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .table .listrow {
    margin: 0;
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
  }
  .tablehead {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 16px 20px;
    font-size: 10px;
    color: var(--muted);
  }
  .updates {
    max-width: 850px;
  }
  .update {
    display: flex;
    text-align: left;
    width: 100%;
    gap: 20px;
    margin-bottom: 12px;
    padding: 24px;
    border-radius: 12px;
  }
  .updateicon {
    background: var(--soft);
    align-self: flex-start;
    flex-shrink: 0;
    border-radius: 50%;
    padding: 12px;
    color: var(--green);
  }
  .update small {
    font-size: 10px;
    color: var(--muted);
  }
  .update h3 {
    font-size: 16px;
    font-weight: 500;
  }
  .connection {
    padding: 12px;
    font-size: 12px;
    background: var(--notice-bg);
    border-radius: 8px;
    margin-bottom: 16px;
  }
  .modalshade {
    position: fixed;
    inset: 0;
    z-index: 25;
    background: #152d2860;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .modal {
    border: 1px solid var(--line);
    color: var(--ink);
    background: var(--paper);
    border-radius: 16px;
    padding: 28px;
    width: min(100%, 580px);
    max-height: 90vh;
    overflow: auto;
  }
  .modal header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .modal h2 {
    font:
      28px Georgia,
      serif;
  }
  .modal label {
    display: block;
    font-size: 12px;
    margin: 16px 0;
  }
  .modal input:not([type="checkbox"]),
  .modal select {
    display: block;
    width: 100%;
    margin-top: 8px;
  }
  .modal .check {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .directories {
    max-height: 180px;
    overflow: auto;
    margin: 10px 0;
  }
  .directories button {
    display: flex;
    width: 100%;
    text-align: left;
    justify-content: space-between;
    margin: 4px 0;
  }
  .breadcrumb {
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--muted);
  }
  .modal details {
    margin: 20px 0;
  }
  @media (max-width: 1100px) {
    aside {
      width: 180px;
      padding: 26px 12px;
    }
    .workspace {
      margin-left: 180px;
      width: calc(100% - 180px);
    }
    .content {
      padding: 28px 24px;
    }
    .topbar {
      padding: 0 24px;
    }
    h1 {
      font-size: 26px;
    }
    .pairbox {
      position: static;
      width: auto;
      max-width: 430px;
      margin-top: 36px;
    }
    .welcome > .eyebrow {
      margin-top: 45px;
    }
  }
  @media (max-width: 700px) {
    aside {
      position: sticky;
      top: 0;
      z-index: 10;
      width: 100%;
      padding: 12px;
      border: 0;
      border-bottom: 1px solid var(--line);
    }
    .app {
      display: block;
    }
    aside .brand,
    aside .navlabel,
    .asidebottom {
      display: none;
    }
    nav {
      display: flex;
      overflow: auto;
      gap: 4px;
    }
    nav button {
      font-size: 11px;
      padding: 9px;
      gap: 5px;
      flex-shrink: 0;
    }
    .navicon {
      display: none;
    }
    nav small {
      display: none;
    }
    .workspace {
      width: 100%;
      margin: 0;
    }
    .topbar {
      min-height: 50px;
      padding: 0 18px;
      font-size: 10px;
    }
    .topbar .date {
      display: none;
    }
    .content {
      padding: 18px 14px;
    }
    .heading {
      display: block;
      margin-bottom: 22px;
    }
    .heading .primary {
      margin-top: 4px;
    }
    .heading h1 {
      font-size: 24px;
    }
    .heading .eyebrow {
      font-size: 8px;
    }
    .toolbar {
      gap: 8px;
    }
    .toolbar select {
      min-width: 0;
      max-width: 100%;
      flex: 1;
    }
    .search {
      width: 120px;
      flex: 1;
      margin: 0;
    }
    .stats > div {
      padding: 12px 10px;
    }
    .stats span {
      font-size: 7px;
    }
    .stats strong {
      font-size: 26px;
    }
    .stats p {
      font-size: 10px;
      line-height: 1.5;
    }
    .grid {
      grid-template-columns: 1fr;
    }
    .pagefooter span {
      display: none;
    }
    .month {
      width: 100%;
    }
    .month input {
      flex: 1;
    }
    .tablehead {
      grid-template-columns: 1fr;
    }
    .table .listrow {
      gap: 8px;
      padding: 14px 12px;
    }
    .welcome {
      padding: 24px;
      margin: 0;
    }
    .welcome h1 {
      font-size: 44px;
    }
    .pairbox {
      padding: 22px;
    }
    .welcome > .eyebrow {
      margin-top: 40px;
    }
    .modalshade {
      padding: 10px;
    }
    .modal {
      padding: 20px;
    }
    .listrow {
      padding: 16px 12px;
    }
    .listrow strong {
      font-size: 12px;
    }
  }
  .heading .eyebrow {
    display: none;
  }
  .workspace-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .topbar {
    gap: 12px;
  }
  .mobile-signout {
    display: none;
  }
  .attention-reasons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    max-width: 45%;
  }
  .row-metadata {
    max-width: 50%;
  }
  .card,
  .update,
  .listrow {
    overflow-wrap: anywhere;
  }
  .grid .card {
    align-self: start;
  }
  .toolbar > input {
    max-width: 100%;
  }
  @media (max-width: 700px) {
    .mobile-signout {
      display: inline-flex;
      align-items: center;
      padding: 8px;
      font-size: 11px;
    }
    .topbar {
      padding: 0 12px;
      gap: 4px;
    }
    .topbar > div {
      gap: 0;
    }
    .topbar button {
      padding: 8px;
      min-width: 34px;
    }
    .topbar .slash {
      margin: 0 4px;
    }
    .workspace-label {
      font-size: 11px;
    }
    .table .listrow {
      display: block;
    }
    .row-metadata {
      max-width: none;
      margin-top: 10px;
    }
    .tablehead span:last-child {
      display: none;
    }
    .attention-reasons {
      max-width: 38%;
    }
    .badge {
      white-space: normal;
    }
    .toolbar > input[aria-label="Tag filter"] {
      flex: 1 1 140px;
      width: 140px;
    }
    .heading p {
      margin: 6px 0;
    }
    .heading {
      margin-bottom: 16px;
    }
  }
</style>
