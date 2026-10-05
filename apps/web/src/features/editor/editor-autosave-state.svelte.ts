import { onMount, untrack } from "svelte";
import { command, type Resource } from "../../lib/api/api";
import { commandErrorMessage } from "../../lib/api/command-result";
import { errorMessage } from "../../lib/api/messages.ts";
import { EditorAutosave, type AutosaveState } from "./editor-autosave.ts";
import {
  autosaveSnapshot,
  detachedEditorDraft,
  discreteAutosaveChange,
  editorPayload,
  type EditorDraft,
} from "./editor-draft";

type Editor = {
  draft: () => EditorDraft;
  /** The acknowledged source; null until a new card has been created. */
  resource: () => Resource | null;
  path: (source: Resource | null) => string;
  /** Session access and the editor's other commands hold writes back. */
  allowed: () => boolean;
  /** A conflict keeps the draft; nothing more is scheduled from it. */
  conflicted: () => boolean;
  /** An unresolved deletion: edits stay local until it is settled. */
  deleting: () => boolean;
  /** Field checks beyond the payload itself; throws its message. */
  validate: (draft: EditorDraft) => void;
  committed: (next: Resource) => void;
  /** A failed write, for the editor to classify as a conflict. */
  failed: (state: AutosaveState) => void;
};

/**
 * Reactive view of the framework-independent autosave queue, as
 * `commandOperation` is for a single command. It owns the baseline, the
 * typing debounce and validation; the editor owns the draft and the outcome.
 */
export function editorAutosaveState(editor: Editor) {
  let state = $state<AutosaveState>({
    phase: "idle",
    pending: null,
    queued: false,
    error: null,
  });
  let error = $state("");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const enabled = $derived(
    editor.draft().type === "card" || editor.draft().type === "project",
  );
  // One serialization per draft change serves dirty checks, scheduling and
  // queueing; reading it outside an effect still yields the current draft.
  const snapshot = $derived(autosaveSnapshot(editor.draft()));
  let baseline = $state(untrack(() => snapshot));

  const queue = new EditorAutosave<EditorDraft, Resource>({
    source: untrack(editor.resource),
    buildPayload: (source, detached) => {
      const next = {
        ...detached,
        source,
      } as EditorDraft;
      return editorPayload(next);
    },
    createPending: (source, payload) =>
      command(
        editor.path(source),
        source ? "PATCH" : "POST",
        payload,
        source?.version,
      ),
    resourceFromReply: (reply) => {
      const next = reply.result.resource;
      if (!next || !("type" in next))
        throw new Error(
          "Odpowiedź automatycznego zapisu nie zawierała elementu.",
        );
      return next;
    },
    allowed: () => !disposed && editor.allowed(),
    oncommitted: (next, submittedSnapshot) => {
      if (disposed) return;
      baseline = submittedSnapshot;
      error = "";
      editor.committed(next);
    },
    onchange: (next) => {
      if (disposed) return;
      state = next;
      if (next.phase === "saved") error = "";
      else if (next.error) {
        error = commandErrorMessage(next.error);
        editor.failed(next);
      }
    },
  });

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function validate() {
    if (!enabled) return false;
    try {
      const draft = editor.draft();
      const title = draft.common.title.trim();
      const maxTitle = draft.type === "project" ? 120 : 240;
      if (!title) throw new Error("Wpisz tytuł przed zapisaniem.");
      if ([...title].length > maxTitle)
        throw new Error(`Użyj ${maxTitle} znaków lub mniej w tytule.`);
      editor.validate(draft);
      const detached = detachedEditorDraft(draft);
      editorPayload({
        ...detached,
        source: editor.resource(),
      } as EditorDraft);
      error = "";
      return true;
    } catch (cause) {
      error = errorMessage(cause);
      return false;
    }
  }
  function enqueue() {
    timer = null;
    if (!enabled || editor.conflicted() || editor.deleting()) return;
    const snapshotValue = snapshot;
    if (editor.resource() && snapshotValue === baseline && !queue.hasWork) {
      // Reverting a local validation error requires no write or command reset.
      if (state.phase === "idle" || state.phase === "saved") validate();
      return;
    }
    if (!validate()) return;
    const detached = detachedEditorDraft(editor.draft());
    void queue.enqueue(detached, snapshotValue).catch(report);
  }
  function schedule(immediate = false) {
    if (!enabled || editor.conflicted()) return;
    clearTimer();
    if (immediate) enqueue();
    else timer = setTimeout(enqueue, 400);
  }
  function report(cause: unknown) {
    error = errorMessage(cause);
  }

  // Plain bookkeeping: the effect below must depend on the draft alone, so it
  // runs once per change instead of again for its own writes.
  let watched = untrack(() => snapshot);
  let discrete = false;
  $effect(() => {
    if (!enabled) return;
    const current = snapshot;
    if (current === watched) return;
    const previous = watched;
    watched = current;
    const immediate = discrete || discreteAutosaveChange(previous, current);
    discrete = false;
    untrack(() => schedule(immediate));
  });
  onMount(() => () => {
    disposed = true;
    clearTimer();
  });

  return {
    /** Cards and projects save by themselves; records submit explicitly. */
    get enabled() {
      return enabled;
    },
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    /** Persisted fields differ from the last acknowledged source. */
    get dirty() {
      return snapshot !== baseline;
    },
    /** A write in flight, queued or awaiting recovery. */
    get hasWork() {
      return queue.hasWork;
    },
    get pending() {
      return queue.pending;
    },
    schedule,
    report,
    /** The next change came from a picker or checkbox: skip the debounce. */
    discreteChange() {
      discrete = true;
    },
    retry() {
      void queue.retry().catch(report);
    },
    check() {
      void queue.check().catch(report);
    },
    async flush() {
      clearTimer();
      if (!enabled) return;
      if (queue.hasWork || snapshot !== baseline) {
        if (!validate())
          throw new Error(
            error || "Wersja robocza nie jest jeszcze prawidłowa.",
          );
        await queue.enqueue(detachedEditorDraft(editor.draft()), snapshot);
      }
      await queue.flush();
    },
    /** Another command of this editor moved the source; the draft is unchanged. */
    reset(next: Resource) {
      queue.reset(next);
    },
    /** The draft was rebuilt from an acknowledged source: it is the baseline. */
    rebase(next: Resource) {
      baseline = snapshot;
      watched = baseline;
      queue.reset(next);
    },
  };
}
