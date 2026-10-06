import type {
  AgentConversation,
  AgentProvider,
  AgentRun,
  AgentRunContext,
  AgentRunError,
  AgentRunInput,
} from "../../lib/contracts/api.generated";
import { agentMessageLimit, type StoredAgent } from "./agent-storage.ts";

/**
 * The conversation's rules as a pure function: no timers, no DOM, no network.
 * A shell feeds events in and carries out the effects that come back, so every
 * transition can be tested under Node.
 */

/** How one message ended up on the host, or failed to. */
export type TurnState =
  /** The POST is in flight for the first time. */
  | "sending"
  /** Accepted by the host; polled until it finishes. */
  | "running"
  /** The POST got no usable answer, so the host may or may not have it. */
  | "uncertain"
  /** The host no longer knows this turn; whether the agent acted is unknown. */
  | "lost"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type Turn = {
  /** Client-generated and never replaced: it makes every retry harmless. */
  runId: string;
  /** The boot ID the POST carries; later status reads must not change it. */
  bootId: string;
  message: string;
  context: AgentRunContext | undefined;
  state: TurnState;
  /** Milliseconds since the epoch; the clock of elapsed time and poll cadence. */
  startedAt: number;
  /** Failed POST attempts since the owner last asked, or since the first send. */
  attempts: number;
  /** An earlier page life may already have delivered this turn. */
  resumed: boolean;
  /** Automatic retries are used up; only the owner can try again. */
  exhausted: boolean;
  cancel: "none" | "requested" | "acknowledged";
  pollFailures: number;
  reply: string | null;
  replyTruncated: boolean;
  error: AgentRunError | null;
};

export type Chat = {
  conversationId: string;
  /** Fixed by the host once a run exists; until then the preference decides. */
  provider: AgentProvider | null;
  /** The host has accepted at least one run of this conversation. */
  acknowledged: boolean;
  bootId: string | null;
  turns: Turn[];
  /** The session ended: nothing is sent or polled until it returns. */
  paused: boolean;
  notice: "" | "gone";
  /** Error code of a send the host refused, shown above the composer. */
  sendError: string;
};

/** What a POST that started nothing, or an unknown outcome, looked like. */
export type StartFailure =
  | { kind: "unknown" }
  | { kind: "restarted" }
  | { kind: "rejected"; code: string }
  | { kind: "session" };
export type ReadFailure =
  { kind: "unreachable" } | { kind: "not-found" } | { kind: "session" };

export type ChatEvent =
  | { type: "status"; bootId: string }
  | {
      type: "send";
      runId: string;
      message: string;
      context?: AgentRunContext;
      now: number;
    }
  | { type: "posted"; runId: string; run: AgentRun; now: number }
  | { type: "post-failed"; runId: string; failure: StartFailure; now: number }
  | { type: "polled"; runId: string; run: AgentRun; now: number }
  | { type: "poll-failed"; runId: string; failure: ReadFailure; now: number }
  | { type: "cancel"; runId: string }
  | { type: "cancel-answered"; runId: string; run: AgentRun; now: number }
  | { type: "cancel-failed"; runId: string; failure: ReadFailure }
  | { type: "retry"; runId: string; now: number }
  | {
      type: "send-again";
      runId: string;
      newRunId: string;
      conversationId: string;
      bootId: string;
      now: number;
    }
  | { type: "discard"; conversationId: string }
  | { type: "new-conversation"; conversationId: string }
  | {
      type: "restore";
      stored: StoredAgent | null;
      remote: AgentConversation | "not-found";
      bootId: string;
      /** Used when the stored conversation cannot be continued. */
      conversationId: string;
      now: number;
    }
  | { type: "session-ended" }
  | { type: "session-restored"; now: number }
  | { type: "wake"; now: number }
  | { type: "dismiss-notice" }
  | { type: "dismiss-error" };

/** What the shell must do; `delay` is milliseconds from now. */
export type Effect =
  | { kind: "post"; runId: string; delay: number }
  | { kind: "poll"; runId: string; delay: number }
  | { kind: "cancel"; runId: string; delay: number }
  /** Read the host's boot ID and provider availability again. */
  | { kind: "status" }
  /** Put this text back into the composer. */
  | { kind: "composer"; text: string }
  /** Drop every pending timer of one turn, or of all turns. */
  | { kind: "stop"; runId?: string };

export type Step = { chat: Chat; effects: Effect[] };

/** What the floating button reports while the dialog is closed. */
export type AgentActivity = "" | "working" | "answered";

/** Automatic retries of an identical POST that got no usable answer. */
export const retryDelays = [1000, 2000, 4000, 8000] as const;
const fastPolling = 15_000;
const slowestPoll = 5000;
const cancelRetry = 2000;

