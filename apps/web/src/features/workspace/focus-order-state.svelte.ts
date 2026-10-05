import { errorMessage } from "../../lib/api/messages.ts";
import { apiCode, type Summary } from "../../lib/api/api";
import { replaceFocus } from "../../lib/api/resources";
import {
  commandOperation,
  unloadGuard,
} from "../../lib/api/command-operation.svelte";
import type {
  FocusRef,
  FocusResource,
} from "../../lib/contracts/api.generated";

type Source = {
  allowed: () => boolean;
  /** The loaded membership with its version and the revision of that read. */
  items: () => FocusRef[];
  version: () => string;
  revision: () => number;
  invalidate: () => void;
  refresh: (sections?: ["focus"]) => Promise<void>;
  failed: (cause: unknown) => void;
};

export function focusReferenceKey(
  item: Pick<FocusRef, "project_id" | "card_id">,
) {
  return `${item.project_id}:${item.card_id}`;
}

/**
 * Lives above the route like the counter controller: a proposed Focus order,
 * its command and its recovery survive navigation, refresh and session loss.
 */
export function focusOrderState(source: Source) {
  const command = commandOperation(source.allowed);
  let proposal = $state<FocusRef[] | null>(null);
  let proposalVersion = $state("");
  let acknowledged = $state<Pick<FocusResource, "items" | "version"> | null>(
    null,
  );
  let acknowledgedRevision = 0;
  let error = $state("");
  let copyMessage = $state("");
  let conflict = $state(false);
  let reloading = $state(false);
  const items = $derived(proposal ?? acknowledged?.items ?? source.items());
  const version = $derived(
    proposal ? proposalVersion : (acknowledged?.version ?? source.version()),
  );
  const canRetry = $derived(
    !!proposal && command.phase === "rejected" && !conflict && !reloading,
  );
  const canReload = $derived(
    conflict ||
      (!!acknowledged && !acknowledged.version) ||
      (!!proposal && command.phase === "rejected"),
  );
  // A rejected proposal has no command left to guard it.
  unloadGuard(() => !!proposal);

  $effect(() => {
    if (acknowledged && source.revision() > acknowledgedRevision)
      acknowledged = null;
  });

  async function transmit() {
    if (!proposal || command.busy || !command.pending) return;
    error = "";
    try {
      const reply = await command.commit();
      const committed: Pick<FocusResource, "items" | "version"> = {
        items: proposal.map((item) => ({ ...item })),
        version: reply.result.version ?? "",
      };
      source.invalidate();
      acknowledged = committed;
      acknowledgedRevision = source.revision();
      proposal = null;
      proposalVersion = "";
      conflict = false;
      void source.refresh().catch(source.failed);
    } catch (cause) {
      error = errorMessage(cause);
      conflict =
        command.phase === "rejected" && apiCode(cause) === "VERSION_CONFLICT";
    }
  }

  return {
    get items() {
      return items;
    },
    get version() {
      return version;
    },
    get pending() {
      return !!command.pending;
    },
    get requestId() {
      return command.pending?.requestId ?? "";
    },
    get busy() {
      return command.busy;
    },
    get conflict() {
      return conflict;
    },
    get reloading() {
      return reloading;
    },
    get error() {
      return error;
    },
    get copyMessage() {
      return copyMessage;
    },
    get canRetry() {
      return canRetry;
    },
    get canReload() {
      return canReload;
    },
    /** A proposal or command that a user switch or reload would discard. */
    get unresolved() {
      return !!proposal || !!command.pending;
    },
    reorder: (
      visible: Summary[],
      fullOrder: FocusRef[],
      expectedVersion: string,
    ) => {
      if (
        !expectedVersion ||
        proposal ||
        command.pending ||
        command.busy ||
        conflict ||
        reloading
      )
        return;
      const reorderedVisible = visible.map(({ project_id, id }) => ({
        project_id,
        card_id: id,
      }));
      const slots = new Set(reorderedVisible.map(focusReferenceKey));
      let next = 0;
      const proposed: FocusRef[] = [];
      for (const item of fullOrder) {
        const placed = slots.has(focusReferenceKey(item))
          ? reorderedVisible[next++]
          : item;
        // More slots than reordered cards: the visible set is not this order's.
        if (!placed) return;
        proposed.push(placed);
      }
      if (
        JSON.stringify(proposed) === JSON.stringify(fullOrder) ||
        next !== reorderedVisible.length
      )
        return;

      error = "";
      conflict = false;
      copyMessage = "";
      proposal = proposed;
      proposalVersion = expectedVersion;
      source.invalidate();
      command.prepare(replaceFocus({ items: proposed }, expectedVersion));
      void transmit();
    },
    retry: () => {
      void transmit();
    },
    retryRejected: () => {
      if (!proposal || !canRetry) return;
      error = "";
      command.prepare(replaceFocus({ items: proposal }, proposalVersion));
      void transmit();
    },
    reload: async () => {
      if (!canReload || command.pending || reloading) return;
      reloading = true;
      error = "";
      source.invalidate();
      try {
        await source.refresh(["focus"]);
        proposal = null;
        proposalVersion = "";
        acknowledged = null;
        conflict = false;
      } catch (cause) {
        error = `Nie udało się ponownie wczytać kolejności Focus: ${errorMessage(cause)}`;
      } finally {
        reloading = false;
      }
    },
    copyCommand: async () => {
      const pending = command.pending;
      if (!pending || !proposal) return;
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(
            {
              items: proposal,
              expected_version: proposalVersion,
              request_id: pending.requestId,
              user_id: pending.userId,
              epoch: pending.epoch,
            },
            null,
            2,
          ),
        );
        copyMessage = "Skopiowano oczekujące polecenie Focus.";
      } catch {
        copyMessage =
          "Schowek jest niedostępny. Identyfikator żądania i kolejność są widoczne poniżej.";
      }
    },
  };
}
export type FocusOrderState = ReturnType<typeof focusOrderState>;
