import { resourceLabel } from "../resources/resource-presentation.ts";
import { validateCommandStatus } from "./confirmation.ts";
import { isRejectedConflict } from "./command-result.ts";
import {
  ApiError,
  commandStatus,
  isDefinitiveRejection,
  normalizeCommandReply,
  send,
  type CommandReply,
  type CommandStatus,
  type Pending,
} from "./api.ts";

export type CommandSnapshot =
  | { phase: "idle" | "committed"; pending: null }
  // A rejected conflict stays recorded until a new proposal or acknowledgement.
  | { phase: "rejected"; pending: null; conflict: boolean }
  | {
      phase: "ready" | "submitting" | "checking" | "uncertain" | "accepted";
      pending: Pending;
    };
type Dependencies = {
  send?: (pending: Pending) => Promise<CommandReply>;
  status?: (pending: Pending) => Promise<CommandStatus>;
  allowed?: () => boolean;
  changed?: (state: CommandSnapshot) => void;
};

/** One owner for one command. Drafts, job polling and UI outcomes remain feature-owned. */
export class CommandController {
  private snapshot: CommandSnapshot = { phase: "idle", pending: null };
  private dependencies: Dependencies;

  constructor(dependencies: Dependencies = {}) {
    this.dependencies = dependencies;
  }
  get state() {
    return this.snapshot;
  }
  get pending() {
    return this.snapshot.pending;
  }
  get busy() {
    return (
      this.snapshot.phase === "submitting" || this.snapshot.phase === "checking"
    );
  }
  get conflict() {
    return this.snapshot.phase === "rejected" && this.snapshot.conflict;
  }
  private update(state: CommandSnapshot) {
    this.snapshot = state;
    this.dependencies.changed?.(state);
  }
  prepare(pending: Pending) {
    if (this.pending)
      throw new Error(
        "Rozstrzygnij oczekujące polecenie przed rozpoczęciem kolejnego.",
      );
    this.update({ phase: "ready", pending });
  }
  /** The owner has reviewed a finished outcome; nothing is refetched here. */
  acknowledge() {
    if (this.pending)
      throw new Error(
        "Rozstrzygnij oczekujące polecenie przed jego zamknięciem.",
      );
    this.update({ phase: "idle", pending: null });
  }
  finishJob() {
    if (this.snapshot.phase !== "accepted")
      throw new Error("Brak przyjętego zadania do zakończenia.");
    this.update({ phase: "committed", pending: null });
  }
  retry() {
    return this.run("submitting");
  }
  check() {
    return this.run("checking");
  }
  async commit() {
    return this.requireCommitted(await this.retry());
  }
  async confirm() {
    return this.requireCommitted(await this.check());
  }
  private requireCommitted(
    reply: Exclude<CommandReply, { kind: "unresolved" }>,
  ) {
    if (reply.kind !== "committed")
      throw new Error(
        `Polecenie przyjęto jako zadanie ${reply.jobId}. Sprawdź zadanie przed kontynuowaniem.`,
      );
    return reply.reply;
  }

  private async run(
    phase: "submitting" | "checking",
  ): Promise<Exclude<CommandReply, { kind: "unresolved" }>> {
    if (this.busy)
      throw new Error("To polecenie jest już sprawdzane lub przesyłane.");
    const pending = this.pending;
    if (!pending) throw new Error("Brak oczekującego polecenia.");
    if (this.dependencies.allowed?.() === false)
      throw new Error(
        "Połącz się ponownie przed kontynuowaniem tego polecenia.",
      );
    this.update({ phase, pending });
    let rejected = false;
    try {
      let reply: CommandReply;
      if (phase === "checking") {
        const result = await (this.dependencies.status ?? commandStatus)(
          pending,
        );
        validateCommandStatus(result, pending);
        if (result.state === "rejected") {
          rejected = true;
          const code = result.error?.error.code;
          throw new ApiError(code === "VERSION_CONFLICT" ? 412 : 422, {
            ...(result.error ?? { error: { code: "COMMAND_REJECTED" } }),
          });
        }
        reply = normalizeCommandReply(
          result.state === "committed" ? result.result : result,
          pending,
        );
      } else reply = await (this.dependencies.send ?? send)(pending);
      if (reply.kind === "unresolved")
        throw new Error(
          `Stan polecenia: ${resourceLabel(reply.state)}. Sprawdź stan lub ponów to samo polecenie.`,
        );
      this.update(
        reply.kind === "accepted"
          ? { phase: "accepted", pending }
          : { phase: "committed", pending: null },
      );
      return reply;
    } catch (error) {
      // A failed status lookup is not evidence that the original write was rejected.
      const definitive =
        rejected || (phase === "submitting" && isDefinitiveRejection(error));
      this.update(
        definitive
          ? {
              phase: "rejected",
              pending: null,
              conflict: isRejectedConflict("rejected", error),
            }
          : { phase: "uncertain", pending },
      );
      throw error;
    }
  }
}