export function newChat(conversationId: string): Chat {
  return {
    conversationId,
    provider: null,
    acknowledged: false,
    bootId: null,
    turns: [],
    paused: false,
    notice: "",
    sendError: "",
  };
}

const isActive = (turn: Turn) =>
  turn.state === "sending" ||
  turn.state === "running" ||
  turn.state === "uncertain";

/** The turn that blocks the composer: sending, running or uncertain. */
export function activeTurn(chat: Chat): Turn | undefined {
  return chat.turns.find(isActive);
}

/** Whether the owner may send now. Provider availability is the shell's. */
export function canSend(chat: Chat, message: string): boolean {
  const text = message.trim();
  return (
    chat.bootId !== null &&
    !chat.paused &&
    !!text &&
    text.length <= agentMessageLimit &&
    // A lost turn awaits the owner's decision before anything else is sent.
    !chat.turns.some((turn) => isActive(turn) || turn.state === "lost")
  );
}

/** Milliseconds until the next poll: 1 s for 15 s, then 2 s; failures back off. */
export function pollDelay(elapsed: number, failures: number): number {
  const base = elapsed < fastPolling ? 1000 : 2000;
  return failures ? Math.min(slowestPoll, base * 2 ** failures) : base;
}

/** Elapsed time as `m:ss`. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The identical body of every attempt to start one turn. */
export function postInput(chat: Chat, runId: string): AgentRunInput {
  const turn = chat.turns.find((candidate) => candidate.runId === runId);
  if (!turn) throw new Error("Unknown agent turn.");
  return {
    run_id: turn.runId,
    boot_id: turn.bootId,
    conversation_id: chat.conversationId,
    message: turn.message,
    ...(turn.context ? { context: turn.context } : {}),
  };
}

/** What a reload must be able to resume; nothing for an untouched chat. */
export function storedState(chat: Chat): StoredAgent | null {
  const pending = chat.turns.find(
    (turn) => turn.state === "sending" || turn.state === "uncertain",
  );
  if (!chat.acknowledged && !pending) return null;
  return {
    conversationId: chat.conversationId,
    acknowledged: chat.acknowledged,
    pending: pending
      ? {
          runId: pending.runId,
          bootId: pending.bootId,
          message: pending.message,
          ...(pending.context ? { context: pending.context } : {}),
        }
      : null,
  };
}

const unchanged = (chat: Chat): Step => ({ chat, effects: [] });
const stop = (runId?: string): Effect =>
  runId === undefined ? { kind: "stop" } : { kind: "stop", runId };

function withTurn(chat: Chat, runId: string, change: (turn: Turn) => Turn) {
  return {
    ...chat,
    turns: chat.turns.map((turn) =>
      turn.runId === runId ? change(turn) : turn,
    ),
  };
}
const without = (chat: Chat, runId: string): Chat => ({
  ...chat,
  turns: chat.turns.filter((turn) => turn.runId !== runId),
});

function turnFor(
  runId: string,
  bootId: string,
  message: string,
  context: AgentRunContext | undefined,
  now: number,
  resumed: boolean,
): Turn {
  return {
    runId,
    bootId,
    message,
    context,
    state: "sending",
    startedAt: now,
    attempts: 0,
    resumed,
    exhausted: false,
    cancel: "none",
    pollFailures: 0,
    reply: null,
    replyTruncated: false,
    error: null,
  };
}

function turnOfRun(run: AgentRun): Turn {
  return {
    ...turnFor(
      run.run_id,
      "",
      run.message,
      undefined,
      Date.parse(run.created_at) || 0,
      false,
    ),
    state: run.state,
    reply: run.reply,
    replyTruncated: run.reply_truncated,
    error: run.error,
  };
}

/** The host's account of a run replaces what the browser knew of the turn. */
function settled(turn: Turn, run: AgentRun): Turn {
  return {
    ...turn,
    state: run.state,
    attempts: 0,
    exhausted: false,
    pollFailures: 0,
    reply: run.reply,
    replyTruncated: run.reply_truncated,
    error: run.error,
  };
}

function acknowledge(chat: Chat, run: AgentRun): Chat {
  return { ...chat, acknowledged: true, provider: run.provider };
}

/** Everything an in-flight turn needs when the session returns. */
function resumption(chat: Chat): Effect[] {
  return chat.turns.flatMap((turn): Effect[] => {
    if (
      turn.state === "sending" ||
      (turn.state === "uncertain" && !turn.exhausted)
    )
      return [{ kind: "post", runId: turn.runId, delay: 0 }];
    if (turn.state === "running")
      return [
        { kind: "poll", runId: turn.runId, delay: 0 },
        ...(turn.cancel === "requested"
          ? [{ kind: "cancel", runId: turn.runId, delay: 0 } as const]
          : []),
      ];
    return [];
  });
}

