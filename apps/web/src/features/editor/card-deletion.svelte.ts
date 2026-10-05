import { commandOperation } from "../../lib/api/command-operation.svelte";
import {
  commandErrorMessage,
  isRejectedConflict,
} from "../../lib/api/command-result";
import { deleteCard } from "../../lib/api/resources";

type Editor = {
  accessLost: () => boolean;
  /** The saved card this editor shows, with the version it would delete. */
  card: () => { project: string; id: string; version: string } | null;
  /** The editor's general lock; it includes this flow's own states. */
  locked: () => boolean;
  /** Another unresolved or submitting command of the editor. */
  commandActive: () => boolean;
  conflict: () => boolean;
  /** Unfinished entries that deletion would discard. */
  dirty: () => boolean;
  /** Persisted edits not yet acknowledged; deletion waits for them. */
  unsaved: () => boolean;
  flush: () => Promise<void>;
  flushFailed: (cause: unknown) => void;
  deleted: () => void;
};

/**
 * Permanent deletion of the open card: saved edits first, then at most two
 * confirmations, then one conditional command with its own recovery.
 */
export function cardDeletion(editor: Editor) {
  const operation = commandOperation(() => !editor.accessLost());
  let error = $state("");
  let conflict = $state(false);
  let flushing = $state(false);
  let confirmation = $state<"drafts" | "final" | null>(null);

  async function run(action: "submit" | "status") {
    if (!operation.pending || operation.busy || editor.accessLost()) return;
    error = "";
    try {
      if (action === "status") await operation.confirm();
      else await operation.commit();
      editor.deleted();
    } catch (cause) {
      error = commandErrorMessage(cause);
      if (isRejectedConflict(operation.phase, cause)) {
        conflict = true;
        error = `${error} Karta nie została usunięta. Zamknij i otwórz ją ponownie przed kolejną próbą.`;
      }
    }
  }

  return {
    get pending() {
      return operation.pending;
    },
    get busy() {
      return operation.busy;
    },
    get error() {
      return error;
    },
    /** A rejected deletion; the card must be reopened before another try. */
    get conflict() {
      return conflict;
    },
    get flushing() {
      return flushing;
    },
    get confirmation() {
      return confirmation;
    },
    async request() {
      if (
        !editor.card() ||
        editor.locked() ||
        editor.conflict() ||
        conflict ||
        flushing
      )
        return;
      if (editor.unsaved()) {
        flushing = true;
        try {
          await editor.flush();
        } catch (cause) {
          editor.flushFailed(cause);
          return;
        } finally {
          flushing = false;
        }
        if (editor.unsaved()) return;
      }
      error = "";
      conflict = false;
      confirmation = editor.dirty() ? "drafts" : "final";
    },
    cancel() {
      if (operation.busy) return;
      confirmation = null;
      error = "";
    },
    /** Past the unfinished-entries warning, on to the final confirmation. */
    proceed() {
      if (operation.busy || !editor.card()) return;
      confirmation = "final";
    },
    async confirm() {
      const card = editor.card();
      if (
        confirmation !== "final" ||
        operation.busy ||
        operation.pending ||
        editor.commandActive() ||
        editor.conflict() ||
        conflict ||
        !card ||
        editor.accessLost()
      )
        return;
      confirmation = null;
      error = "";
      conflict = false;
      try {
        operation.prepare(deleteCard(card.project, card.id, card.version));
      } catch (cause) {
        error = commandErrorMessage(cause);
        return;
      }
      await run("submit");
    },
    check: () => run("status"),
    retry: () => run("submit"),
  };
}
export type CardDeletion = ReturnType<typeof cardDeletion>;
