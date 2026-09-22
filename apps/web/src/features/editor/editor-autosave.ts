import { CommandController } from "../../lib/api/command-controller.ts";
import { isRejectedConflict } from "../../lib/api/command-result.ts";
import type { CommandReply, Pending, Resource } from "../../lib/api/api.ts";
import type {
  CommandResponse,
  CommandStatus,
} from "../../lib/contracts/api.generated.ts";

export type AutosavePhase =
  | "idle"
  | "submitting"
  | "checking"
  | "saved"
  | "not-saved"
  | "rejected"
  | "uncertain"
  | "conflict";

export type AutosaveState = {
  phase: AutosavePhase;
  pending: Pending | null;
  queued: boolean;
  error: unknown;
};

type Draft<D> = { draft: D; snapshot: string };

type AutosaveOptions<D, R extends Resource> = {
  source: R | null;
  buildPayload: (source: R | null, draft: D) => unknown;
  createPending: (source: R | null, payload: unknown) => Pending;
  resourceFromReply: (reply: CommandResponse) => R;
  oncommitted?: (resource: R, snapshot: string) => void;
  onchange?: (state: AutosaveState) => void;
  allowed?: () => boolean;
  send?: (pending: Pending) => Promise<CommandReply>;
  status?: (pending: Pending) => Promise<CommandStatus>;
};

type Failure<D> = {
  pending: Pending;
  draft: Draft<D>;
  phase: "uncertain" | "conflict" | "rejected";
  error: unknown;
};

function immutable<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Serializes one editor's source writes. Draft input can continue changing
 * while a command is in flight, but only the latest immutable draft waits
 * behind that command. A rejection leaves recovery explicit and never starts
 * a replacement request automatically.
 */
export class EditorAutosave<D, R extends Resource> {
  private readonly options: AutosaveOptions<D, R>;
  private readonly operation: CommandController;
  private sourceValue: R | null;
  private latest: Draft<D> | null = null;
  private active: Draft<D> | null = null;
  private inFlight: Promise<void> | null = null;
  private failure: Failure<D> | null = null;
  private current: AutosaveState = {
    phase: "idle",
    pending: null,
    queued: false,
    error: null,
  };

  constructor(options: AutosaveOptions<D, R>) {
    this.options = options;
    this.sourceValue = options.source;
    this.operation = new CommandController({
      send: options.send,
      status: options.status,
      allowed: options.allowed,
    });
  }

  get source() {
    return this.sourceValue;
  }
  get state() {
    return this.current;
  }
  get pending() {
    return this.failure?.pending ?? this.operation.pending;
  }
  get hasWork() {
    return this.latest !== null || this.pending !== null;
  }

  /** Replace the acknowledged source after deliberate recovery/reopen. */
  reset(source: R | null) {
    if (this.inFlight) throw new Error("Cannot reset an active autosave.");
    this.sourceValue = source;
    this.latest = null;
    this.active = null;
    this.failure = null;
    this.publish("idle", null);
  }

  /** Queue a detached draft. A blocked controller stores it for recovery. */
  enqueue(draft: D, snapshot: string) {
    if (this.failure?.draft.snapshot === snapshot) {
      this.latest = null;
      this.publish(this.failure.phase, this.failure.error);
      return Promise.resolve();
    }
    // A corrected, definitively rejected validation proposal is a new edit.
    // Conflicts and uncertain commands still require explicit recovery.
    if (this.failure?.phase === "rejected") this.failure = null;
    if (this.inFlight && this.active?.snapshot === snapshot) {
      // The user may edit A -> B -> A while A is in flight. Drop B rather
      // than sending a redundant second command after the first ACK.
      this.latest = null;
      this.publish(this.current.phase, this.current.error);
      return this.inFlight;
    }
    this.latest = { draft: immutable(draft), snapshot };
    if (this.failure) {
      this.publish(this.failure.phase, this.failure.error);
      return Promise.resolve();
    }
    return this.flush();
  }

  /** Flush the latest queued draft, waiting for any in-flight chain. */
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.failure) return Promise.reject(this.failure.error);
    if (!this.latest) return Promise.resolve();
    if (this.options.allowed && !this.options.allowed()) {
      const error = new Error("Reconnect before continuing this autosave.");
      this.publish("not-saved", error);
      return Promise.reject(error);
    }
    const draft = this.latest;
    this.latest = null;
    let pending: Pending;
    try {
      const payload = this.options.buildPayload(
        this.sourceValue,
        immutable(draft.draft),
      );
      pending = this.options.createPending(this.sourceValue, payload);
    } catch (error) {
      this.latest = draft;
      this.publish("not-saved", error);
      return Promise.reject(error);
    }
    this.operation.prepare(pending);
    return this.start(draft, pending, "submit");
  }

  /** Explicitly retry the original uncertain or rejected command. */
  retry() {
    return this.recover("submit");
  }

  /** Explicitly check the original uncertain or rejected command. */
  check() {
    return this.recover("status");
  }

  private recover(action: "submit" | "status") {
    const failure = this.failure;
    if (!failure) return this.flush();
    if (this.inFlight) return this.inFlight;
    this.failure = null;
    if (!this.operation.pending) this.operation.prepare(failure.pending);
    return this.start(failure.draft, failure.pending, action);
  }

  private start(
    draft: Draft<D>,
    pending: Pending,
    action: "submit" | "status",
  ) {
    this.active = draft;
    this.publish(action === "submit" ? "submitting" : "checking", null);
    const operation =
      action === "submit" ? this.operation.commit() : this.operation.confirm();
    const request = operation.then(
      (reply) => this.finish(draft, pending, reply),
      (error) => {
        this.active = null;
        const phase: Failure<D>["phase"] =
          this.operation.state.phase !== "rejected"
            ? "uncertain"
            : isRejectedConflict("rejected", error)
              ? "conflict"
              : "rejected";
        this.failure = { pending, draft, phase, error };
        this.inFlight = null;
        this.publish(phase, error);
        throw error;
      },
    );
    this.inFlight = request;
    return request;
  }

  private async finish(
    draft: Draft<D>,
    pending: Pending,
    reply: CommandResponse,
  ) {
    try {
      const resource = this.options.resourceFromReply(reply);
      this.sourceValue = resource;
      this.options.oncommitted?.(resource, draft.snapshot);
    } catch (error) {
      this.failure = {
        pending,
        draft,
        phase: "uncertain",
        error,
      };
      this.active = null;
      this.inFlight = null;
      this.publish("uncertain", error);
      throw error;
    }
    this.active = null;
    this.inFlight = null;
    this.publish("saved", null);
    // This call is outside the current command's rejection handler. If the
    // queued write fails, its own Pending/draft must be retained.
    return this.flush();
  }

  private publish(phase: AutosavePhase, error: unknown) {
    this.current = {
      phase,
      pending: this.pending,
      queued: this.latest !== null,
      error,
    };
    this.options.onchange?.(this.current);
  }
}
