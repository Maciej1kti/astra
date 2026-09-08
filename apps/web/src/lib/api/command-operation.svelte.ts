import { CommandController, type CommandSnapshot } from "./command-controller";
import type { Pending } from "./api";

/** Reactive view of the framework-independent command controller. */
export function commandOperation(allowed: () => boolean = () => true) {
  let snapshot = $state<CommandSnapshot>({ phase: "idle", pending: null });
  const controller = new CommandController({
    allowed,
    changed: (value) => {
      snapshot = value;
    },
  });
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
    prepare: (pending: Pending) => controller.prepare(pending),
    retry: () => controller.retry(),
    check: () => controller.check(),
    commit: () => controller.commit(),
    confirm: () => controller.confirm(),
    finishJob: () => controller.finishJob(),
  };
}
