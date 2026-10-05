<script lang="ts">
  import { errorMessage } from "../../lib/api/messages.ts";
  import Icon from "../../lib/ui/Icon.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import FolderPicker from "./FolderPicker.svelte";
  import EditableTitle from "../../lib/ui/EditableTitle.svelte";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";

  import {
    getProject,
    patchCard,
    markRead,
    getHistory,
  } from "../../lib/api/resources";
  import type {
    CardPatch,
    HistoryEntry,
    CommandResponse,
  } from "../../lib/contracts/api.generated";
  import RecordForm from "./RecordForm.svelte";
  import UpdateDetails from "./UpdateDetails.svelte";
  import CardPlanningFields from "./CardPlanningFields.svelte";
  import CardLayoutMenu from "./CardLayoutMenu.svelte";
  import { readCardLayout } from "./card-layout";
  import { layoutMotion } from "../../lib/ui/layout-motion";
  import AcceptanceChecklist from "../cards/AcceptanceChecklist.svelte";
  import TagPicker from "../tags/TagPicker.svelte";
  import ResourceDescription from "./ResourceDescription.svelte";
  import CardCounters from "../cards/CardCounters.svelte";
  import { countersDirty } from "../cards/card-counters";
  import CardComments from "../cards/CardComments.svelte";
  import "../../styles/editor.css";
  import EditorMessages from "./EditorMessages.svelte";
  import {
    commandOperation,
    sessionAccess,
  } from "../../lib/api/command-operation.svelte";
  import {
    commandErrorMessage,
    isRejectedConflict,
  } from "../../lib/api/command-result";
  import { untrack, onMount } from "svelte";

  import { acceptanceValidation } from "../cards/card-work";
  import { tagValidation } from "../tags/tags";
  import { getProjectTags } from "../../lib/api/tags";
  import { canUndoDraft, type EditorIntent } from "./editor-actions";
  import {
    type EditorDraft,
    editorPayload,
    createEditorDraft,
    draftSnapshot,
    carryUnsubmittedEntries,
  } from "./editor-draft";
  import { editorAutosaveState } from "./editor-autosave-state.svelte";
  import { editTarget, type EditorTarget } from "./editor-target";

  import { resourceLabel } from "../../lib/resources/resource-presentation";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import { api, command, type Resource, type Pending } from "../../lib/api/api";
  import { cardDeletion } from "./card-deletion.svelte";

  const access = sessionAccess({
    ended: () => {
      opening?.cancel();
      // Without unsaved work nothing is retained below the pairing layer.
      if (!dirty && !pending && !deletion.pending && !autosave.hasWork) {
        onclose();
        return;
      }
      history = [];
      conflict = null;
    },
  });
  const accessLost = $derived(access.lost);
  const operation = commandOperation(() => !access.lost);
  const deletion = cardDeletion({
    accessLost: () => access.lost,
    card: () =>
      draft.type === "card" && resource
        ? { project, id: resource.metadata.id, version: resource.version }
        : null,
    locked: () => locked,
    commandActive: () => busy || !!pending,
    conflict: () => !!conflict,
    dirty: () => dirty,
    unsaved: () => autosaveResource && (autosave.hasWork || persistedDirty),
    flush: () => autosave.flush(),
    flushFailed: (cause) => {
      autosave.report(cause);
    },
    deleted: () => ondeleted(),
  });

  let {
    target,
    workspaceTimezone = "UTC",
    weekStart = "monday",
    userName = "Właściciel",
    onclose,
    onsaved,
    onautosaved,
    ondeleted,
    onchanged,
    onkeepediting,
    onresolve,
  }: {
    target: EditorTarget;
    workspaceTimezone?: string;
    weekStart?: string;
    userName?: string;
    onclose: () => void;
    onsaved: () => void;
    onautosaved?: (resource: Resource) => void;
    ondeleted: () => void;
    onchanged?: () => void;
    onkeepediting?: () => void;
    onresolve?: (decision: Extract<Resource, { type: "update" }>) => void;
  } = $props();

  const project = $derived(target.project);
  const opening = untrack(() => target.opening);
  let currentResource = $state<Resource | null>(untrack(() => target.resource));
  const resource = $derived(currentResource);
  const autoCreate = $derived(target.autoCreate ?? false);
  let draft = $state(untrack(() => createEditorDraft(target, userName)));
  let acceptanceError = $state("");
  let tagError = $state("");
  let tagCatalogError = $state("");
  let commentFlushing = $state(false);
  let cardLayout = $state(readCardLayout());
  const visibleCardSections = $derived(
    cardLayout.filter(
      (section) =>
        draft.type !== "card" || !draft.fields.hiddenSections.includes(section),
    ),
  );
  // Only the first Labels catalog read consumes this opening request.
  // Invalidation, retries and session restoration still request fresh tags.
  const takeOpeningTags = untrack(() => {
    let read =
      draft.type === "card" && !opening
        ? getProjectTags(project, { immediate: true })
        : undefined;
    void read?.catch(() => {});
    return () => {
      const initial = opening ? opening.takeTags() : read;
      read = undefined;
      return initial;
    };
  });

  let projectName = $state("");
  let statusMessage = $state("");
  let copyMessage = $state("");
  let read = $state(
    untrack(() =>
      resource?.type === "update" ? (resource.read ?? false) : false,
    ),
  );
  let error = $state("");
  let busy = $derived(operation.busy);
  let pending = $derived(operation.pending);
  let conflict = $state<{ current: Resource | null } | null>(null);
  let autosaveCreated = false;
  let disposed = false;
  const autosave = editorAutosaveState({
    draft: () => draft,
    resource: () => resource,
    path: (source) => {
      const root = `/api/v1/projects/${project}`;
      if (draft.type === "project") return root;
      return `${root}/cards${source ? `/${source.metadata.id}` : ""}`;
    },
    allowed: () =>
      !accessLost &&
      !deletion.busy &&
      !deletion.pending &&
      !deletion.confirmation &&
      !pending,
    conflicted: () => !!conflict,
    deleting: () => deletion.busy || !!deletion.pending,
    validate: (draft) => {
      if (draft.type !== "card") return;
      acceptanceError = acceptanceValidation(draft.fields.acceptance);
      if (acceptanceError) throw new Error(acceptanceError);
      tagError = tagValidation(draft.fields.labels);
      if (tagError) throw new Error(tagError);
    },
    committed: (next) => {
      currentResource = next;
      // Keep the live draft object so a text caret and unfinished picker/checklist
      // entries survive the ACK. The acknowledged source/version is still the
      // base used to build the next patch.
      (draft as EditorDraft & { source: Resource | null }).source = next;
      onautosaved?.(next);
      if (autoCreate && !autosaveCreated) {
        autosaveCreated = true;
        onsaved();
      }
    },
    failed: (state) => {
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
    },
  });
  const autosaveState = $derived(autosave.state);
  const autosaveError = $derived(autosave.error);
  const autosaveResource = $derived(autosave.enabled);
  const explicitBaseline = untrack(snapshot);
  const persistedDirty = $derived(
    autosaveResource ? autosave.dirty : snapshot() !== explicitBaseline,
  );
  const fieldMessages = $derived(
    draft.type === "card"
      ? [
          ...new Set(
            [acceptanceError, tagError, tagCatalogError].filter(
              (message) =>
                !!message &&
                message !== error &&
                message !== autosaveError &&
                message !== deletion.error,
            ),
          ),
        ]
      : [],
  );

  const autosaveWork = $derived(
    !!autosaveState.pending || autosaveState.queued,
  );

  let descriptionEditing = $state(false);
  let descriptionCloseButton = $state<HTMLButtonElement>();
  let discard = $state(false);
  let closing = $state(false);
  // A quick card is being created and nothing needs the user's attention yet.
  const creating = $derived(
    autoCreate && !error && !autosaveError && !conflict && !discard,
  );

  function snapshot() {
    return draftSnapshot(draft);
  }
  let intent: EditorIntent = { kind: "resource" };
  function prepare(next: EditorIntent, command: Pending) {
    operation.prepare(command);
    intent = Object.freeze(next);
  }
  const unfinishedEntry = $derived(
    draft.type === "project"
      ? !!draft.fields.folderDraft.trim()
      : draft.type === "card" &&
          (!!draft.fields.tagDraft.trim() ||
            !!draft.fields.commentDraft.trim() ||
            countersDirty(draft.fields.counterDrafts) ||
            !!draft.fields.acceptanceDraft.trim()),
  );
  let dirty = $derived(persistedDirty || unfinishedEntry);
  let locked = $derived(
    busy ||
      !!pending ||
      accessLost ||
      deletion.busy ||
      !!deletion.pending ||
      !!deletion.confirmation ||
      deletion.flushing ||
      commentFlushing ||
      closing,
  );

  async function copyDraft() {
    copyMessage = "";
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            fields: JSON.parse(snapshot()),
            pending,
            autosave_pending: autosave.pending,
            delete_pending: deletion.pending,
          },
          null,
          2,
        ),
      );
      copyMessage = "Skopiowano wersję roboczą.";
    } catch {
      error =
        "Schowek jest niedostępny. Zaznacz i skopiuj pola wersji roboczej.";
    }
  }
  /** The readable summary omits nothing a manual merge needs: copy the source. */
  async function copyCurrent() {
    if (!conflict?.current) return;
    copyMessage = "";
    try {
      const { metadata, body, version } = conflict.current;
      await navigator.clipboard.writeText(
        JSON.stringify({ metadata, body, version }, null, 2),
      );
      copyMessage = "Skopiowano aktualną wersję.";
    } catch {
      error =
        "Schowek jest niedostępny. Zaznacz i skopiuj pola aktualnej wersji.";
    }
  }
  onMount(() => () => {
    disposed = true;
    opening?.cancel();
  });
  function close() {
    if (closing || busy || deletion.busy || commentFlushing) return;
    if (autosaveResource && (autosave.hasWork || persistedDirty)) {
      closing = true;
      void autosave
        .flush()
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
    if (dirty || pending || deletion.pending) discard = true;
    else onclose();
  }
  export function requestClose() {
    if (busy || deletion.busy) return false;
    void close();
    return true;
  }
  function keepEditing(returnFocus: boolean) {
    discard = false;
    onkeepediting?.();
    // Focus returns to the control that asks instead of being lost to the page.
    if (returnFocus) descriptionCloseButton?.focus({ preventScroll: true });
  }
  function finishTextEdit() {
    if (autosaveResource && persistedDirty && !closing)
      void autosave.flush().catch((cause) => {
        autosave.report(cause);
      });
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || pending || deletion.pending || autosave.hasWork) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  let history = $state<HistoryEntry[]>([]);
  let historyCursor = $state<string | null>(null);
  let pinned = $derived(
    resource?.type === "card" && resource.metadata.pinned === true,
  );
  onMount(() => {
    if (
      autoCreate &&
      draft.type === "card" &&
      !resource &&
      draft.common.title.trim()
    )
      autosave.schedule(true);
  });
  $effect.pre(() => {
    if (target.type === "project") return;
    const selectedProject = project;
    let live = true;
    void (
      opening?.takeProject() ?? getProject(selectedProject, { immediate: true })
    )
      .then((value) => {
        if (live && !accessLost) projectName = value.metadata.name;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  });
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
    if (
      resource?.type !== "card" ||
      locked ||
      persistedDirty ||
      autosave.hasWork
    )
      return;
    prepare(
      { kind: "resource" },
      patchCard(
        project,
        resource.metadata.id,
        { set: { pinned: !pinned } },
        resource.version,
      ),
    );
    await transmit();
  }
  async function addComment() {
    if (draft.type !== "card" || locked || conflict || !resource) return;
    if (!draft.fields.commentDraft.trim()) return;
    commentFlushing = true;
    try {
      await autosave.flush();
      if (autosave.hasWork || persistedDirty || conflict || accessLost) return;
      prepare(
        { kind: "comment" },
        patchCard(
          project,
          resource.metadata.id,
          {
            append_comment: {
              body: draft.fields.commentDraft,
              author: {
                kind: "human",
                label: userName,
              },
            },
          },
          resource.version,
        ),
      );
      await transmit();
    } catch (cause) {
      error = commandErrorMessage(cause);
    } finally {
      commentFlushing = false;
    }
  }
  async function saveCounter(payload: CardPatch, counterId?: string) {
    if (draft.type !== "card" || locked || conflict || !resource) return;
    commentFlushing = true;
    try {
      await autosave.flush();
      if (autosave.hasWork || persistedDirty || conflict || accessLost) return;
      prepare(
        { kind: "counter", counterId },
        patchCard(project, resource.metadata.id, payload, resource.version),
      );
      await transmit();
    } catch (cause) {
      error = commandErrorMessage(cause);
    } finally {
      commentFlushing = false;
    }
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
      error = errorMessage(e);
    }
  }
  async function undo(id: string) {
    if (!resource) return;
    if (locked || autosave.hasWork || !canUndoDraft(dirty, !!pending, busy)) {
      error =
        "Poczekaj na zapis zmian lub rozstrzygnij wersję roboczą przed cofnięciem zapisanej zmiany.";
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
  let readonly = $derived(draft.type === "update" && !!resource);
  const cardStatuses = [
    "planned",
    "active",
    "review",
    "done",
    "cancelled",
  ] as const;
  const projectStatuses = ["active", "paused", "archived"];
  function path() {
    const root = `/api/v1/projects/${project}`;
    return draft.type === "project"
      ? root
      : `${root}/${draft.type === "card" ? "cards" : draft.type === "milestone" ? "milestones" : "updates"}${resource ? `/${resource.metadata.id}` : ""}`;
  }
  function draftForResource(next: Resource): EditorDraft {
    return createEditorDraft(editTarget(project, next));
  }
  const autosaveStatus = $derived(
    autosaveResource
      ? accessLost ||
        autosaveError ||
        autosaveState.phase === "conflict" ||
        autosaveState.phase === "uncertain" ||
        autosaveState.phase === "not-saved"
        ? "Niezapisane"
        : autosaveState.phase === "submitting" ||
            autosaveState.queued ||
            persistedDirty
          ? "Zapisywanie…"
          : autosaveState.phase === "saved" || resource
            ? "Zapisano"
            : ""
      : "",
  );
  function handleChange(event: Event) {
    const target = event.target;
    const immediate =
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        ["checkbox", "date", "radio"].includes(target.type));
    if (immediate) autosave.discreteChange();
  }
  async function save() {
    if (autosaveResource) {
      await autosave.flush().catch((cause) => {
        autosave.report(cause);
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
      error = errorMessage(e);
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
    copyMessage = "";
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
        if (submitted.kind !== "read") {
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
    if (submitted.kind === "comment" || submitted.kind === "counter") {
      const next = reply.result.resource;
      if (
        !next ||
        !("type" in next) ||
        next.type !== "card" ||
        draft.type !== "card"
      )
        throw new Error("Nie zwrócono zapisanej karty.");
      currentResource = next;
      draft.source = next;
      if (submitted.kind === "comment") draft.fields.commentDraft = "";
      else if (submitted.counterId) {
        delete draft.fields.counterDrafts.values[submitted.counterId];
        delete draft.fields.counterDrafts.inputs[submitted.counterId];
      } else draft.fields.counterDrafts.configuration = null;
      autosave.reset(next);
      onautosaved?.(next);
      statusMessage =
        submitted.kind === "comment"
          ? "Dodano komentarz."
          : "Zapisano licznik.";
      onchanged?.();
      return;
    }
    if (submitted.kind === "resource") {
      const next = reply.result.resource;
      if (autosaveResource) {
        if (!next || !("type" in next))
          throw new Error("Nie zwrócono zapisanego elementu.");
        currentResource = next;
        const rebuilt = draftForResource(next);
        carryUnsubmittedEntries(rebuilt, draft);
        draft = rebuilt;
        autosave.rebase(next);
        onautosaved?.(next);
        statusMessage = "Zapisano";
        onchanged?.();
      } else {
        onsaved();
      }
      return;
    }
    read = submitted.read;
    statusMessage = read
      ? "Oznaczono jako przeczytane."
      : "Oznaczono jako nieprzeczytane.";
    onchanged?.();
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />
<dialog
  use:modal={{ onclose: close }}
  out:layerExit|global
  class="app-dialog editor"
  class:dialog-large={draft.type !== "project"}
  class:resource-editor={draft.type === "project" || draft.type === "card"}
  class:project-editor={draft.type === "project"}
  class:card-editor={draft.type === "card"}
  aria-label={readonly
    ? "Szczegóły aktualizacji"
    : resource
      ? "Edytuj element"
      : "Utwórz element"}
>
  <div class="editor-layout">
    {#snippet savedIndicator()}
      {#if autosaveStatus}<span
          class="draft-state save-indicator"
          class:saved={autosaveStatus === "Zapisano" && !busy && !pending}
          class:unsaved={autosaveStatus === "Niezapisane" || !!pending}
          data-testid="autosave-status"
          role="status"
          >{busy
            ? "Zapisywanie…"
            : pending
              ? "Niezapisane"
              : autosaveStatus}</span
        >{/if}
    {/snippet}
    {#snippet cardHeaderContent()}
      {#if draft.type === "card"}
        <div class="card-heading">
          <EditableTitle
            bind:value={draft.common.title}
            label="Tytuł"
            placeholder="Tytuł karty"
            disabled={locked}
            focus={!resource && !autoCreate}
            onfinish={finishTextEdit}
          />
        </div>
        <div class="card-header-toolbar">
          <div class="card-state-actions">
            <ActionMenu
              label={`Status: ${resourceLabel(draft.fields.status)}`}
              text={resourceLabel(draft.fields.status)}
              icon={draft.fields.status}
              align="start"
              disabled={locked}
            >
              {#snippet children(closeStatus)}
                {#each cardStatuses as status}
                  <button
                    type="button"
                    class="quiet status-option"
                    aria-pressed={draft.type === "card" &&
                      draft.fields.status === status}
                    onclick={() => {
                      if (draft.type === "card") draft.fields.status = status;
                      closeStatus();
                    }}><Icon name={status} />{resourceLabel(status)}</button
                  >
                {/each}
              {/snippet}
            </ActionMenu>
            <button
              type="button"
              class="quiet icon-button priority-toggle"
              class:high={draft.fields.priority === "high"}
              aria-label="Wysoki priorytet"
              title="Wysoki priorytet"
              aria-pressed={draft.fields.priority === "high"}
              disabled={locked}
              onclick={() => {
                if (draft.type === "card")
                  draft.fields.priority =
                    draft.fields.priority === "high" ? "normal" : "high";
              }}><Icon name="flag" small /></button
            >
            {#if resource}
              <button
                type="button"
                class="quiet icon-button focus-toggle"
                class:pinned
                aria-label={pinned ? "Usuń z Focus" : "Przypnij do Focus"}
                title={pinned ? "Usuń z Focus" : "Przypnij do Focus"}
                aria-pressed={pinned}
                onclick={toggleFocus}
                disabled={locked || persistedDirty || autosaveWork}
                ><Icon name="pin" small /></button
              >
            {/if}
          </div>
          {@render savedIndicator()}
        </div>
      {/if}
    {/snippet}
    {#snippet editorMessages()}
      <EditorMessages
        {creating}
        {fieldMessages}
        {accessLost}
        {error}
        {autosaveError}
        autosaves={autosaveResource}
        {autosaveState}
        {conflict}
        {pending}
        {busy}
        {dirty}
        {discard}
        {copyMessage}
        {statusMessage}
        title={draft.common.title}
        {deletion}
        oncheck={resolve}
        onretry={transmit}
        onautosavecheck={autosave.check}
        onautosaveretry={autosave.retry}
        oncopy={copyDraft}
        oncopycurrent={copyCurrent}
        ondiscard={onclose}
        onkeepediting={keepEditing}
      />
    {/snippet}
    <DialogHeader
      content={draft.type === "card" ? cardHeaderContent : undefined}
      messages={editorMessages}
      onclose={close}
      closeLabel="Zamknij edytor"
      disabled={busy || deletion.busy || closing}
      bind:closeButton={descriptionCloseButton}
      onclosepointerdown={(event) => {
        // Preserve the clicked target while a description edit changes height.
        if (event.button === 0 && descriptionEditing) event.preventDefault();
      }}
    >
      {#snippet heading()}
        {#if draft.type === "card"}
          <div class="editor-context">
            <Icon name="projects" small />
            <span class="card-project-name" title={projectName}
              >{projectName || "Karta"}</span
            >
          </div>
        {:else}
          <div class="editor-context">
            <Icon
              name={draft.type === "project"
                ? "projects"
                : draft.type === "update"
                  ? "updates"
                  : "board"}
              small
            />
            <span
              >{projectName ||
                (draft.type === "project"
                  ? "Projekt"
                  : resourceLabel(draft.type))}</span
            >
            {#if projectName}<span class="context-separator">/</span><span
                class="context-kind">{resourceLabel(draft.type)}</span
              >{/if}
          </div>
        {/if}
      {/snippet}
      {#snippet actions()}
        {#if draft.type === "card"}
          <CardLayoutMenu
            bind:layout={cardLayout}
            bind:hidden={draft.fields.hiddenSections}
            disabled={locked}
            visibilityDisabled={!!conflict}
          />
        {/if}
        {#if draft.type === "card" && resource}
          <ActionMenu label="Działania karty" disabled={locked}>
            <label class="archive-action"
              ><input
                type="checkbox"
                bind:checked={draft.fields.archived}
                disabled={locked}
              /> Zarchiwizowane</label
            >
            <p class="menu-hint">Zarchiwizowane karty pozostają w projekcie.</p>
            <button
              type="button"
              class="quiet destructive-action"
              onclick={deletion.request}
              disabled={locked || !!conflict || deletion.conflict}
              >Usuń kartę</button
            >
          </ActionMenu>
        {:else if draft.type !== "card"}{@render savedIndicator()}{/if}
      {/snippet}
    </DialogHeader>
    <form
      class="dialog-body editor-form"
      class:quick-pending={creating}
      onchange={handleChange}
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {#if readonly}
        <h2 class="record-title">
          {draft.common.title || "Zapis aktualizacji"}
        </h2>
        <div class="record-actions">
          <Button
            type="button"
            variant="quiet"
            onclick={toggleRead}
            disabled={locked}
            >{read
              ? "Oznacz jako nieprzeczytane"
              : "Oznacz jako przeczytane"}</Button
          >
          {#if resource?.type === "update" && resource.metadata.kind === "decision_needed"}<Button
              type="button"
              variant="primary"
              onclick={() => onresolve?.(resource)}
              disabled={locked}>Rozstrzygnij decyzję</Button
            >{/if}
        </div>
      {:else if draft.type !== "card"}
        <EditableTitle
          bind:value={draft.common.title}
          label={draft.type === "project"
            ? "Nazwa"
            : draft.type === "update"
              ? "Podsumowanie"
              : "Tytuł"}
          placeholder={draft.type === "project"
            ? "Nazwa projektu"
            : draft.type === "update"
              ? "Napisz podsumowanie…"
              : draft.type === "milestone"
                ? "Tytuł kamienia milowego"
                : "Tytuł karty"}
          maxlength={draft.type === "project"
            ? 120
            : draft.type === "update"
              ? 500
              : 240}
          disabled={locked}
          focus={!resource && !autoCreate}
          onfinish={finishTextEdit}
        />
        {#if !autosaveResource}<p class="draft-state" role="status">
            {busy
              ? "Zapisywanie…"
              : pending
                ? "Oczekiwanie na potwierdzenie polecenia"
                : conflict
                  ? "Konflikt · zachowano wersję roboczą"
                  : dirty
                    ? "Niezapisane zmiany"
                    : resource
                      ? "Zapisana wersja"
                      : "Nowa wersja robocza"}
          </p>{/if}
      {/if}
      {#if resource?.type === "update"}<UpdateDetails
          {resource}
          {projectName}
          {project}
        />{:else if draft.type === "card"}
        <div class="card-body-grid">
          {#each cardLayout as section (section)}
            {@const visibleIndex = visibleCardSections.indexOf(section)}
            <div
              class="card-section"
              class:card-section-hidden={visibleIndex === -1}
              class:card-section-following={visibleIndex > 0}
              class:after-counters={visibleCardSections[visibleIndex - 1] ===
                "counters"}
              aria-hidden={visibleIndex === -1}
              inert={visibleIndex === -1}
              data-card-section={section}
              data-card-visible={visibleIndex !== -1}
              animate:layoutMotion
            >
              <div class="card-section-content">
                {#if section === "description"}
                  <ResourceDescription
                    type="card"
                    bind:body={draft.common.body}
                    bind:editing={descriptionEditing}
                    disabled={locked}
                    closeButton={descriptionCloseButton}
                    onfinish={finishTextEdit}
                  />
                {:else if section === "checklist"}
                  <AcceptanceChecklist
                    bind:items={draft.fields.acceptance}
                    bind:draft={draft.fields.acceptanceDraft}
                    bind:error={acceptanceError}
                    messagesInHeader
                    disabled={locked}
                  />
                {:else if section === "counters"}
                  <CardCounters
                    counters={resource?.type === "card"
                      ? (resource.metadata.counters ?? [])
                      : []}
                    bind:draft={draft.fields.counterDrafts}
                    timezone={workspaceTimezone}
                    disabled={locked || !!conflict}
                    saved={!!resource}
                    onsubmit={saveCounter}
                  />
                {:else if section === "comments"}
                  <CardComments
                    comments={resource?.type === "card"
                      ? (resource.metadata.comments ?? [])
                      : []}
                    bind:body={draft.fields.commentDraft}
                    disabled={locked || !!conflict}
                    saved={!!resource}
                    onadd={addComment}
                  />
                {:else if section === "schedule"}
                  <CardPlanningFields
                    {weekStart}
                    bind:fields={draft.fields}
                    {locked}
                    timezone={workspaceTimezone}
                    initiallyExpanded={!target.resource}
                  />
                {:else if section === "labels"}
                  <TagPicker
                    {project}
                    openingCatalog={takeOpeningTags}
                    bind:labels={draft.fields.labels}
                    bind:draft={draft.fields.tagDraft}
                    bind:error={tagError}
                    bind:catalogError={tagCatalogError}
                    messagesInHeader
                    disabled={locked}
                  />
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else if draft.type === "project"}
        <div class="editor-properties">
          <label
            >Status<select
              aria-label="Status"
              bind:value={draft.fields.status}
              disabled={locked}
              >{#each projectStatuses as item}<option value={item}
                  >{resourceLabel(item)}</option
                >{/each}</select
            ></label
          >
        </div>
        <FolderPicker
          bind:value={draft.fields.folder}
          bind:draft={draft.fields.folderDraft}
          disabled={locked}
        />
        <ResourceDescription
          type="project"
          bind:body={draft.common.body}
          bind:editing={descriptionEditing}
          disabled={locked}
          closeButton={descriptionCloseButton}
          onfinish={finishTextEdit}
        />
      {:else}
        <RecordForm
          bind:draft
          {locked}
          saved={!!resource}
          {busy}
          {accessLost}
          {dirty}
          {history}
          {historyCursor}
          undoBlocked={locked ||
            autosaveWork ||
            !canUndoDraft(dirty, !!pending, busy) ||
            accessLost}
          onhistory={(more) => void loadHistory(more)}
          onundo={(id) => void undo(id)}
        />
      {/if}
      {#if !autosaveResource && !readonly}<footer class="dialog-footer">
          <button type="button" onclick={close} disabled={busy || deletion.busy}
            >Anuluj</button
          >{#if !readonly}<Button
              variant="primary"
              type="submit"
              disabled={locked || !!conflict}
              >{busy
                ? "Zapisywanie…"
                : resource
                  ? "Zapisz zmiany"
                  : "Utwórz"}</Button
            >{/if}
        </footer>{/if}
    </form>
  </div>
</dialog>
