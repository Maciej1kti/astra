<script lang="ts">
  import { onMount } from "svelte";
  import { modal } from "./lib/dialog";
  import Editor from "./lib/Editor.svelte";
  import Settings from "./lib/Settings.svelte";
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
  } from "./lib/api";
  type View =
    "focus" | "projects" | "board" | "calendar" | "gantt" | "list" | "updates";
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
  let attentionRows = $state<Attention[]>([]);
  let pageCursors = $state<Record<string, string | null>>({});
  let unreadOnly = $state(false);
  let refreshGeneration = 0;
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
  let view = $state<View>("focus"),
    project = $state(""),
    search = $state(""),
    collection = $state("cards"),
    error = $state(""),
    loading = $state(true),
    connected = $state(false),
    busy = $state(false);
  let editor = $state<{
      project: string;
      type: string;
      resource: Resource | null;
    } | null>(null),
    adding = $state(false),
    roots = $state<Root[]>([]),
    root = $state(""),
    relative = $state(""),
    projectName = $state(""),
    tracked = $state(false),
    plan = $state<Record<string, unknown> | null>(null);
  let directories = $state<
    { name: string; relative_path: string; registered: boolean }[]
  >([]);
  let month = $state(new Date().toISOString().slice(0, 7));
  let source: EventSource | undefined,
    refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const views: View[] = [
    "focus",
    "projects",
    "board",
    "calendar",
    "gantt",
    "list",
    "updates",
  ];
  const statuses = ["planned", "active", "review", "done", "cancelled"];
  let today = $derived(
    boot
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: boot.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date())
      : "",
  );
  let filtered = $derived(
    cards.filter(
      (c) =>
        (!project || c.project_id === project) &&
        !c.archived &&
        c.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  let visibleUpdates = $derived(
    updates.filter(
      (c) =>
        (!project || c.project_id === project) &&
        (!unreadOnly || !c.read) &&
        c.title.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  let days = $derived.by(() => {
    const [year, m] = month.split("-").map(Number);
    return Array.from(
      { length: new Date(Date.UTC(year, m, 0)).getUTCDate() },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    );
  });
  let selectedProject = $derived(projects.find((p) => p.id === project));
  let attention = $derived(
    attentionRows.filter(
      (item) =>
        (!project || item.project_id === project) &&
        item.label.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  function message(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  async function initialize() {
    loading = true;
    error = "";
    try {
      boot = await api<Bootstrap>("/api/v1/bootstrap");
      configure(boot);
      const preferences = await api<{
        preferences: { default_view?: View; week_start?: string };
      }>("/api/v1/workspace/preferences");
      view = preferences.preferences.default_view ?? "focus";
      weekStart = preferences.preferences.week_start ?? "monday";
      await refresh();
      connect();
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

  async function resourcePage(type: string, cursor?: string | null) {
    return api<{ items: Summary[]; page: { next_cursor: string | null } }>(
      `/api/v1/views/list?type=${type}&limit=200${project ? `&project_id=${project}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
  }
  async function refresh() {
    const generation = ++refreshGeneration;
    const [p, f, a, c, m, u] = await Promise.all([
      all("/api/v1/projects"),
      api<{ items: typeof focus }>("/api/v1/workspace/focus"),
      all<Attention>("/api/v1/views/attention"),
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
    viewRevision++;
    focusCards = pinned;
    projects = p;
    focus = f.items;
    attentionRows = a;
    cards = c.items;
    milestones = m.items;
    updates = u.items;
    pageCursors = {
      card: c.page.next_cursor,
      milestone: m.page.next_cursor,
      update: u.page.next_cursor,
    };
  }
  async function more(type: string) {
    if (loadingMore || !pageCursors[type]) return;
    loadingMore = true;
    const generation = refreshGeneration;
    try {
      const next = await resourcePage(type, pageCursors[type]);
      if (generation !== refreshGeneration) return;
      if (type === "card") cards = [...cards, ...next.items];
      else if (type === "milestone")
        milestones = [...milestones, ...next.items];
      else updates = [...updates, ...next.items];
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
    source.onerror = () => (connected = false);
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
    error = "";
    try {
      editor = {
        project: item.project_id,
        type: item.type,
        resource: await api<Resource>(resourcePath(item)),
      };
    } catch (e) {
      message(e);
    }
  }
  function create(type: string) {
    if (!project) {
      error = "Select a project before creating a resource.";
      return;
    }
    editor = { project, type, resource: null };
  }
  async function saved() {
    editor = null;
    await refresh().catch(message);
  }
  async function addProject() {
    adding = true;
    plan = null;
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
  async function browse(path: string) {
    relative = path;
    plan = null;
    try {
      directories = (
        await api<{ items: typeof directories }>(
          `/api/v1/roots/${root}/directories?relative_path=${encodeURIComponent(path)}`,
        )
      ).items;
    } catch (e) {
      message(e);
    }
  }
  async function preview() {
    busy = true;
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
      const result = await send(
        command("/api/v1/registrations", "POST", { plan_id: plan.plan_id }),
      );
      const job = await api<{ state: string }>(`/api/v1/jobs/${result.job_id}`);
      if (job.state !== "done")
        throw new Error(`Registration is ${job.state}. Job: ${result.job_id}`);
      adding = false;
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
  function datesFor(day: string) {
    return [
      ...filtered,
      ...milestones.filter((m) => !project || m.project_id === project),
    ].filter(
      (c) =>
        c.due?.date === day ||
        c.review_on === day ||
        (c.schedule && c.schedule.start <= day && c.schedule.end >= day),
    );
  }
  onMount(() => {
    void initialize();
    return () => {
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
    </section>
  </main>
{:else}
  <div class="app">
    <aside>
      <div class="brand">
        <span class="brandmark">lp</span><span>LOCAL<br />PROJECTS</span>
      </div>
      <p class="navlabel">WORKSPACE</p>
      <nav>
        {#each views as item, i}<button
            aria-label={item === "gantt"
              ? "Timeline"
              : item[0].toUpperCase() + item.slice(1)}
            class:chosen={view === item}
            onclick={() => (view = item)}
            ><span class="navicon"
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
          >Workspace <span class="slash">/</span>
          {selectedProject?.title ?? "All projects"}</span
        >
        <div>
          <span class="date">{today}</span><button
            class="quiet"
            aria-label="Workspace settings"
            onclick={() => (settings = true)}>⚙</button
          ><button
            class="quiet"
            onclick={() => refresh().catch(message)}
            aria-label="Refresh">↻</button
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
                      ? "All-day schedules. Open a card to adjust its dates."
                      : "Keep the next step visible."}
            </p>
          </div>
          <button
            class="primary"
            onclick={view === "projects"
              ? addProject
              : () =>
                  create(
                    view === "updates"
                      ? "update"
                      : collection === "milestones"
                        ? "milestone"
                        : "card",
                  )}
            >＋ {view === "projects"
              ? "Add project"
              : view === "updates"
                ? "Add update"
                : collection === "milestones"
                  ? "Add milestone"
                  : "Add card"}</button
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
          <label class="sr" for="project">Project</label><select
            id="project"
            bind:value={project}
            onchange={() => refresh().catch(message)}
            ><option value="">All projects</option
            >{#each projects as item}<option value={item.id}
                >{item.title}</option
              >{/each}</select
          ><input
            class="search"
            aria-label="Filter titles"
            bind:value={search}
            placeholder="Search titles…"
          />{#if view === "updates"}<label
              ><input type="checkbox" bind:checked={unreadOnly} /> Unread only</label
            >{/if}{#if view === "list"}<select
              aria-label="Resource type"
              bind:value={collection}
              ><option value="cards">Cards</option><option value="milestones"
                >Milestones</option
              ></select
            >{/if}{#if view === "calendar" || view === "gantt"}<div
              class="month"
            >
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
        {#if view === "focus"}
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
            <span>{focus.length} pinned</span>
          </div>
          <div class="grid">
            {#each focusCards as item}{#if item}<button
                  class="card"
                  onclick={() => open(item)}
                  ><small>{projectLabel(item.project_id)}</small>
                  <h3>{item.title}</h3>
                  <span class="badge">{item.status}</span></button
                >{/if}{:else}<div class="empty">
                No pinned resources yet. Active work and attention items appear
                below.
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
              <span class="badge">{item.reason.replaceAll("_", " ")}</span><span
                >↗</span
              ></button
            >{:else}<div class="empty">
              <strong>A little breathing room.</strong>
              <p>No blocked, overdue or review items in this selection.</p>
            </div>{/each}
        {:else if view === "projects"}<div class="grid">
            {#each projects.filter((p) => p.title
                .toLowerCase()
                .includes(search.toLowerCase())) as item}<button
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
        {:else if view === "board"}<div class="board">
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
                    <div class="tags">
                      {#each item.labels ?? [] as label}<span>{label}</span
                        >{/each}
                    </div>
                    <footer>
                      <span class="priority" data-priority={item.priority}
                      ></span><small
                        >{item.due?.date ??
                          item.schedule?.start ??
                          "No date"}</small
                      >{#if item.blocked}<span>Blocked</span>{/if}
                    </footer></button
                  >{:else}<p class="columnempty">Nothing here yet</p>{/each}
              </section>{/each}
          </div>
        {:else if view === "calendar" || view === "gantt"}{#if DateViews}<DateViews
              {project}
              {month}
              {view}
              revision={viewRevision}
              {weekStart}
              {search}
              {open}
              onchanged={() => void refresh().catch(message)}
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
                  <span class="badge">{item.kind}</span>
                  <span class="badge">{item.read ? "Read" : "Unread"}</span>
                </div></button
              >{:else}<div class="empty">
                No updates yet. Record a result, blocker or decision.
              </div>{/each}
          </div>
        {:else}<div class="table">
            <div class="tablehead">
              <span>Title / project</span><span>Status</span><span
                >Due date</span
              >
            </div>
            {#each collection === "cards" ? filtered : milestones.filter((m) => (!project || m.project_id === project) && m.title
                      .toLowerCase()
                      .includes(search.toLowerCase())) as item}<button
                class="listrow"
                onclick={() => open(item)}
                ><div>
                  <strong>{item.title}</strong><small
                    >{projectLabel(item.project_id)}</small
                  >
                </div>
                <span class="badge">{item.status}</span><span
                  >{item.due?.date ?? "—"}</span
                ></button
              >{:else}<div class="empty">
                No items match this selection.
              </div>{/each}
          </div>{/if}
        {#if ["board", "list", "updates"].includes(view)}{@const kind =
            view === "updates"
              ? "update"
              : view === "list" && collection === "milestones"
                ? "milestone"
                : "card"}{#if pageCursors[kind]}<div class="sectiontitle">
              <span>More resources are available.</span><button
                disabled={loadingMore}
                onclick={() => more(kind)}>Load more</button
              >
            </div>{/if}{/if}
        <footer class="pagefooter">
          Your files are the source of truth. <span>Local Projects · v0.1</span>
        </footer>
      </main>
    </div>
  </div>
{/if}
{#if settings}<Settings
    onclose={() => (settings = false)}
    onsaved={() => {
      settings = false;
      void initialize();
    }}
  />{/if}
{#if editor}{#key editor}<Editor
      {...editor}
      onclose={() => (editor = null)}
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
        <button onclick={() => (adding = false)} aria-label="Close">✕</button>
      </header>
      {#if !roots.length}<p>
          No directories have been approved yet. On the host, run:
        </p>
        <code
          >projectctl --socket /path/to/projectd.sock add-root /absolute/path
          --label "Projects"</code
        >{:else}<label
          >Approved directory<select
            bind:value={root}
            onchange={() => browse("")}
            >{#each roots as r}<option value={r.id}>{r.label}</option
              >{/each}</select
          ></label
        >
        <p class="breadcrumb">
          {roots.find((r) => r.id === root)?.display_path}/{relative}
        </p>
        <button
          onclick={() => browse(relative.split("/").slice(0, -1).join("/"))}
          >↑ Parent directory</button
        >
        <div class="directories">
          {#each directories as directory}<button
              onclick={() => browse(directory.relative_path)}
              >▱ {directory.name}{directory.registered ? " · registered" : ""}
              <span>→</span></button
            >{/each}
        </div>
        <label
          >Project name<input
            bind:value={projectName}
            placeholder="Use folder name"
          /></label
        ><label class="check"
          ><input type="checkbox" bind:checked={tracked} /> Track .project files in
          the project’s Git repository</label
        >{#if plan}<details open>
            <summary>Planned changes</summary>
            <pre>{JSON.stringify(plan, null, 2)}</pre>
          </details>
          <button class="primary" onclick={register} disabled={busy}
            >Confirm registration</button
          >{:else}<button class="primary" onclick={preview} disabled={busy}
            >Preview registration</button
          >{/if}{/if}{#if error}<p class="notice">{error}</p>{/if}
    </dialog>
  </div>{/if}

<style>
  :global(:root) {
    --bg: #f5f5ef;
    --paper: #fffefa;
    --ink: #263b32;
    --muted: #778078;
    --line: #e2e5dc;
    --green: #245840;
    --accent: #dce8a9;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    color: var(--ink);
    background: var(--bg);
    font-synthesis: none;
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
    background: #f0f3e8;
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
    background: #fff0e5;
    color: #803c22;
    padding: 14px;
    border: 1px solid #efccb9;
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
    background: #f0f2e9;
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
    background: #e0e8cc;
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
    height: 76px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--line);
    padding: 0 40px;
    font-size: 12px;
  }
  .topbar > div {
    display: flex;
    gap: 20px;
    align-items: center;
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
    padding: 38px 40px 20px;
    margin: auto;
  }
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-bottom: 32px;
  }
  h1 {
    font:
      normal 38px/1.2 Georgia,
      serif;
    letter-spacing: -1px;
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
    margin-bottom: 30px;
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
    margin-bottom: 36px;
  }
  .stats > div {
    padding: 24px 28px;
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
      42px Georgia,
      serif;
    margin: 16px 0 6px;
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
    padding: 22px;
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
    margin: 12px 0 20px;
  }
  .badge {
    font-size: 10px;
    background: #edf0e6;
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
    background: #e4ead6;
    color: #587344;
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
  .priority[data-priority="urgent"] {
    background: #c76548;
  }
  .priority[data-priority="high"] {
    background: #cfab62;
  }
  .empty {
    background: #f0f2e9;
    border: 1px dashed #d4dbc9;
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
    margin-top: 50px;
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
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tags span {
    background: #f2efdf;
    padding: 3px 6px;
    font-size: 9px;
    border-radius: 4px;
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
    grid-template-columns: 1fr 110px 100px;
    padding: 16px 20px;
    font-size: 10px;
    color: var(--muted);
  }
  .table .listrow > span {
    width: 100px;
  }
  .table .listrow > .badge {
    width: 90px;
    text-align: center;
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
    background: #e5ebd6;
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
    background: #fff2d7;
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
  .modal pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 10px;
    max-height: 220px;
    overflow: auto;
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
      font-size: 32px;
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
      height: 50px;
      padding: 0 18px;
      font-size: 10px;
    }
    .topbar .date {
      display: none;
    }
    .content {
      padding: 22px 18px;
    }
    .heading {
      display: block;
      margin-bottom: 22px;
    }
    .heading .primary {
      margin-top: 10px;
    }
    .heading h1 {
      font-size: 30px;
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
      padding: 17px 12px;
    }
    .stats span {
      font-size: 7px;
    }
    .stats strong {
      font-size: 34px;
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
      grid-template-columns: 1fr 76px 76px;
    }
    .table .listrow {
      gap: 8px;
      padding: 14px 12px;
    }
    .table .listrow > span {
      width: 76px;
      font-size: 10px;
    }
    .table .listrow > .badge {
      width: 66px;
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
</style>