function afterRun(chat: Chat, run: AgentRun, runId: string, now: number): Step {
  const turn = chat.turns.find((candidate) => candidate.runId === runId);
  if (!turn) return unchanged(chat);
  const next = acknowledge(
    withTurn(chat, runId, (current) => settled(current, run)),
    run,
  );
  return {
    chat: next,
    effects:
      run.state === "running"
        ? [{ kind: "poll", runId, delay: pollDelay(now - turn.startedAt, 0) }]
        : [stop(runId)],
  };
}

function lose(chat: Chat, runId: string): Step {
  return {
    chat: withTurn(chat, runId, (turn) => ({ ...turn, state: "lost" })),
    effects: [stop(runId), { kind: "status" }],
  };
}

function pause(chat: Chat): Step {
  return chat.paused
    ? unchanged(chat)
    : { chat: { ...chat, paused: true }, effects: [stop()] };
}

function refuse(chat: Chat, turn: Turn, code: string): Step {
  return {
    chat: { ...without(chat, turn.runId), sendError: code },
    effects: [
      { kind: "composer", text: turn.message },
      stop(turn.runId),
      ...(code === "AGENT_PROVIDER_UNAVAILABLE" ||
      code === "AGENT_HOST_RESTARTED"
        ? [{ kind: "status" } as const]
        : []),
    ],
  };
}

function restore(
  chat: Chat,
  event: Extract<ChatEvent, { type: "restore" }>,
): Step {
  const { stored, remote, bootId, now } = event;
  const pending = stored?.pending ?? null;
  // A stored turn the host has no run for may never have been delivered.
  const withPending = (turns: Turn[]) =>
    pending && !turns.some((turn) => turn.runId === pending.runId)
      ? [
          ...turns,
          turnFor(
            pending.runId,
            pending.bootId,
            pending.message,
            pending.context,
            now,
            true,
          ),
        ]
      : turns;
  if (stored && remote !== "not-found") {
    const turns = withPending(remote.runs.map(turnOfRun));
    const next: Chat = {
      ...chat,
      conversationId: stored.conversationId,
      provider: remote.provider,
      acknowledged: true,
      bootId,
      turns,
      notice: "",
      sendError: "",
    };
    return {
      chat: next,
      effects: [
        ...turns
          .filter((turn) => turn.state === "running")
          .map((turn): Effect => ({
            kind: "poll",
            runId: turn.runId,
            delay: 0,
          })),
        ...turns
          .filter((turn) => turn.state === "sending")
          .map((turn): Effect => ({
            kind: "post",
            runId: turn.runId,
            delay: 0,
          })),
      ],
    };
  }
  // The host does not know it (or nothing was stored). A turn that may not
  // have been delivered still belongs to its own conversation.
  const keep = stored && pending ? stored.conversationId : event.conversationId;
  const turns = withPending([]);
  return {
    chat: {
      ...newChat(keep),
      bootId,
      turns,
      notice: stored?.acknowledged ? "gone" : "",
    },
    effects: turns.map((turn): Effect => ({
      kind: "post",
      runId: turn.runId,
      delay: 0,
    })),
  };
}

