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
    CommandResponse,
  } from "../../lib/contracts/api.generated";
  import ReportFields from "./ReportFields.svelte";
  import CardPlanningFields from "./CardPlanningFields.svelte";
  import "../../styles/editor.css";
  import { subscribeSession } from "../../lib/api/session-events";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import { untrack, onMount } from "svelte";
  import Markdown from "../../lib/ui/Markdown.svelte";

  import { acceptanceValidation } from "../cards/card-work";
  import { tagValidation } from "../tags/tags";
  import { canUndoDraft, type EditorIntent } from "./editor-actions";
  import {
    type EditorDraft,
    editorPayload,
    createEditorDraft,
    draftSnapshot,
    autosaveSnapshot,
    detachedEditorDraft,
  } from "./editor-draft";
  import { EditorAutosave, type AutosaveState } from "./editor-autosave.ts";
  import { editTarget, type EditorTarget } from "./editor-target";

  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { modal } from "../../lib/ui/dialog";
  import { api, command, type Resource, type Pending } from "../../lib/api/api";
  import { deleteCard } from "../../lib/api/resources";

  const operation = commandOperation(() => !accessLost);
  const deleteOperation = commandOperation(() => !accessLost);

  let {
    target,
    onclose,
    onsaved,
    onautosaved,
    ondeleted,
    onchanged,
    onkeepediting,
  }: {
    target: EditorTarget;
    onclose: () => void;
    onsaved: () => void;
    onautosaved?: (resource: Resource) => void;
    ondeleted: () => void;
    onchanged?: () => void;
    onkeepediting?: () => void;
  } = $props();

  const project = $derived(target.project);
  let currentResource = $state<Resource | null>(untrack(() => target.resource));
  const resource = $derived(currentResource);
  const autoCreate = $derived(target.autoCreate ?? false);
  let draft = $state(createEditorDraft(untrack(() => target)));
  let acceptanceError = $state("");
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
  let deleteBusy = $derived(deleteOperation.busy);
  let deletePending = $derived(deleteOperation.pending);
  let deleteError = $state("");
  let deleteConflict = $state(false);
  let deleteFlushing = $state(false);
  let deleteConfirmation = $state<"drafts" | "final" | null>(null);
  let deleteNotice = $state<HTMLDivElement>();
  let conflict = $state<{ current: Resource | null } | null>(null);
  let autosaveState = $state<AutosaveState>({
    phase: "idle",
    pending: null,
    queued: false,
    error: null,
  });
  let autosaveError = $state("");
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autosaveCreated = false;
  let disposed = false;
  const autosaveBusy = $derived(
    autosaveState.phase === "submitting" || autosaveState.phase === "checking",
  );
  const autosaveWork = $derived(
    !!autosaveState.pending || autosaveState.queued,
  );

  let preview = $state(false);
  let descriptionEditing = $state(false);
  let descriptionPointerOutside = false;
  let descriptionInput = $state<HTMLTextAreaElement>();
  let descriptionCloseButton = $state<HTMLButtonElement>();
  let discard = $state(false);
  let closing = $state(false);

  function snapshot() {
    return draftSnapshot(draft);
  }
  let intent: EditorIntent = { kind: "resource" };
  function prepare(next: EditorIntent, command: Pending) {
    operation.prepare(command);
    intent = Object.freeze(next);
  }
  let baseline = $state(untrack(() => autosaveSnapshot(draft)));
  const explicitBaseline = untrack(snapshot);
  const autosaveResource = $derived(
    draft.type === "card" || draft.type === "project",
  );
  const persistedDirty = $derived(
    autosaveResource
      ? autosaveSnapshot(draft) !== baseline
      : snapshot() !== explicitBaseline,
  );
  const unfinishedEntry = $derived(
    draft.type === "card" &&
      (!!draft.fields.tagDraft.trim() || !!draft.fields.acceptanceDraft.trim()),
  );
  let dirty = $derived(persistedDirty || unfinishedEntry);
  let accessLost = $state(false);
  let locked = $derived(
    busy ||
      !!pending ||
      accessLost ||
      deleteBusy ||
      !!deletePending ||
      !!deleteConfirmation ||
      deleteFlushing ||
      closing,
  );

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            fields: JSON.parse(snapshot()),
            pending,
            autosave_pending: autosave.pending,
            delete_pending: deletePending,
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
      if (!dirty && !pending && !deletePending && !autosave.hasWork) {
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
      disposed = true;
      clearAutosaveTimer();
      unsubscribeSession();
    };
  });
  function close() {
    if (closing || busy || deleteBusy) return;
    if (autosaveResource && (autosave.hasWork || persistedDirty)) {
      closing = true;
      void flushAutosave()
        .then(() => {
          if (autosave.hasWork || dirty) discard = true;
          else onclose();
        })
        .catch(() => {
          discard = true;
        })
        .finally(() => {
          closing = false;
        });
      return;
    }
    if (dirty || pending || deletePending) discard = true;
    else onclose();
  }
  export function requestClose() {
    if (busy || deleteBusy) return false;
    void close();
    return true;
  }
  function keepEditing() {
    discard = false;
    onkeepediting?.();
  }
  function beginDescriptionEdit(event?: Event) {
    const target = event?.target;
    if (target instanceof Element && target.closest("a")) return;
    if ((draft.type === "project" || draft.type === "card") && !locked)
      descriptionEditing = true;
  }
  function finishDescriptionEdit() {
    if (draft.type !== "project" && draft.type !== "card") return;
    descriptionEditing = false;
    descriptionPointerOutside = false;
    if (persistedDirty && !closing)
      void flushAutosave().catch((cause) => {
        autosaveError = cause instanceof Error ? cause.message : String(cause);
      });
  }
  function blurDescription() {
    // Keep the clicked control in place until its click has been dispatched.
    if (!descriptionPointerOutside) finishDescriptionEdit();
  }
  $effect(() => {
    if (!descriptionEditing || !descriptionInput) return;
    queueMicrotask(() => {
      if (!descriptionEditing || !descriptionInput) return;
      descriptionInput.focus();
      descriptionInput.setSelectionRange(
        descriptionInput.value.length,
        descriptionInput.value.length,
      );
    });
  });
  $effect(() => {
    if (!descriptionEditing) return;
    const outsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (descriptionInput?.contains(target)) return;
      if (descriptionCloseButton?.contains(target)) return;
      descriptionPointerOutside = true;
    };
    const finishPointer = () => {
      if (descriptionPointerOutside) finishDescriptionEdit();
    };
    document.addEventListener("pointerdown", outsidePointer, true);
    document.addEventListener("click", finishPointer);
    document.addEventListener("pointercancel", finishPointer);
    return () => {
      document.removeEventListener("pointerdown", outsidePointer, true);
      document.removeEventListener("click", finishPointer);
      document.removeEventListener("pointercancel", finishPointer);
    };
  });
  function focusDeleteAction(node: HTMLButtonElement) {
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "center", inline: "nearest" });
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || pending || deletePending || autosave.hasWork) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  let focus = $state<FocusResource | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let historyCursor = $state<string | null>(null);
  let historyLoaded = false;
  let pinned = $derived(
    !!focus?.items.some(
      (item) =>
        item.project_id === project && item.card_id === resource?.metadata.id,
    ),
  );
  onMount(() => {
    if (
      autoCreate &&
      draft.type === "card" &&
      !resource &&
      draft.common.title.trim()
    )
      queueAutosave();
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
    if (!focus || !resource || locked || persistedDirty || autosave.hasWork)
      return;
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
      historyLoaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function undo(id: string) {
    if (!resource) return;
    if (locked || autosave.hasWork || !canUndoDraft(dirty, !!pending, busy)) {
      error =
        "Wait for changes to save, or resolve your draft before undoing a saved change.";
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
  function autosavePath(source: Resource | null) {
    const root = `/api/v1/projects/${project}`;
    if (draft.type === "project") return root;
    return `${root}/cards${source ? `/${source.metadata.id}` : ""}`;
  }
  function draftForResource(next: Resource): EditorDraft {
    return createEditorDraft(editTarget(project, next));
  }
  const autosave = new EditorAutosave<EditorDraft, Resource>({
    source: untrack(() => target.resource),
    buildPayload: (source, detached) => {
      const next = {
        ...detached,
        source,
      } as EditorDraft;
      return editorPayload(next);
    },
    createPending: (source, payload) =>
      command(
        autosavePath(source),
        source ? "PATCH" : "POST",
        payload,
        source?.version,
      ),
    resourceFromReply: (reply) => {
      const next = reply.result.resource;
      if (!next)
        throw new Error("Autosave reply did not include the resource.");
      return next;
    },
    allowed: () =>
      !disposed &&
      !accessLost &&
      !deleteBusy &&
      !deletePending &&
      !deleteConfirmation &&
      !pending,
    oncommitted: (next, submittedSnapshot) => {
      if (disposed) return;
      const created = !currentResource;
      currentResource = next;
      // Keep the live draft object so a text caret and unfinished tag/checklist
      // entries survive the ACK. The acknowledged source/version is still the
      // base used to build the next patch.
      (draft as EditorDraft & { source: Resource | null }).source = next;
      baseline = submittedSnapshot;
      autosaveError = "";
      onautosaved?.(next);
      if (created && next.type === "card" && !autoCreate) void loadFocus();
      if (historyLoaded) void loadHistory();
      if (autoCreate && !autosaveCreated) {
        autosaveCreated = true;
        onsaved();
      }
    },
    onchange: (state) => {
      if (disposed) return;
      autosaveState = state;
      if (state.phase === "saved") autosaveError = "";
      else if (state.error) {
        autosaveError = commandErrorMessage(state.error);
        if (
          state.phase === "conflict" &&
          isRejectedConflict("rejected", state.error) &&
          !conflict
        ) {
          conflict = { current: null };
          void api<Resource>(path()).then(
            (current) => {
              if (!disposed) conflict = { current };
            },
            () => {},
          );
        }
      }
    },
  });
  const autosaveStatus = $derived(
    autosaveResource
      ? accessLost ||
        autosaveError ||
        autosaveState.phase === "conflict" ||
        autosaveState.phase === "uncertain" ||
        autosaveState.phase === "not-saved"
        ? "Not saved"
        : autosaveState.phase === "submitting" ||
            autosaveState.queued ||
            persistedDirty
          ? "Saving…"
          : autosaveState.phase === "saved" || resource
            ? "Saved"
            : ""
      : "",
  );
  function clearAutosaveTimer() {
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  }
  function validateAutosave() {
    if (!autosaveResource) return false;
    try {
      const title = draft.common.title.trim();
      const maxTitle = draft.type === "project" ? 120 : 240;
      if (!title) throw new Error("Enter a title before saving.");
      if ([...title].length > maxTitle)
        throw new Error(`Use ${maxTitle} characters or fewer for the title.`);
      if (draft.type === "card") {
        acceptanceError = acceptanceValidation(draft.fields.acceptance);
        if (acceptanceError) throw new Error(acceptanceError);
        tagError = tagValidation(draft.fields.labels);
        if (tagError) throw new Error(tagError);
      }
      const detached = detachedEditorDraft(draft);
      editorPayload({
        ...detached,
        source: resource,
      } as EditorDraft);
      autosaveError = "";
      return true;
    } catch (cause) {
      autosaveError = cause instanceof Error ? cause.message : String(cause);
      return false;
    }
  }
  function queueAutosave() {
    autosaveTimer = null;
    if (!autosaveResource || conflict || deleteBusy || deletePending) return;
    const snapshotValue = autosaveSnapshot(draft);
    if (resource && snapshotValue === baseline && !autosave.hasWork) return;
    if (!validateAutosave()) return;
    const detached = detachedEditorDraft(draft);
    void autosave.enqueue(detached, snapshotValue).catch((cause) => {
      autosaveError = cause instanceof Error ? cause.message : String(cause);
    });
  }
  function scheduleAutosave(immediate = false) {
    if (!autosaveResource || conflict) return;
    clearAutosaveTimer();
    if (immediate) queueAutosave();
    else autosaveTimer = setTimeout(queueAutosave, 400);
  }
  function autosaveRetry() {
    void autosave.retry().catch((cause) => {
      autosaveError = cause instanceof Error ? cause.message : String(cause);
    });
  }
  function autosaveCheck() {
    void autosave.check().catch((cause) => {
      autosaveError = cause instanceof Error ? cause.message : String(cause);
    });
  }
  async function flushAutosave() {
    clearAutosaveTimer();
    if (!autosaveResource) return;
    if (autosave.hasWork || persistedDirty) {
      if (!validateAutosave())
        throw new Error(autosaveError || "The draft is not valid yet.");
      await autosave.enqueue(
        detachedEditorDraft(draft),
        autosaveSnapshot(draft),
      );
    }
    await autosave.flush();
  }
  let watchedAutosaveSnapshot = $state(untrack(() => autosaveSnapshot(draft)));
  let immediateAutosave = $state(false);
  function discreteAutosaveChange(previous: string, next: string) {
    try {
      const before = JSON.parse(previous) as Record<string, unknown>;
      const after = JSON.parse(next) as Record<string, unknown>;
      for (const key of ["status", "priority", "kind", "archived", "labels"]) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
          return true;
      }
      const structure = (value: unknown) =>
        Array.isArray(value)
          ? value.map((item) => ({ id: item.id, completed: item.completed }))
          : [];
      return (
        JSON.stringify(structure(before.acceptance)) !==
        JSON.stringify(structure(after.acceptance))
      );
    } catch {
      return false;
    }
    return false;
  }
  $effect(() => {
    if (!autosaveResource) return;
    const current = autosaveSnapshot(draft);
    if (current === watchedAutosaveSnapshot) return;
    const previous = watchedAutosaveSnapshot;
    watchedAutosaveSnapshot = current;
    const immediate =
      immediateAutosave || discreteAutosaveChange(previous, current);
    immediateAutosave = false;
    untrack(() => scheduleAutosave(immediate));
  });
  function handleChange(event: Event) {
    const target = event.target;
    const immediate =
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        ["checkbox", "date", "radio"].includes(target.type));
    if (immediate) immediateAutosave = true;
  }
  async function save() {
    if (autosaveResource) {
      await flushAutosave().catch((cause) => {
        autosaveError = cause instanceof Error ? cause.message : String(cause);
      });
      return;
    }
    if (locked || readonly || conflict) return;
    error = "";
    statusMessage = "";
    try {
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

  async function requestDelete() {
    if (
      draft.type !== "card" ||
      !resource ||
      locked ||
      conflict ||
      deleteConflict ||
      deleteFlushing
    )
      return;
    if (autosaveResource && (autosave.hasWork || persistedDirty)) {
      deleteFlushing = true;
      try {
        await flushAutosave();
      } catch (cause) {
        autosaveError = cause instanceof Error ? cause.message : String(cause);
        return;
      } finally {
        deleteFlushing = false;
      }
      if (autosave.hasWork || persistedDirty) return;
    }
    deleteError = "";
    deleteConflict = false;
    deleteConfirmation = dirty ? "drafts" : "final";
  }
  function cancelDelete() {
    if (deleteBusy) return;
    deleteConfirmation = null;
    deleteError = "";
  }
  function continueDelete() {
    if (deleteBusy || !resource || draft.type !== "card") return;
    deleteConfirmation = "final";
  }
  async function deleteSavedCard() {
    if (
      deleteConfirmation !== "final" ||
      deleteBusy ||
      deletePending ||
      busy ||
      pending ||
      conflict ||
      deleteConflict ||
      draft.type !== "card" ||
      !resource ||
      accessLost
    )
      return;
    deleteConfirmation = null;
    deleteError = "";
    deleteConflict = false;
    try {
      deleteOperation.prepare(
        deleteCard(project, resource.metadata.id, resource.version),
      );
    } catch (cause) {
      deleteError = commandErrorMessage(cause);
      return;
    }
    await runDelete("submit");
  }
  async function checkDelete() {
    await runDelete("status");
  }
  async function retryDelete() {
    await runDelete("submit");
  }
  async function runDelete(action: "submit" | "status") {
    if (!deletePending || deleteBusy || accessLost) return;
    deleteError = "";
    try {
      if (action === "status") await deleteOperation.confirm();
      else await deleteOperation.commit();
      ondeleted();
    } catch (cause) {
      deleteError = commandErrorMessage(cause);
      if (isRejectedConflict(deleteOperation.phase, cause)) {
        deleteConflict = true;
        deleteError = `${deleteError} Card was not deleted. Close and reopen the card before trying again.`;
      }
    }
  }
  async function transmit() {
    await runCommand("submit");
  }
  async function resolve() {
    await runCommand("status");
  }
  async function runCommand(action: "submit" | "status") {
    if (!pending || accessLost || busy) return;
    const submitted = intent;
    error = "";
    try {
      const reply =
        action === "status"
          ? await operation.confirm()
          : await operation.commit();
      await completeCommand(submitted, reply);
    } catch (cause) {
      const reason = commandErrorMessage(cause);
      error = reason;
      if (isRejectedConflict(operation.phase, cause)) {
        if (submitted.kind === "focus") {
          focus = null;
          await loadFocus();
          error = `${reason} Focus changed elsewhere. Your draft is preserved. Review the current pin state before trying again.`;
        } else if (submitted.kind === "resource") {
          conflict = { current: null };
          try {
            conflict = { current: await api<Resource>(path()) };
          } catch {
            // A failed refresh must not allow a new write from the stale draft.
          }
        }
      }
    }
  }
  async function completeCommand(
    submitted: EditorIntent,
    reply: CommandResponse,
  ) {
    if (submitted.kind === "resource") {
      const next = reply.result.resource;
      if (autosaveResource) {
        if (!next) throw new Error("The saved resource was not returned.");
        currentResource = next;
        draft = draftForResource(next);
        baseline = autosaveSnapshot(draft);
        watchedAutosaveSnapshot = baseline;
        autosave.reset(next);
        onautosaved?.(next);
        if (historyLoaded) void loadHistory();
        statusMessage = "Saved";
        onchanged?.();
      } else {
        onsaved();
      }
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
  $effect(() => {
    if (!deleteError || !deleteNotice) return;
    queueMicrotask(() => {
      deleteNotice?.scrollIntoView({ block: "center", inline: "nearest" });
      deleteNotice?.focus({ preventScroll: true });
    });
  });
</script>

<svelte:window onbeforeunload={beforeUnload} />
<dialog
  use:modal
  class="editor"
  class:resource-editor={draft.type === "project" || draft.type === "card"}
  class:project-editor={draft.type === "project"}
  aria-label={resource ? "Edit resource" : "Create resource"}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  {#if autoCreate && !error && !autosaveError && !conflict && !discard}<p
      role="status"
    >
      Creating card…
    </p>{/if}
  <div
    class:quick-pending={autoCreate &&
      !error &&
      !autosaveError &&
      !conflict &&
      !discard}
  >
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
        {#if !readonly && !autosaveResource}<p
            class="draft-state"
            role="status"
          >
            {busy
              ? "Saving…"
              : pending
                ? "Awaiting command confirmation"
                : conflict
                  ? "Conflict · draft preserved"
                  : dirty
                    ? "Unsaved changes"
                    : resource
                      ? "Saved version"
                      : "New draft"}
          </p>{/if}
        {#if autosaveStatus}<p
            class="draft-state"
            data-testid="autosave-status"
            role="status"
          >
            {autosaveStatus}
          </p>{/if}
      </div>
      <button
        bind:this={descriptionCloseButton}
        aria-label="Close editor"
        onpointerdown={(event) => {
          // Keep the textarea focused until close() starts its flush. Moving
          // focus first can reflow the centered dialog under the pointer.
          if (event.button === 0 && descriptionEditing) event.preventDefault();
        }}
        onclick={close}
        disabled={busy || deleteBusy || closing}>✕</button
      >
    </header>
    <form
      onchange={handleChange}
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {#if discard}<div role="alert" class="notice">
          <p>
            {pending || deletePending || autosaveWork
              ? "The command result may still be unknown. Keep its request ID before closing."
              : "Discard your unsaved draft?"}
          </p>
          <button
            type="button"
            onclick={onclose}
            disabled={busy || deleteBusy || autosaveBusy}>Discard draft</button
          ><button type="button" onclick={keepEditing}>Keep editing</button>
        </div>{/if}
      {#if readonly}<button type="button" onclick={toggleRead} disabled={locked}
          >{read ? "Mark unread" : "Mark read"}</button
        >{/if}
      {#if draft.type === "card" && resource}<button
          type="button"
          onclick={toggleFocus}
          disabled={!focus || locked || persistedDirty || autosaveWork}
          >{pinned ? "Remove from focus" : "Pin to focus"}</button
        >{#if !focus && !busy}<button
            type="button"
            onclick={loadFocus}
            disabled={locked}>Refresh focus state</button
          >{/if}{/if}
      {#if draft.type === "card" && resource}<button
          type="button"
          onclick={requestDelete}
          disabled={locked || !!conflict || deleteConflict}>Delete card</button
        >{/if}
      {#if deleteConfirmation}<section
          class="notice delete-confirmation"
          role="alert"
          aria-labelledby="delete-card-heading"
          aria-describedby="delete-card-description"
        >
          <h3 id="delete-card-heading">
            {deleteConfirmation === "drafts"
              ? "Discard drafts before deleting?"
              : "Permanently delete card?"}
          </h3>
          <p id="delete-card-description">
            {#if deleteConfirmation === "drafts"}
              Your unsaved card or report drafts will be discarded before
              permanently deleting card “{draft.common.title}”.
            {:else}
              Permanently delete card “{draft.common.title}”? This removes its
              source file and cannot be undone.
            {/if}
          </p>
          <div class="row">
            {#if deleteConfirmation === "drafts"}<button
                type="button"
                class="primary"
                onclick={continueDelete}
                use:focusDeleteAction
                disabled={deleteBusy}>Discard drafts and continue</button
              >{:else}<button
                type="button"
                class="primary"
                onclick={() => void deleteSavedCard()}
                use:focusDeleteAction
                disabled={deleteBusy || accessLost}
                >Permanently delete card</button
              >{/if}
            <button type="button" onclick={cancelDelete} disabled={deleteBusy}
              >Keep editing</button
            >
          </div>
        </section>{/if}
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
      {#if draft.type === "update"}<label
          >Kind<select
            aria-label="Kind"
            bind:value={draft.fields.kind}
            disabled={readonly || locked}
            >{#each ["result", "blocker", "decision_needed", "note", "correction", "resolution"] as item}<option
                value={item}>{resourceLabel(item)}</option
              >{/each}</select
          ></label
        >{/if}
      {#if draft.type === "project" || draft.type === "card"}
        <section
          class="resource-description-field"
          aria-labelledby="resource-description-label"
        >
          <div class="field-label" id="resource-description-label">
            Description <span
              >{draft.type === "card"
                ? "Context and supporting details · Markdown"
                : "Markdown"}</span
            >
          </div>
          {#if descriptionEditing}
            <textarea
              bind:this={descriptionInput}
              bind:value={draft.common.body}
              rows="8"
              aria-label="Description"
              onblur={blurDescription}
              disabled={locked}></textarea>
          {:else}
            <div
              class="resource-description-rendered"
              role="button"
              tabindex={locked ? -1 : 0}
              aria-label={`Edit ${draft.type} description`}
              aria-disabled={locked}
              onclick={beginDescriptionEdit}
              onkeydown={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("a")
                )
                  return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  beginDescriptionEdit(event);
                }
              }}
            >
              {#if draft.common.body.trim()}<Markdown
                  source={draft.common.body}
                />{:else}<p class="empty-context">No description yet.</p>{/if}
            </div>
          {/if}
        </section>
      {:else}
        <label class="description-label"
          >Description <span>Markdown source</span><textarea
            bind:value={draft.common.body}
            rows="8"
            disabled={readonly || locked}></textarea></label
        >
        <button type="button" onclick={() => (preview = !preview)}
          >{preview ? "Hide preview" : "Preview Markdown"}</button
        >
        {#if preview}<Markdown source={draft.common.body} />{/if}
      {/if}
      {#if draft.type === "card"}<CardPlanningFields
          bind:fields={draft.fields}
          {locked}
          bind:acceptanceError
          bind:tagError
        />{/if}
      {#if draft.type === "milestone"}<div class="row">
          <label
            >Due date<input
              type="date"
              bind:value={draft.fields.due}
              disabled={locked}
            /></label
          >
        </div>{/if}
      {#if draft.type === "update" && !readonly}<label
          >Author<input
            bind:value={draft.fields.author}
            required
            maxlength="120"
            disabled={locked}
          /></label
        >{/if}
      {#if draft.type === "card"}<details>
          <summary>Card lifecycle</summary>
          <label
            ><input
              type="checkbox"
              bind:checked={draft.fields.archived}
              disabled={locked}
            /> Archived</label
          >
          <p class="empty-context">
            Archived cards remain in the project and can be restored from the
            archive filter.
          </p>
        </details>{/if}
      {#if draft.type === "update"}<ReportFields
          bind:fields={draft.fields}
          locked={readonly || locked}
        />{/if}
      {#if !readonly && (draft.type === "milestone" || draft.type === "update")}<details
        >
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
      {#if resource && !readonly && draft.type !== "project" && draft.type !== "card"}<details
        >
          <summary>Change history</summary><button
            type="button"
            onclick={() => loadHistory()}
            disabled={busy || accessLost}>First history page</button
          >{#if dirty}<p class="empty-context">
              Wait for changes to save, or resolve your draft before undoing a
              saved change.
            </p>{/if}{#each history as entry}<div class="historyentry">
              <small>{entry.recorded_at}</small>
              <p>{entry.changed_fields.join(", ")}</p>
              <button
                type="button"
                disabled={locked ||
                  autosaveWork ||
                  !entry.can_undo ||
                  !canUndoDraft(dirty, !!pending, busy) ||
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
      {#if conflict}
        {#if conflict.current}<details open>
            <summary>Current saved version · your draft stays above</summary>
            <pre>{JSON.stringify(
                conflict.current.metadata,
                null,
                2,
              )}{"\n"}{conflict.current.body}</pre>
          </details>
        {:else}<p>
            The current saved version is unavailable. Your draft is preserved
            above.
          </p>{/if}
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
      {#if dirty || pending || deletePending || autosaveState.pending}<button
          type="button"
          onclick={copyDraft}>Copy draft</button
        >{/if}
      {#if autosaveResource && autosaveError}<div class="notice" role="alert">
          {autosaveError}
        </div>{/if}
      {#if autosaveResource && autosaveState.pending && (autosaveState.phase === "uncertain" || autosaveState.phase === "conflict")}<p
        >
          Autosave request <code>{autosaveState.pending.requestId}</code>
        </p>
        {#if autosaveState.phase === "uncertain"}<div class="row">
            <button type="button" onclick={autosaveCheck} disabled={accessLost}
              >Check status</button
            ><button type="button" onclick={autosaveRetry} disabled={accessLost}
              >Retry same command</button
            >
          </div>{/if}{/if}
      {#if deleteError}<div
          bind:this={deleteNotice}
          class="notice"
          role="alert"
          tabindex="-1"
        >
          <p>{deleteError}</p>
        </div>{/if}
      {#if deletePending}<p>
          Deletion request <code>{deletePending.requestId}</code>
        </p>
        <div class="row">
          <button
            type="button"
            onclick={() => void checkDelete()}
            disabled={deleteBusy || accessLost}>Check deletion status</button
          ><button
            type="button"
            onclick={() => void retryDelete()}
            disabled={deleteBusy || accessLost}>Retry same deletion</button
          >
        </div>{/if}
      {#if !autosaveResource}<footer>
          <button type="button" onclick={close} disabled={busy || deleteBusy}
            >{readonly ? "Close" : "Cancel"}</button
          >{#if !readonly}<button
              class="primary"
              type="submit"
              disabled={locked || !!conflict}
              >{busy ? "Saving…" : resource ? "Save changes" : "Create"}</button
            >{/if}
        </footer>{/if}
    </form>
  </div>
</dialog>
