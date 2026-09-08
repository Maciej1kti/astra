<script lang="ts">
  import { untrack, onMount } from "svelte";
  import Markdown from "./Markdown.svelte";
  import TagPicker from "./TagPicker.svelte";
  import CardActivity from "./CardActivity.svelte";
  import AcceptanceChecklist from "./AcceptanceChecklist.svelte";
  import CardUpdateComposer from "./CardUpdateComposer.svelte";
  import { acceptanceValidation, cardPurposeValidation, type AcceptanceItem } from "./card-work";
  import { hasCardUpdateDraft, newCardUpdateDraft } from "./card-update";
  import { addTag, tagValidation } from "./tags";
  import { canUndoDraft, editorCompletion } from "./editor-actions";
  import { resourceLabel } from "./resource-presentation";
  import { modal } from "./dialog";
  import {
    api,
    all,
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
    initialMetadata,
    autoCreate = false,
    onclose,
    onsaved,
    onchanged,
    onkeepediting,
  }: {
    project: string;
    type: string;
    resource: Resource | null;
    initialMetadata?: Record<string, unknown>;
    autoCreate?: boolean;
    onclose: () => void;
    onsaved: () => void;
    onchanged?: () => void;
    onkeepediting?: () => void;
  } = $props();
  const metadata = untrack(
    () => resource?.metadata ?? initialMetadata,
  ) as unknown as Record<string, unknown> | undefined;
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
  let labels = $state<string[]>([...((metadata?.labels as string[]) ?? [])]);
  let expectedResult = $state(String(metadata?.expected_result ?? ""));
  let owner = $state(String(metadata?.owner ?? ""));
  let acceptance = $state<AcceptanceItem[]>(((metadata?.acceptance as AcceptanceItem[]) ?? []).map((item) => ({ ...item })));
  let acceptanceDraft = $state(""), acceptanceError = $state("");
  let updateDraft = $state(newCardUpdateDraft());
  let updatePending = $state<Pending | null>(null), updateBusy = $state(false);
  let cardActivity = $state<{ refresh: () => Promise<void> }>();
  const updateDirty = $derived(hasCardUpdateDraft(updateDraft));
  let tagDraft = $state(""), tagError = $state("");
  let labelOptions = $state<string[]>([]), choicesLoading = $state(false), discoveryError = $state("");
  let relationIndex = $state<Record<string, Summary>>({});
  let projectName = $state("");
  let statusMessage = $state("");
  let read = $state(untrack(() => resource?.read ?? false));
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
      expectedResult,
      owner,
      acceptance,
      acceptanceDraft,
      tagDraft,
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
  let cardDirty = $derived(snapshot() !== baseline);
  let dirty = $derived(cardDirty || updateDirty || !!updatePending);
  let accessLost = $state(false);
  let locked = $derived(busy || !!pending || accessLost || updateBusy || !!updatePending);
  async function loadProjectChoices() {
    choicesLoading = true;
    discoveryError = "";
    try {
      const [cards, archivedCards, milestones] = await Promise.all([
        all(`/api/v1/projects/${project}/cards?archived=false`),
        all(`/api/v1/projects/${project}/cards?archived=true`),
        all(`/api/v1/projects/${project}/milestones`),
      ]);
      const available = [...cards, ...archivedCards, ...milestones];
      relationIndex = Object.fromEntries(available.map((item) => [item.id, item]));
      labelOptions = [...new Set(available.flatMap((item) => item.labels ?? []))];
    } catch {
      discoveryError = "Project suggestions are unavailable. You can still enter a tag.";
    } finally {
      choicesLoading = false;
    }
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ fields: JSON.parse(snapshot()), pending, card_update: { fields: updateDraft, pending: updatePending } }, null, 2),
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
    if (busy || updateBusy) return;
    if (dirty || pending) discard = true;
    else onclose();
  }
  export function requestClose() {
    if (busy || updateBusy) return false;
    close();
    return true;
  }
  function keepEditing() {
    discard = false;
    onkeepediting?.();
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
    if (autoCreate && type === "card" && !resource) void save();
    if (type === "card") {
      void loadProjectChoices();
      if (resource) void loadFocus();
    }
    if (type !== "project")
      void api<Resource>(`/api/v1/projects/${project}`)
        .then((value) => (projectName = String((value.metadata as Record<string, unknown>).name ?? "")))
        .catch(() => {});
  });
  async function loadFocus() {
    try {
      focus = await api<typeof focus>("/api/v1/workspace/focus");
    } catch {
      error = "Focus could not be refreshed. Your draft is preserved.";
    }
  }
  async function toggleRead() {
    if (!resource || locked) return;
    pending = command("/api/v1/workspace/read-receipts", "POST", {
      items: [
        {
          project_id: project,
          update_id: resource.metadata.id,
          read: !read,
        },
      ],
    });
    await transmit();
  }
  async function toggleFocus() {
    if (!focus || !resource || locked) return;
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
    if (!canUndoDraft(dirty, !!pending, busy || updateBusy) || accessLost) {
      error = "Save or discard your draft before undoing a saved change.";
      return;
    }
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
    if (locked || readonly) return;
    error = "";
    statusMessage = "";
    conflict = null;
    try {
      if (type === "card") {
        if (updateDirty) throw new Error("Post or discard your update draft before saving the card. Both drafts are preserved.");
        const purposeError = cardPurposeValidation(expectedResult, owner);
        if (purposeError) throw new Error(purposeError);
        if (acceptanceDraft.trim()) {
          acceptance = [...acceptance, { id: crypto.randomUUID(), text: acceptanceDraft.trim(), completed: false }];
          acceptanceDraft = "";
        }
        acceptanceError = acceptanceValidation(acceptance);
        if (acceptanceError) return;
        if (tagDraft.trim()) {
          const added = addTag(labels, tagDraft);
          tagError = added.error;
          if (tagError) return;
          labels = added.labels;
          tagDraft = "";
        }
        tagError = tagValidation(labels);
        if (tagError) return;
      }
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
        if (expectedResult.trim()) fields.expected_result = expectedResult;
        else if (metadata?.expected_result !== undefined) clear.push("expected_result");
        if (owner.trim()) fields.owner = owner;
        else if (metadata?.owner !== undefined) clear.push("owner");
        if (acceptance.length) fields.acceptance = acceptance.map((item) => ({ ...item }));
        else if (metadata?.acceptance !== undefined) clear.push("acceptance");
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
        fields.labels = [...labels];
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
    if (!pending || accessLost || busy) return;
    const submitted = pending;
    busy = true;
    error = "";
    try {
      const result = await send(submitted);
      if (result.state) {
        error = `Command is ${result.state}. Check its status before retrying.`;
        return;
      }
      await completeCommand(submitted);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError) {
        if (e.status === 412 || e.status === 409) {
          if (editorCompletion(submitted) === "focus") {
            await loadFocus();
            error = "Focus changed elsewhere. Your draft is preserved. Review the current pin state before trying again.";
          } else if (editorCompletion(submitted) === "resource") {
            try {
              conflict = await api<Resource>(path());
            } catch {
              /* Keep the draft even if the source is unavailable. */
            }
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
    if (!pending || busy || accessLost) return;
    const submitted = pending;
    busy = true;
    try {
      const result = await api<{ state: string }>(
        `/api/v1/commands/${submitted.requestId}`,
      );
      if (result.state === "committed") {
        await completeCommand(submitted);
      } else
        error = `Command status: ${result.state}. Your draft is preserved.`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function completeCommand(submitted: Pending) {
    pending = null;
    const effect = editorCompletion(submitted);
    if (effect === "resource") {
      onsaved();
      return;
    }
    if (effect === "focus") {
      const items = (submitted.payload as { items: { project_id: string; card_id: string }[] }).items;
      const nowPinned = items.some((item) => item.project_id === project && item.card_id === resource?.metadata.id);
      statusMessage = nowPinned ? "Pinned to focus. Your draft is preserved." : "Removed from focus. Your draft is preserved.";
      focus = null;
      await loadFocus();
    } else {
      read = (submitted.payload as { items: { read: boolean }[] }).items[0].read;
      statusMessage = read ? "Marked as read." : "Marked as unread.";
    }
    onchanged?.();
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />
<dialog
  use:modal
  class="editor"
  aria-label={resource ? "Edit resource" : "Create resource"}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  {#if autoCreate && !error && !conflict && !discard}<p role="status">
      Creating card…
    </p>{/if}
  <div class:quick-pending={autoCreate && !error && !conflict && !discard}>
    <header>
      <div>
        <p class="eyebrow">{projectName ? `${projectName} · ` : ""}{type} · {resource ? "Details" : "New"}</p>
        <h2>
          {readonly
            ? title || "Update record"
            : resource
              ? title || "Untitled"
              : `Create ${type}`}
        </h2>
        {#if !readonly}<p class="draft-state" role="status">{busy ? "Saving…" : updateBusy ? "Recording card update…" : pending || updatePending ? "Awaiting command confirmation" : conflict ? "Conflict · draft preserved" : dirty ? "Unsaved changes" : resource ? "Saved version" : "New draft"}</p>{/if}
      </div>
      <button aria-label="Close editor" onclick={close} disabled={busy || updateBusy}
        >✕</button
      >
    </header>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {#if discard}<div role="alert" class="notice">
          <p>
            {pending || updatePending
              ? "The command result may still be unknown. Keep its request ID before closing."
              : "Discard your unsaved draft?"}
          </p>
          <button type="button" onclick={onclose} disabled={busy || updateBusy}>Discard draft</button><button
            type="button"
            onclick={keepEditing}>Keep editing</button
          >
        </div>{/if}
      {#if readonly}<button
          type="button"
          onclick={toggleRead}
          disabled={locked}
          >{read ? "Mark unread" : "Mark read"}</button
        >{/if}
      {#if type === "card" && resource}<button
          type="button"
          onclick={toggleFocus}
          disabled={!focus || locked}
          >{pinned ? "Remove from focus" : "Pin to focus"}</button
        >{#if !focus && !busy}<button type="button" onclick={loadFocus} disabled={locked}>Refresh focus state</button>{/if}{/if}
      {#if statusMessage}<p class="action-status" role="status">{statusMessage}</p>{/if}
      <label
        >{type === "project"
          ? "Name"
          : type === "update"
            ? "Summary"
            : "Title"}<input
          bind:value={title}
          required
          maxlength={type === "project" ? 120 : type === "update" ? 500 : 240}
          disabled={readonly || locked}
        /></label
      >
      {#if type !== "update"}<div class="row">
          <label
            >Status<select
              aria-label="Status"
              bind:value={status}
              disabled={locked}
              >{#each statuses as item}<option value={item}>{resourceLabel(item)}</option>{/each}</select
            ></label
          >{#if type === "card"}<label
              >Priority<select
                aria-label="Priority"
                bind:value={priority}
                disabled={locked}
                >{#each ["low", "normal", "high", "urgent"] as item}<option value={item}
                    >{resourceLabel(item)}</option
                  >{/each}</select
              ></label
            >{/if}
        </div>{/if}
      {#if type === "card" || type === "update"}<label
          >Kind<select
            aria-label="Kind"
            bind:value={kind}
            disabled={readonly || locked}
            >{#each type === "card" ? ["outcome", "decision"] : ["result", "blocker", "decision_needed", "note", "correction", "resolution"] as item}<option value={item}
                >{resourceLabel(item)}</option
              >{/each}</select
          ></label
        >{/if}
      {#if type === "card"}
        <label class="description-label">Expected result <span>What should this card deliver?</span><textarea bind:value={expectedResult} rows="3" disabled={locked}></textarea></label>
        <label>Owner <span>Optional display name</span><input bind:value={owner} disabled={locked} placeholder="Who is responsible?" /></label>
      {/if}
      <label class="description-label"
        >Description <span>{type === "card" ? "Context and supporting details · Markdown" : "Markdown source"}</span><textarea
          bind:value={body}
          rows="8"
          disabled={readonly || locked}></textarea></label
      >
      <button type="button" onclick={() => (preview = !preview)}
        >{preview ? "Hide preview" : "Preview Markdown"}</button
      >
      {#if preview}<Markdown source={body} />{/if}
      {#if type === "card"}
        <AcceptanceChecklist bind:items={acceptance} bind:draft={acceptanceDraft} bind:error={acceptanceError} disabled={locked} />
        <TagPicker bind:labels bind:draft={tagDraft} bind:error={tagError} options={labelOptions} disabled={locked} loading={choicesLoading} {discoveryError} onretry={loadProjectChoices} />
        <h3>Planning</h3><fieldset>
          <legend>Planned work · inclusive dates</legend>
          <div class="row">
            <label
              >Start<input
                type="date"
                bind:value={start}
                disabled={locked}
              /></label
            ><label
              >End<input
                type="date"
                bind:value={end}
                min={start}
                disabled={locked}
              /></label
            >
          </div>
        </fieldset>{/if}
      {#if type === "card" || type === "milestone"}<div class="row">
          <label
            >Due date<input
              type="date"
              bind:value={due}
              disabled={locked}
            /></label
          ><label
            >Deadline type<select
              aria-label="Deadline type"
              bind:value={dueKind}
              disabled={locked}
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
            disabled={locked}
          /></label
        >{/if}
      {#if type === "update" && !readonly}<label
          >Author<input
            bind:value={author}
            required
            maxlength="120"
            disabled={locked}
          /></label
        >{/if}
      {#if type === "project"}<label
          >Phase<input bind:value={phase} disabled={locked} /></label
        >{/if}
      {#if type === "card"}<fieldset>
          <legend>Connections and blockers</legend>
          <p class="field-title">Milestone</p>
          {#if milestoneId}<div class="relation-row"><span>{relationIndex[milestoneId]?.title ?? (choicesLoading ? "Loading milestone…" : "Unavailable milestone")}</span><button type="button" disabled={locked} onclick={() => (milestoneId = "")}>Remove milestone</button></div>
          {:else}<p class="empty-context">No milestone assigned. Find one by its title below.</p>{/if}
          <label
            >Blocked reason<textarea bind:value={blockedReason} disabled={locked}
            ></textarea></label
          >
          <p class="field-title">Dependencies · must finish first</p>
          {#if !dependencies.length}<p class="empty-context">No predecessor cards.</p>{/if}
          {#each dependencies as id}<div class="relation-row">
              <span>{relationIndex[id]?.title ?? (choicesLoading ? "Loading card…" : "Unavailable card")}</span><button
                type="button"
                onclick={() =>
                  (dependencies = dependencies.filter((value) => value !== id))}
                aria-label={`Remove dependency ${relationIndex[id]?.title ?? id}`}
                disabled={locked}>Remove dependency</button
              >
            </div>{/each}
          <label
            >Search for<select bind:value={choiceKind} disabled={locked}
              ><option value="card">Dependency card</option><option
                value="milestone">Milestone</option
              ></select
            ></label
          >
          <label>Find by title<input bind:value={choiceSearch} disabled={locked} /></label><button
            type="button"
            onclick={searchChoices}
            disabled={!choiceSearch.trim() || locked}>Find resources</button
          >
          {#each choices as item}<button
              type="button"
              disabled={locked || (item.type === "milestone" ? milestoneId === item.id : dependencies.includes(item.id))}
              onclick={() => {
                relationIndex = { ...relationIndex, [item.id]: item };
                if (item.type === "milestone") milestoneId = item.id;
                else if (!dependencies.includes(item.id))
                  dependencies = [...dependencies, item.id];
              }}>{item.title}</button
            >{/each}
          <details><summary>Connection identifiers</summary><p class="empty-context">Technical identifiers for source-file inspection.</p><p>Milestone: <code>{milestoneId || "None"}</code></p>{#each dependencies as id}<p>Dependency: <code>{id}</code></p>{/each}</details>
        </fieldset>
        <details><summary>Card lifecycle</summary><label><input type="checkbox" bind:checked={archived} disabled={locked} /> Archived</label><p class="empty-context">Archived cards remain in the project and can be restored from the archive filter.</p></details>
      {/if}
      {#if type === "update"}<fieldset disabled={readonly || locked}>
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
      {#if type === "card" && resource}
        <CardUpdateComposer {project} cardId={resource.metadata.id} bind:draft={updateDraft} bind:pending={updatePending} bind:busy={updateBusy} disabled={busy || !!pending || accessLost} onposted={() => { void cardActivity?.refresh(); onchanged?.(); }} />
        <CardActivity bind:this={cardActivity} {project} cardId={resource.metadata.id} disabled={accessLost} />
      {/if}
      {#if !readonly}<details>
          <summary>Additional fields</summary>
          <p>
            Technical extensions and report evidence. Use the named fields above
            for ordinary changes. The server validates every field.
          </p>
          <textarea
            aria-label="Additional fields JSON"
            bind:value={advanced}
            rows="5"
            spellcheck="false"
            disabled={locked}></textarea>
        </details>{/if}
      {#if resource && !readonly}<details>
          <summary>Change history</summary><button
            type="button"
            onclick={() => loadHistory()}
            disabled={busy || accessLost}>First history page</button
          >{#if dirty}<p class="empty-context">Save or discard your draft before undoing a saved change.</p>{/if}{#each history as entry}<div class="historyentry">
              <small>{entry.recorded_at}</small>
              <p>{entry.changed_fields.join(", ")}</p>
              <button
                type="button"
                disabled={!entry.can_undo || !canUndoDraft(dirty, !!pending, busy || updateBusy) || accessLost}
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
          Close and reopen to edit the current version. Copy any draft changes
          you want to keep first.
        </p>{/if}
      {#if pending}<p>Request <code>{pending.requestId}</code></p>
        <div class="row">
          <button type="button" onclick={resolve} disabled={busy || accessLost}
            >Check status</button
          ><button type="button" onclick={transmit} disabled={busy || accessLost}
            >Retry same command</button
          >
        </div>{/if}
      {#if dirty || pending}<button type="button" onclick={copyDraft}
          >Copy draft</button
        >{/if}
      {#if updateDirty || updatePending}<p class="empty-context">Post or discard the update draft before saving this card. Copy draft includes both drafts and any unresolved request.</p>{/if}
      <footer>
        <button type="button" onclick={close} disabled={busy || updateBusy}
          >{readonly ? "Close" : "Cancel"}</button
        >{#if !readonly}<button
            class="primary"
            type="submit"
            disabled={locked || !!conflict || updateDirty}
            >{busy ? "Saving…" : resource ? "Save changes" : "Create"}</button
          >{/if}
      </footer>
    </form>
  </div>
</dialog>

<style>
  .quick-pending {
    display: none;
  }
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
    position: sticky;
    top: -28px;
    z-index: 2;
    background: var(--paper);
    padding: 16px 0;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }
  header > div { min-width: 0; }
  header .eyebrow { overflow-wrap: anywhere; margin: 0 0 4px; }
  .draft-state, .action-status, .empty-context { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .draft-state { margin: 6px 0 0; }
  .action-status { padding: 8px 10px; background: var(--bg); border-radius: 6px; }
  h3 { font-size: 15px; margin: 28px 0 12px; }
  .field-title { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
  .relation-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); padding: 8px 0; font-size: 13px; }
  .relation-row span { min-width: 0; overflow-wrap: anywhere; }
  .relation-row button { flex-shrink: 0; }
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
  input[type="checkbox"] { width: auto; margin: 0 8px 0 0; }
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
    font-size: 21px;
    line-height: 1.3;
    overflow-wrap: anywhere;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  @media (max-width: 520px) {
    .editor { padding: 16px; }
    header { top: -16px; }
    footer { bottom: -16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
    .row { gap: 10px; }
    .relation-row { align-items: flex-start; flex-wrap: wrap; }
  }
</style>