/** The next conversation and what must happen because of `event`. */
export function reduce(chat: Chat, event: ChatEvent): Step {
  switch (event.type) {
    case "status":
      return { chat: { ...chat, bootId: event.bootId }, effects: [] };

    case "send": {
      if (!canSend(chat, event.message) || chat.bootId === null)
        return unchanged(chat);
      const turn = turnFor(
        event.runId,
        chat.bootId,
        event.message.trim(),
        event.context,
        event.now,
        false,
      );
      return {
        chat: {
          ...chat,
          turns: [...chat.turns, turn],
          sendError: "",
          notice: "",
        },
        effects: [{ kind: "post", runId: turn.runId, delay: 0 }],
      };
    }

    case "posted": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (!turn || (turn.state !== "sending" && turn.state !== "uncertain"))
        return unchanged(chat);
      return afterRun(chat, event.run, event.runId, event.now);
    }

    case "post-failed": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (!turn || (turn.state !== "sending" && turn.state !== "uncertain"))
        return unchanged(chat);
      const { failure } = event;
      if (failure.kind === "session") return pause(chat);
      if (failure.kind === "rejected") return refuse(chat, turn, failure.code);
      if (failure.kind === "restarted") {
        // A first attempt that the restarted host refused cannot have started
        // anything. Any other turn may have been accepted before the restart.
        return turn.attempts === 0 && !turn.resumed
          ? refuse(chat, turn, "AGENT_HOST_RESTARTED")
          : lose(chat, event.runId);
      }
      const attempts = turn.attempts + 1;
      const delay = retryDelays[attempts - 1];
      return {
        chat: withTurn(chat, event.runId, (current) => ({
          ...current,
          state: "uncertain",
          attempts,
          exhausted: delay === undefined,
        })),
        effects:
          delay === undefined
            ? []
            : [{ kind: "post", runId: event.runId, delay }],
      };
    }

    case "retry": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (!turn || turn.state !== "uncertain" || !turn.exhausted || chat.paused)
        return unchanged(chat);
      return {
        chat: withTurn(chat, event.runId, (current) => ({
          ...current,
          state: "sending",
          attempts: 0,
          exhausted: false,
        })),
        effects: [{ kind: "post", runId: event.runId, delay: 0 }],
      };
    }

    case "polled": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (turn?.state !== "running") return unchanged(chat);
      return afterRun(chat, event.run, event.runId, event.now);
    }

    case "poll-failed": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (turn?.state !== "running") return unchanged(chat);
      if (event.failure.kind === "session") return pause(chat);
      if (event.failure.kind === "not-found") return lose(chat, event.runId);
      const pollFailures = turn.pollFailures + 1;
      return {
        chat: withTurn(chat, event.runId, (current) => ({
          ...current,
          pollFailures,
        })),
        effects: [
          {
            kind: "poll",
            runId: event.runId,
            delay: pollDelay(event.now - turn.startedAt, pollFailures),
          },
        ],
      };
    }

    case "cancel": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (turn?.state !== "running" || turn.cancel !== "none")
        return unchanged(chat);
      return {
        chat: withTurn(chat, event.runId, (current) => ({
          ...current,
          cancel: "requested",
        })),
        effects: [{ kind: "cancel", runId: event.runId, delay: 0 }],
      };
    }

    case "cancel-answered": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (turn?.state !== "running") return unchanged(chat);
      const step = afterRun(chat, event.run, event.runId, event.now);
      return {
        chat: withTurn(step.chat, event.runId, (current) =>
          current.state === "running"
            ? { ...current, cancel: "acknowledged" }
            : current,
        ),
        effects: step.effects,
      };
    }

    case "cancel-failed": {
      const turn = chat.turns.find(
        (candidate) => candidate.runId === event.runId,
      );
      if (turn?.state !== "running") return unchanged(chat);
      if (event.failure.kind === "session") return pause(chat);
      if (event.failure.kind === "not-found") return lose(chat, event.runId);
      // Cancelling twice is harmless, so ask again until the host answers.
      return {
        chat,
        effects: [{ kind: "cancel", runId: event.runId, delay: cancelRetry }],
      };
    }

    case "send-again": {
      const lost = chat.turns.find(
        (candidate) =>
          candidate.runId === event.runId && candidate.state === "lost",
      );
      if (!lost) return unchanged(chat);
      return {
        chat: {
          ...newChat(event.conversationId),
          bootId: event.bootId,
          paused: chat.paused,
          turns: [
            turnFor(
              event.newRunId,
              event.bootId,
              lost.message,
              lost.context,
              event.now,
              false,
            ),
          ],
        },
        effects: [stop(), { kind: "post", runId: event.newRunId, delay: 0 }],
      };
    }

    case "discard": {
      if (!chat.turns.some((turn) => turn.state === "lost"))
        return unchanged(chat);
      return {
        chat: {
          ...newChat(event.conversationId),
          bootId: chat.bootId,
          paused: chat.paused,
        },
        effects: [stop()],
      };
    }

    case "new-conversation": {
      if (activeTurn(chat)) return unchanged(chat);
      return {
        chat: {
          ...newChat(event.conversationId),
          bootId: chat.bootId,
          paused: chat.paused,
        },
        effects: [stop()],
      };
    }

    case "restore":
      return restore(chat, event);

    case "session-ended":
      return pause(chat);

    case "session-restored":
      return chat.paused
        ? { chat: { ...chat, paused: false }, effects: resumption(chat) }
        : unchanged(chat);

    case "wake":
      return chat.paused
        ? unchanged(chat)
        : {
            chat,
            effects: chat.turns
              .filter((turn) => turn.state === "running")
              .map((turn): Effect => ({
                kind: "poll",
                runId: turn.runId,
                delay: 0,
              })),
          };

    case "dismiss-notice":
      return chat.notice
        ? { chat: { ...chat, notice: "" }, effects: [] }
        : unchanged(chat);

    case "dismiss-error":
      return chat.sendError
        ? { chat: { ...chat, sendError: "" }, effects: [] }
        : unchanged(chat);
  }
}
