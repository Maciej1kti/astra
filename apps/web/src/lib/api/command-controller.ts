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
  | { phase: "idle" | "committed" | "rejected"; pending: null }
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
  private update(state: CommandSnapshot) {
    this.snapshot = state;
    this.dependencies.changed?.(state);
  }
  prepare(pending: Pending) {
    if (this.pending)
      throw new Error(
        "Resolve the unresolved command before starting another.",
      );
    this.update({ phase: "ready", pending });
  }
  finishJob() {
    if (this.snapshot.phase !== "accepted")
      throw new Error("No accepted job to finish.");
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
        `Command accepted as job ${reply.jobId}. Check the job before continuing.`,
      );
    return reply.reply;
  }

  private async run(
    phase: "submitting" | "checking",
  ): Promise<Exclude<CommandReply, { kind: "unresolved" }>> {
    if (this.busy)
      throw new Error("This command is already being checked or submitted.");
    const pending = this.pending;
    if (!pending) throw new Error("No pending command.");
    if (this.dependencies.allowed?.() === false)
      throw new Error("Reconnect before continuing this command.");
    this.update({ phase, pending });
    let rejected = false;
    try {
      let reply: CommandReply;
      if (phase === "checking") {
        const result = await (this.dependencies.status ?? commandStatus)(
          pending,
        );
        if (result.state === "rejected") {
          rejected = true;
          const code = result.error?.error.code;
          throw new ApiError(code === "VERSION_CONFLICT" ? 412 : 422, {
            ...(result.error ?? { error: { code: "COMMAND_REJECTED" } }),
          });
        }
        reply = normalizeCommandReply(
          result.state === "committed" ? result.result : result,
        );
      } else reply = await (this.dependencies.send ?? send)(pending);
      if (reply.kind === "unresolved")
        throw new Error(
          `Command is ${reply.state}. Check its status or retry the same command.`,
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
          ? { phase: "rejected", pending: null }
          : { phase: "uncertain", pending },
      );
      throw error;
    }
  }
}
