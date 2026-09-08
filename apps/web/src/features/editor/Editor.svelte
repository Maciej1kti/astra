<script lang="ts">
  import {
    getProject,
    getFocus,
    replaceFocus,
    markRead,
    getHistory,
  } from "../../lib/api/resources";
  import type {
    FocusResource,
    HistoryEntry,
  } from "../../lib/contracts/api.generated";
  import CardRelations from "./CardRelations.svelte";
  import ReportFields from "./ReportFields.svelte";
  import CardPlanningFields from "./CardPlanningFields.svelte";
  import CardPurposeFields from "./CardPurposeFields.svelte";
  import "../../styles/editor.css";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { untrack, onMount } from "svelte";
  import Markdown from "../../lib/ui/Markdown.svelte";

  import CardActivity from "../cards/CardActivity.svelte";

  import CardUpdateComposer from "../cards/CardUpdateComposer.svelte";
  import {
    acceptanceValidation,
    cardPurposeValidation,
  } from "../cards/card-work";
  import { hasCardUpdateDraft, newCardUpdateDraft } from "../cards/card-update";
  import { addTag, tagValidation } from "../tags/tags";
  import { canUndoDraft, type EditorIntent } from "./editor-actions";
  import {
    editorPayload,
    createEditorDraft,
    draftSnapshot,
  } from "./editor-draft";
  import type { EditorTarget } from "./editor-target";

  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { modal } from "../../lib/ui/dialog";
  import {
    api,
    command,
    ApiError,
    type Resource,
    type Pending,
  } from "../../lib/api/api";

  const operation = commandOperation(() => !accessLost);

  let {
    target,
    onclose,
    onsaved,
    onchanged,
    onkeepediting,
  }: {
    target: EditorTarget;
    onclose: () => void;
    onsaved: () => void;
    onchanged?: () => void;
    onkeepediting?: () => void;
  } = $props();

  const project = $derived(target.project);
  const resource = $derived(target.resource);
  const autoCreate = $derived(target.autoCreate ?? false);
  let draft = $state(createEditorDraft(untrack(() => target)));
  let acceptanceError = $state("");
  let updateDraft = $state(newCardUpdateDraft());
  let updatePending = $state<Pending | null>(null);
  let updateBusy = $state(false);
  let cardActivity = $state<{ refresh: () => Promise<void> }>();
  const updateDirty = $derived(hasCardUpdateDraft(updateDraft));
  let tagError = $state("");

  let projectName = $state("");
  let statusMessage = $state("");
  let read = $state(
    untrack(() =>
      resource?.type === "update" ? (resource.read ?? false) : false,
    ),
  );
  let error = $state("");
  let busy = $derived(operation.busy);
  let pending = $derived(operation.pending);
  let conflict = $state<Resource | null>(null);

  let preview = $state(false);
  let discard = $state(false);

  function snapshot() {
    return draftSnapshot(draft);
  }
  let intent: EditorIntent = { kind: "resource" };
  function prepare(next: EditorIntent, command: Pending) {
    operation.prepare(command);
    intent = Object.freeze(next);
  }
  const baseline = untrack(snapshot);
  let cardDirty = $derived(snapshot() !== baseline);
  let dirty = $derived(cardDirty || updateDirty || !!updatePending);
  let accessLost = $state(false);
  let locked = $derived(
    busy || !!pending || accessLost || updateBusy || !!updatePending,
  );

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            fields: JSON.parse(snapshot()),
            pending,
            card_update: { fields: updateDraft, pending: updatePending },
          },
          null,
          2,
        ),
      );
      error = "Draft copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Select and copy your draft draft.fields.";
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
    const unsubscribeSession = subscribeSession({
      ended: ended,
      restored: restored,
    });

    return () => {
      unsubscribeSession();
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

  let focus = $state<FocusResource | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let historyCursor = $state<string | null>(null);
  let pinned = $derived(
    !!focus?.items.some(
      (item) =>
        item.project_id === project && item.card_id === resource?.metadata.id,
    ),
  );
  onMount(() => {
    if (autoCreate && draft.type === "card" && !resource) void save();
    if (draft.type === "card") {
      if (resource) void loadFocus();
    }
    if (draft.type !== "project")
      void getProject(project)
        .then((value) => (projectName = value.metadata.name))
        .catch(() => {});
  });
  async function loadFocus() {
    try {
      focus = await getFocus();
    } catch {
      error = "Focus could not be refreshed. Your draft is preserved.";
    }
  }
  async function toggleRead() {
    if (!resource || locked) return;
    prepare(
      { kind: "read", read: !read },
      markRead({
        items: [
          {
            project_id: project,
            update_id: resource.metadata.id,
            read: !read,
          },
        ],
      }),
    );
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
    prepare(
      { kind: "focus", pinned: !pinned },
      replaceFocus({ items }, focus.version),
    );
    await transmit();
  }
  async function loadHistory(more = false) {
    try {
      if (!resource) return;
      const page = await getHistory(
        { type: resource.type, id: resource.metadata.id, project_id: project },
        more ? historyCursor : undefined,
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
    prepare(
      { kind: "resource" },
      command(
        path(),
        "PATCH",
        { undo: { history_entry_id: id } },
        resource.version,
      ),
    );
    await transmit();
  }
  let notice = $state<HTMLDivElement>();
  $effect(() => {
    if (error) notice?.scrollIntoView({ block: "center" });
  });
  let readonly = $derived(draft.type === "update" && !!resource);
  const statuses = $derived(
    draft.type === "project"
      ? ["active", "paused", "archived"]
      : draft.type === "milestone"
        ? ["planned", "active", "achieved", "cancelled"]
        : ["planned", "active", "review", "done", "cancelled"],
  );
  function path() {
    const root = `/api/v1/projects/${project}`;
    return draft.type === "project"
      ? root
      : `${root}/${draft.type === "card" ? "cards" : draft.type === "milestone" ? "milestones" : "updates"}${resource ? `/${resource.metadata.id}` : ""}`;
  }
  async function save() {
    if (locked || readonly) return;
    error = "";
    statusMessage = "";
    conflict = null;
    try {
      if (draft.type === "card") {
        if (updateDirty)
          throw new Error(
            "Post or discard your update draft before saving the card. Both drafts are preserved.",
          );
        const purposeError = cardPurposeValidation(
          draft.fields.expectedResult,
          draft.fields.owner,
        );
        if (purposeError) throw new Error(purposeError);
        if (draft.fields.acceptanceDraft.trim()) {
          draft.fields.acceptance = [
            ...draft.fields.acceptance,
            {
              id: crypto.randomUUID(),
              text: draft.fields.acceptanceDraft.trim(),
              completed: false,
            },
          ];
          draft.fields.acceptanceDraft = "";
        }
        acceptanceError = acceptanceValidation(draft.fields.acceptance);
        if (acceptanceError) return;
        if (draft.fields.tagDraft.trim()) {
          const added = addTag(draft.fields.labels, draft.fields.tagDraft);
          tagError = added.error;
          if (tagError) return;
          draft.fields.labels = added.labels;
          draft.fields.tagDraft = "";
        }
        tagError = tagValidation(draft.fields.labels);
        if (tagError) return;
      }
      const payload = editorPayload(draft);
      prepare(
        { kind: "resource" },
        command(
          path(),
          resource ? "PATCH" : "POST",
          payload,
          resource?.version,
        ),
      );
      await transmit();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function transmit() {
    if (!pending || accessLost || busy) return;
    const submitted = intent;
    error = "";
    try {
      await operation.commit();
      await completeCommand(submitted);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof ApiError && [409, 412].includes(cause.status)) {
        if (submitted.kind === "focus") {
          await loadFocus();
          error =
            "Focus changed elsewhere. Your draft is preserved. Review the current pin state before trying again.";
        } else if (submitted.kind === "resource") {
          try {
            conflict = await api<Resource>(path());
          } catch {
            /* Keep the draft if the current source is unavailable. */
          }
        }
      }
    }
  }
  async function resolve() {
    if (!pending || busy || accessLost) return;
    const submitted = intent;
    try {
      await operation.confirm();
      await completeCommand(submitted);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  async function completeCommand(submitted: EditorIntent) {
    if (submitted.kind === "resource") {
      onsaved();
      return;
    }
    if (submitted.kind === "focus") {
      statusMessage = submitted.pinned
        ? "Pinned to focus. Your draft is preserved."
        : "Removed from focus. Your draft is preserved.";
      focus = null;
      await loadFocus();
    } else {
      read = submitted.read;
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
        <p class="eyebrow">
          {projectName ? `${projectName} · ` : ""}{draft.type} · {resource
            ? "Details"
            : "New"}
        </p>
        <h2>
          {readonly
            ? draft.common.title || "Update record"
            : resource
              ? draft.common.title || "Untitled"
              : `Create ${draft.type}`}
        </h2>
        {#if !readonly}<p class="draft-state" role="status">
            {busy
              ? "Saving…"
              : updateBusy
                ? "Recording card update…"
                : pending || updatePending
                  ? "Awaiting command confirmation"
                  : conflict
                    ? "Conflict · draft preserved"
                    : dirty
                      ? "Unsaved changes"
                      : resource
                        ? "Saved version"
                        : "New draft"}
          </p>{/if}
      </div>
      <button
        aria-label="Close editor"
        onclick={close}
        disabled={busy || updateBusy}>✕</button
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
          <button type="button" onclick={onclose} disabled={busy || updateBusy}
            >Discard draft</button
          ><button type="button" onclick={keepEditing}>Keep editing</button>
        </div>{/if}
      {#if readonly}<button type="button" onclick={toggleRead} disabled={locked}
          >{read ? "Mark unread" : "Mark read"}</button
        >{/if}
      {#if draft.type === "card" && resource}<button
          type="button"
          onclick={toggleFocus}
          disabled={!focus || locked}
          >{pinned ? "Remove from focus" : "Pin to focus"}</button
        >{#if !focus && !busy}<button
            type="button"
            onclick={loadFocus}
            disabled={locked}>Refresh focus state</button
          >{/if}{/if}
      {#if statusMessage}<p class="action-status" role="status">
          {statusMessage}
        </p>{/if}
      <label
        >{draft.type === "project"
          ? "Name"
          : draft.type === "update"
            ? "Summary"
            : "Title"}<input
          bind:value={draft.common.title}
          required
          maxlength={draft.type === "project"
            ? 120
            : draft.type === "update"
              ? 500
              : 240}
          disabled={readonly || locked}
        /></label
      >
      {#if draft.type !== "update"}<div class="row">
          <label
            >Status<select
              aria-label="Status"
              bind:value={draft.fields.status}
              disabled={locked}
              >{#each statuses as item}<option value={item}
                  >{resourceLabel(item)}</option
                >{/each}</select
            ></label
          >{#if draft.type === "card"}<label
              >Priority<select
                aria-label="Priority"
                bind:value={draft.fields.priority}
                disabled={locked}
                >{#each ["low", "normal", "high", "urgent"] as item}<option
                    value={item}>{resourceLabel(item)}</option
                  >{/each}</select
              ></label
            >{/if}
        </div>{/if}
      {#if draft.type === "card" || draft.type === "update"}<label
          >Kind<select
            aria-label="Kind"
            bind:value={draft.fields.kind}
            disabled={readonly || locked}
            >{#each draft.type === "card" ? ["outcome", "decision"] : ["result", "blocker", "decision_needed", "note", "correction", "resolution"] as item}<option
                value={item}>{resourceLabel(item)}</option
              >{/each}</select
          ></label
        >{/if}
      {#if draft.type === "card"}<CardPurposeFields
          bind:fields={draft.fields}
          {locked}
        />{/if}
      <label class="description-label"
        >Description <span
          >{draft.type === "card"
            ? "Context and supporting details · Markdown"
            : "Markdown source"}</span
        ><textarea
          bind:value={draft.common.body}
          rows="8"
          disabled={readonly || locked}></textarea></label
      >
      <button type="button" onclick={() => (preview = !preview)}
        >{preview ? "Hide preview" : "Preview Markdown"}</button
      >
      {#if preview}<Markdown source={draft.common.body} />{/if}
      {#if draft.type === "card"}<CardPlanningFields
          bind:fields={draft.fields}
          {locked}
          bind:acceptanceError
          bind:tagError
        />{/if}
      {#if draft.type === "card" || draft.type === "milestone"}<div class="row">
          <label
            >Due date<input
              type="date"
              bind:value={draft.fields.due}
              disabled={locked}
            /></label
          ><label
            >Deadline type<select
              aria-label="Deadline type"
              bind:value={draft.fields.dueKind}
              disabled={locked}
              ><option value="target">Target</option><option value="hard"
                >Hard deadline</option
              ></select
            ></label
          >
        </div>{/if}
      {#if draft.type === "card" || draft.type === "project"}<label
          >Review on<input
            type="date"
            bind:value={draft.fields.review}
            disabled={locked}
          /></label
        >{/if}
      {#if draft.type === "update" && !readonly}<label
          >Author<input
            bind:value={draft.fields.author}
            required
            maxlength="120"
            disabled={locked}
          /></label
        >{/if}
      {#if draft.type === "project"}<label
          >Phase<input
            bind:value={draft.fields.phase}
            disabled={locked}
          /></label
        >{/if}
      {#if draft.type === "card"}<CardRelations
          bind:fields={draft.fields}
          {project}
          cardId={resource?.metadata.id}
          {locked}
        />{/if}
      {#if draft.type === "update"}<ReportFields
          bind:fields={draft.fields}
          locked={readonly || locked}
        />{/if}
      {#if draft.type === "card" && resource}
        <CardUpdateComposer
          {project}
          cardId={resource.metadata.id}
          bind:draft={updateDraft}
          bind:pending={updatePending}
          bind:busy={updateBusy}
          disabled={busy || !!pending || accessLost}
          onposted={() => {
            void cardActivity?.refresh();
            onchanged?.();
          }}
        />
        <CardActivity
          bind:this={cardActivity}
          {project}
          cardId={resource.metadata.id}
          disabled={accessLost}
        />
      {/if}
      {#if !readonly}<details>
          <summary>Additional fields</summary>
          <p>
            Technical extensions and report evidence. Use the named fields above
            for ordinary changes. The server validates every field.
          </p>
          <textarea
            aria-label="Additional fields JSON"
            bind:value={draft.common.advanced}
            rows="5"
            spellcheck="false"
            disabled={locked}></textarea>
        </details>{/if}
      {#if resource && !readonly}<details>
          <summary>Change history</summary><button
            type="button"
            onclick={() => loadHistory()}
            disabled={busy || accessLost}>First history page</button
          >{#if dirty}<p class="empty-context">
              Save or discard your draft before undoing a saved change.
            </p>{/if}{#each history as entry}<div class="historyentry">
              <small>{entry.recorded_at}</small>
              <p>{entry.changed_fields.join(", ")}</p>
              <button
                type="button"
                disabled={!entry.can_undo ||
                  !canUndoDraft(dirty, !!pending, busy || updateBusy) ||
                  accessLost}
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
          ><button
            type="button"
            onclick={transmit}
            disabled={busy || accessLost}>Retry same command</button
          >
        </div>{/if}
      {#if dirty || pending}<button type="button" onclick={copyDraft}
          >Copy draft</button
        >{/if}
      {#if updateDirty || updatePending}<p class="empty-context">
          Post or discard the update draft before saving this card. Copy draft
          includes both drafts and any unresolved request.
        </p>{/if}
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
