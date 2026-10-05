import { onMount } from "svelte";
import { CommandController, type CommandSnapshot } from "./command-controller";
import { subscribeSession } from "./session-events";
import type { Pending } from "./api";

/** Session access as one mounted owner sees it. Its retained work stays put. */
export function sessionAccess(
  hooks: { ended?: () => void; restored?: () => void } = {},
) {
  let lost = $state(false);
  onMount(() =>
    subscribeSession({
      ended: () => {
        lost = true;
        hooks.ended?.();
      },
      restored: () => {
        lost = false;
        hooks.restored?.();
      },
    }),
  );
  return {
    get lost() {
      return lost;
    },
  };
}

/** Ask before leaving while a reload would discard unresolved work. */
export function unloadGuard(unresolved: () => boolean) {
  onMount(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (!unresolved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  });
}

/**
 * Reactive view of the framework-independent command controller. Every owner
 * guards unload while its command is unresolved: a reload would discard the
 * only copy of the request ID.
 */
export function commandOperation(allowed: () => boolean = () => true) {
  let snapshot = $state<CommandSnapshot>({ phase: "idle", pending: null });
  const controller = new CommandController({
    allowed,
    changed: (value) => {
      snapshot = value;
    },
  });
  unloadGuard(() => !!controller.pending);
  return {
    get pending() {
      return snapshot.pending;
    },
    get busy() {
      return snapshot.phase === "submitting" || snapshot.phase === "checking";
    },
    get phase() {
      return snapshot.phase;
    },
    /** A rejected conflict; its owner must not resubmit the stale proposal. */
    get conflict() {
      return snapshot.phase === "rejected" && snapshot.conflict;
    },
    prepare: (pending: Pending) => controller.prepare(pending),
    retry: () => controller.retry(),
    check: () => controller.check(),
    commit: () => controller.commit(),
    confirm: () => controller.confirm(),
    finishJob: () => controller.finishJob(),
    acknowledge: () => controller.acknowledge(),
  };
}
