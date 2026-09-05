<script lang="ts">
  import { untrack, onMount } from "svelte";
  import Markdown from "./Markdown.svelte";
  import { modal } from "./dialog";
  import {
    api,
    command,
    send,
    ApiError,
    type Resource,
    type Summary,
    type Pending,
  } from "./api";
  let {
    project,
    type,
    resource,
    onclose,
    onsaved,
  }: {
    project: string;
    type: string;
    resource: Resource | null;
    onclose: () => void;
    onsaved: () => void;
  } = $props();
  const metadata = untrack(() => resource?.metadata) as unknown as
    Record<string, unknown> | undefined;
  let title = $state(
    String(metadata?.title ?? metadata?.name ?? metadata?.summary ?? ""),
  );
  let status = $state(
    String(
      metadata?.status ??
        metadata?.state ??
        untrack(() => (type === "project" ? "active" : "planned")),
    ),
  );
  let priority = $state(String(metadata?.priority ?? "normal"));
  let kind = $state(
    String(
      metadata?.kind ?? untrack(() => (type === "update" ? "note" : "outcome")),
    ),
  );
  const schedule = metadata?.schedule as
    { start: string; end: string } | undefined;
  const deadline = metadata?.due as { date: string; kind: string } | undefined;
  let start = $state(schedule?.start ?? ""),
    end = $state(schedule?.end ?? ""),
    due = $state(deadline?.date ?? ""),
    dueKind = $state(deadline?.kind ?? "target");
  let review = $state(String(metadata?.review_on ?? "")),
    body = $state(untrack(() => resource?.body ?? ""));
  let labels = $state(((metadata?.labels as string[]) ?? []).join(", "));
  let author = $state("Owner"),
    advanced = $state("{}"),
    error = $state(""),
    busy = $state(false),
    pending = $state<Pending | null>(null),
    conflict = $state<Resource | null>(null);

  let preview = $state(false),
    discard = $state(false);
  let phase = $state(String(metadata?.phase ?? ""));
  let archived = $state(Boolean(metadata?.archived));
  let milestoneId = $state(String(metadata?.milestone_id ?? ""));
  let blockedReason = $state(
    String((metadata?.blocked as { reason?: string })?.reason ?? ""),
  );
  let dependencies = $state<string[]>((metadata?.depends_on as string[]) ?? []);
  let targetType = $state(
    String((metadata?.target as { type?: string })?.type ?? "project"),
  );
  let targetId = $state(
    String((metadata?.target as { id?: string })?.id ?? untrack(() => project)),
  );
  let resolves = $state(((metadata?.resolves as string[]) ?? []).join(", "));
  let supersedes = $state(String(metadata?.supersedes ?? ""));
  let choices = $state<Summary[]>([]),
    choiceSearch = $state("");
  let choiceKind = $state("card");
  async function searchChoices() {
    try {
      const page = await api<{ items: Summary[] }>(
        `/api/v1/search?q=${encodeURIComponent(choiceSearch)}&project_id=${project}&limit=50`,
      );
      choices = page.items.filter(
        (item) => item.type === choiceKind && item.id !== resource?.metadata.id,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function snapshot() {
    return JSON.stringify({
      title,
      status,
      priority,
      kind,
      start,
      end,
      due,
      dueKind,
      review,
      body,
      labels,
      advanced,
      author,
      phase,
      archived,
      milestoneId,
      blockedReason,
      dependencies,
      targetType,
      targetId,
      resolves,
      supersedes,
    });
  }
  const baseline = untrack(snapshot);
  let dirty = $derived(snapshot() !== baseline);
  let accessLost = $state(false);
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ fields: JSON.parse(snapshot()), pending }, null, 2),
      );
      error = "Draft copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy your draft fields.";
    }
  }
  onMount(() => {
    const ended = () => {
      if (!dirty && !pending) {
        onclose();
        return;
      }
      accessLost = true;
      history = [];
      focus = null;
      conflict = null;
      error =
        "Your session ended. Your draft is preserved; copy it before closing, then reconnect.";
    };
    const restored = () => {
      accessLost = false;
    };
    window.addEventListener("session-ended", ended);
    window.addEventListener("session-restored", restored);
    return () => {
      window.removeEventListener("session-ended", ended);
      window.removeEventListener("session-restored", restored);
    };
  });
  function close() {
    if (dirty || pending) discard = true;
    else onclose();
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || pending) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  let focus = $state<{
    items: { project_id: string; card_id: string }[];
    version: string;
  } | null>(null);
  let history = $state<
    {
      id: string;
      recorded_at: string;
      changed_fields: string[];
      can_undo: boolean;
    }[]
  >([]);
  let historyCursor = $state<string | null>(null);
  let pinned = $derived(
    !!focus?.items.some(
      (item) =>
        item.project_id === project && item.card_id === resource?.metadata.id,
    ),
  );
  onMount(() => {
    if (type === "card" && resource)
      void api<typeof focus>("/api/v1/workspace/focus")
        .then((value) => (focus = value))
        .catch(() => {});
  });
  async function toggleRead() {
    if (!resource) return;
    pending = command("/api/v1/workspace/read-receipts", "POST", {
      items: [
        {
          project_id: project,
          update_id: resource.metadata.id,
          read: !resource.read,
        },
      ],
    });
    await transmit();
  }
  async function toggleFocus() {
    if (!focus || !resource) return;
    const items = pinned
      ? focus.items.filter(
          (item) =>
            item.project_id !== project ||
            item.card_id !== resource.metadata.id,
        )
      : [
          ...focus.items,
          { project_id: project, card_id: resource.metadata.id },
        ];
    pending = command(
      "/api/v1/workspace/focus",
      "PUT",
      { items },
      focus.version,
    );
    await transmit();
  }
  async function loadHistory(more = false) {
    try {
      const page = await api<{
        items: typeof history;
        page: { next_cursor: string | null };
      }>(
        `${path()}/history${more && historyCursor ? `?cursor=${encodeURIComponent(historyCursor)}` : ""}`,
      );
      history = page.items;
      historyCursor = page.page.next_cursor;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function undo(id: string) {
    if (!resource) return;
    pending = command(
      path(),
      "PATCH",
      { undo: { history_entry_id: id } },
      resource.version,
    );
    await transmit();
  }
  let notice = $state<HTMLDivElement>();
  $effect(() => {
    if (error) notice?.scrollIntoView({ block: "center" });
  });
  let readonly = $derived(type === "update" && !!resource);
  const statuses = $derived(
    type === "project"
      ? ["active", "paused", "archived"]
      : type === "milestone"
        ? ["planned", "active", "achieved", "cancelled"]
        : ["planned", "active", "review", "done", "cancelled"],
  );
  function path() {
    const root = `/api/v1/projects/${project}`;
    return type === "project"
      ? root
      : `${root}/${type === "card" ? "cards" : type === "milestone" ? "milestones" : "updates"}${resource ? `/${resource.metadata.id}` : ""}`;
  }
  async function save() {
    if (busy || readonly) return;
    error = "";
    conflict = null;
    try {
      const extra = JSON.parse(advanced);
      if (!extra || Array.isArray(extra) || typeof extra !== "object")
        throw new Error("Additional fields must be a JSON object.");
      const fields: Record<string, unknown> = { ...extra, body };
      const clear: string[] = [];
      if (type === "project") {
        fields.name = title;
        fields.state = status;
        if (phase) fields.phase = phase;
        else if (metadata?.phase) clear.push("phase");
      } else if (type === "update") {
        fields.summary = title;
        fields.kind = kind;
        fields.author = { kind: "human", label: author };
        fields.target = extra.target ?? {
          type: targetType,
          id: targetType === "project" ? project : targetId,
        };
        if (kind === "resolution")
          fields.resolves = resolves
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        if (kind === "correction") fields.supersedes = supersedes.trim();
      } else {
        fields.title = title;
        fields.status = status;
      }
      if (type === "card") {
        fields.archived = archived;
        if (
          !resource ||
          JSON.stringify(dependencies) !==
            JSON.stringify(metadata?.depends_on ?? [])
        )
          fields.depends_on = dependencies;
        if (milestoneId) fields.milestone_id = milestoneId;
        else if (metadata?.milestone_id) clear.push("milestone_id");
        if (blockedReason.trim())
          fields.blocked = { reason: blockedReason.trim() };
        else if (metadata?.blocked) clear.push("blocked");
        fields.priority = priority;
        fields.kind = kind;
        fields.labels = labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (start && end) fields.schedule = { start, end };
        else if (start || end)
          throw new Error("A schedule needs both start and end dates.");
        else if (metadata?.schedule) clear.push("schedule");
      }
      if (type === "card" || type === "milestone") {
        if (due) fields.due = { date: due, kind: dueKind };
        else if (metadata?.due) clear.push("due");
      }
      if (type === "card" || type === "project") {
        if (review) fields.review_on = review;
        else if (metadata?.review_on) clear.push("review_on");
      }
      const payload = resource
        ? { set: fields, ...(clear.length ? { clear } : {}) }
        : fields;
      pending = command(
        path(),
        resource ? "PATCH" : "POST",
        payload,
        resource?.version,
      );
      await transmit();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function transmit() {
    if (!pending || accessLost) return;
    busy = true;
    error = "";
    try {
      const result = await send(pending);
      if (result.state) {
        error = `Command is ${result.state}. Check its status before retrying.`;
        return;
      }
      pending = null;
      onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError) {
        if (e.status === 412 || e.status === 409) {
          try {
            conflict = await api<Resource>(path());
          } catch {
            /* Keep the draft even if the source is unavailable. */
          }
        }
        if (e.status < 500 && ![401, 403, 429].includes(e.status))
          pending = null;
      }
    } finally {
      busy = false;
    }
  }
  async function resolve() {
    if (!pending) return;
    try {
      const result = await api<{ state: string }>(
        `/api/v1/commands/${pending.requestId}`,
      );
      if (result.state === "committed") {
        pending = null;
        onsaved();
      } else
        error = `Command status: ${result.state}. Your draft is preserved.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />
<dialog
  use:modal
  class="editor"
  aria-label={resource ? "Edit resource" : "Create resource"}
  oncancel={(e) => {
    e.preventDefault();
    if (!busy) close();
  }}
>
  <header>
    <div>
      <p class="eyebrow">{type} · {resource ? "Details" : "New"}</p>
      <h2>
        {readonly
          ? "Update record"
          : resource
            ? "Edit details"
            : `Create ${type}`}
      </h2>
    </div>
    <button aria-label="Close editor" onclick={close} disabled={busy}>✕</button>
  </header>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    {#if discard}<div role="alert" class="notice">
        <p>
          {pending
            ? "The command result may still be unknown. Keep its request ID before closing."
            : "Discard your unsaved draft?"}
        </p>
        <button type="button" onclick={onclose}>Discard draft</button><button
          type="button"
          onclick={() => (discard = false)}>Keep editing</button
        >
      </div>{/if}
    {#if readonly}<button
        type="button"
        onclick={toggleRead}
        disabled={busy || !!pending}
        >{resource?.read ? "Mark unread" : "Mark read"}</button
      >{/if}
    {#if type === "card" && resource}<button
        type="button"
        onclick={toggleFocus}
        disabled={!focus || busy || !!pending}
        >{pinned ? "Remove from focus" : "Pin to focus"}</button
      >{/if}
    <label
      >{type === "project"
        ? "Name"
        : type === "update"
          ? "Summary"
          : "Title"}<input
        bind:value={title}
        required
        maxlength={type === "project" ? 120 : type === "update" ? 500 : 240}
        disabled={readonly || busy}
      /></label
    >
    {#if type !== "update"}<div class="row">
        <label
          >Status<select aria-label="Status" bind:value={status} disabled={busy}
            >{#each statuses as item}<option>{item}</option>{/each}</select
          ></label
        >{#if type === "card"}<label
            >Priority<select
              aria-label="Priority"
              bind:value={priority}
              disabled={busy}
              >{#each ["low", "normal", "high", "urgent"] as item}<option
                  >{item}</option
                >{/each}</select
            ></label
          >{/if}
      </div>{/if}
    {#if type === "card" || type === "update"}<label
        >Kind<select
          aria-label="Kind"
          bind:value={kind}
          disabled={readonly || busy}
          >{#each type === "card" ? ["outcome", "decision"] : ["result", "blocker", "decision_needed", "note", "correction", "resolution"] as item}<option
              >{item}</option
            >{/each}</select
        ></label
      >{/if}
    {#if type === "card"}<fieldset>
        <legend>Planned work · inclusive dates</legend>
        <div class="row">
          <label
            >Start<input
              type="date"
              bind:value={start}
              disabled={busy}
            /></label
          ><label
            >End<input
              type="date"
              bind:value={end}
              min={start}
              disabled={busy}
            /></label
          >
        </div>
      </fieldset>
      <label
        >Labels<input
          bind:value={labels}
          placeholder="Separate with commas"
          disabled={busy}
        /></label
      >{/if}
    {#if type === "card" || type === "milestone"}<div class="row">
        <label
          >Due date<input type="date" bind:value={due} disabled={busy} /></label
        ><label
          >Deadline type<select
            aria-label="Deadline type"
            bind:value={dueKind}
            disabled={busy}
            ><option value="target">Target</option><option value="hard"
              >Hard deadline</option
            ></select
          ></label
        >
      </div>{/if}
    {#if type === "card" || type === "project"}<label
        >Review on<input
          type="date"
          bind:value={review}
          disabled={busy}
        /></label
      >{/if}
    {#if type === "update" && !readonly}<label
        >Author<input
          bind:value={author}
          required
          maxlength="120"
          disabled={busy}
        /></label
      >{/if}
    <label
      >Description <span>Markdown source</span><textarea
        bind:value={body}
        rows="10"
        disabled={readonly || busy}></textarea></label
    >
    <button type="button" onclick={() => (preview = !preview)}
      >{preview ? "Hide preview" : "Preview Markdown"}</button
    >
    {#if preview}<Markdown source={body} />{/if}
    {#if type === "project"}<label
        >Phase<input bind:value={phase} disabled={busy} /></label
      >{/if}
    {#if type === "card"}<fieldset>
        <legend>Connections and blockers</legend>
        <label
          >Milestone ID<input bind:value={milestoneId} disabled={busy} /></label
        >
        <label
          >Blocked reason<textarea bind:value={blockedReason} disabled={busy}
          ></textarea></label
        >
        <label
          ><input type="checkbox" bind:checked={archived} disabled={busy} /> Archived</label
        >
        <p>Dependencies</p>
        {#each dependencies as id}<div>
            {id}<button
              type="button"
              onclick={() =>
                (dependencies = dependencies.filter((value) => value !== id))}
              disabled={busy}>Remove dependency</button
            >
          </div>{/each}
        <label
          >Search for<select bind:value={choiceKind}
            ><option value="card">Dependency card</option><option
              value="milestone">Milestone</option
            ></select
          ></label
        >
        <label>Find by title<input bind:value={choiceSearch} /></label><button
          type="button"
          onclick={searchChoices}
          disabled={!choiceSearch.trim() || busy}>Find resources</button
        >
        {#each choices as item}<button
            type="button"
            disabled={busy}
            onclick={() => {
              if (item.type === "milestone") milestoneId = item.id;
              else if (!dependencies.includes(item.id))
                dependencies = [...dependencies, item.id];
            }}>{item.title}</button
          >{/each}
      </fieldset>{/if}
    {#if type === "update"}<fieldset disabled={readonly || busy}>
        <legend>Report details</legend>
        <label
          >Target type<select bind:value={targetType}
            ><option value="project">Project</option><option value="card"
              >Card</option
            ><option value="milestone">Milestone</option></select
          ></label
        >
        {#if targetType !== "project"}<label
            >Target ID<input bind:value={targetId} required /></label
          >{/if}
        {#if kind === "resolution"}<label
            >Resolved report IDs, separated by commas<input
              bind:value={resolves}
              required
            /></label
          >{/if}
        {#if kind === "correction"}<label
            >Corrected report ID<input
              bind:value={supersedes}
              required
            /></label
          >{/if}
      </fieldset>{/if}
    {#if !readonly}<details>
        <summary>Additional fields</summary>
        <p>
          JSON fields for dependencies, blocked state, milestone, update target,
          evidence or corrections. The server validates all fields.
        </p>
        <textarea
          aria-label="Additional fields JSON"
          bind:value={advanced}
          rows="5"
          spellcheck="false"
          disabled={busy}></textarea>
      </details>{/if}
    {#if resource && !readonly}<details>
        <summary>Change history</summary><button
          type="button"
          onclick={() => loadHistory()}
          disabled={busy || accessLost}>First history page</button
        >{#each history as entry}<div class="historyentry">
            <small>{entry.recorded_at}</small>
            <p>{entry.changed_fields.join(", ")}</p>
            <button
              type="button"
              disabled={!entry.can_undo || busy || !!pending}
              onclick={() => undo(entry.id)}>Undo this change</button
            >
          </div>{/each}{#if historyCursor}<button
            type="button"
            disabled={busy || accessLost}
            onclick={() => loadHistory(true)}>Older changes</button
          >{/if}
      </details>{/if}
    {#if error}<div bind:this={notice} class="notice" role="alert">
        {error}
      </div>{/if}
    {#if conflict}<details open>
        <summary>Current saved version · your draft stays above</summary>
        <pre>{JSON.stringify(
            conflict.metadata,
            null,
            2,
          )}{"\n"}{conflict.body}</pre>
      </details>
      <p>
        Close and reopen to edit the current version. Copy any draft changes you
        want to keep first.
      </p>{/if}
    {#if pending}<p>Request <code>{pending.requestId}</code></p>
      <div class="row">
        <button type="button" onclick={resolve} disabled={busy}
          >Check status</button
        ><button type="button" onclick={transmit} disabled={busy}
          >Retry same command</button
        >
      </div>{/if}
    {#if dirty || pending}<button type="button" onclick={copyDraft}
        >Copy draft</button
      >{/if}
    <footer>
      <button type="button" onclick={close} disabled={busy}
        >{readonly ? "Close" : "Cancel"}</button
      >{#if !readonly}<button
          class="primary"
          type="submit"
          disabled={busy || !!pending || !!conflict || accessLost}
          >{busy ? "Saving…" : resource ? "Save changes" : "Create"}</button
        >{/if}
    </footer>
  </form>
</dialog>

<style>
  .historyentry {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .editor::backdrop {
    background: #152d2860;
  }
  .editor {
    margin: 0 0 0 auto;
    max-height: 100dvh;
    max-width: 100vw;
    height: 100dvh;
    border: 0;
    color: var(--ink);
    position: fixed;
    inset: 0 0 0 auto;
    width: min(100%, 560px);
    box-sizing: border-box;
    background: var(--paper);
    z-index: 21;
    overflow: auto;
    padding: 28px;
    box-shadow: -12px 0 70px #10201b22;
  }
  header,
  footer,
  .row {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  }
  header {
    margin-bottom: 24px;
  }
  header button {
    font-size: 20px;
  }
  .row > label {
    flex: 1;
    min-width: 0;
  }
  label {
    display: block;
    margin: 16px 0;
    font-size: 13px;
    font-weight: 600;
  }
  label span {
    font-weight: 400;
    color: var(--muted);
  }
  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
  }
  textarea {
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
  }
  fieldset {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 14px;
  }
  legend {
    font-size: 12px;
    color: var(--muted);
  }
  details {
    margin: 20px 0;
    font-size: 13px;
  }
  summary {
    cursor: pointer;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
    background: var(--bg);
    padding: 12px;
  }
  footer {
    position: sticky;
    bottom: -28px;
    background: var(--paper);
    padding: 20px 0;
    border-top: 1px solid var(--line);
    margin-top: 24px;
  }
  code {
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  h2 {
    margin: 4px 0;
    font-size: 25px;
  }
</style>
