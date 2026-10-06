import { onMount } from "svelte";
import { newRequestId } from "../../lib/api/api";
import {
  cancelAgentRun,
  getAgentConversation,
  getAgentRun,
  getAgentStatus,
  readFailure,
  startAgentRun,
  startFailure,
} from "../../lib/api/agent.ts";
import { sessionAccess } from "../../lib/api/command-operation.svelte";
import { errorMessage, loadMessages } from "../../lib/api/messages.ts";
import type {
  AgentConversation,
  AgentProvider,
  AgentRun,
  AgentRunContext,
  AgentStatus,
} from "../../lib/contracts/api.generated";
import {
  activeTurn,
  canSend,
  newChat,
  postInput,
  reduce,
  storedState,
  type Chat,
  type ChatEvent,
  type Effect,
} from "./agent-chat.ts";
import { readAgentState, writeAgentState } from "./agent-storage.ts";

/** How long one poll may take before the next attempt replaces it. */
const readTimeout = 10_000;

type Hooks = {
  /** The profile whose conversation this is; it never changes in a tab. */
  userId: string;
  /** Where the owner is now; sent with each new message. */
  context: () => AgentRunContext | undefined;
  /** Whether the dialog is showing, which decides what counts as unseen. */
  visible: () => boolean;
};

/**
 * Timers, requests and reactive state around the conversation rules in
 * `agent-chat.ts`. It lives as long as the dialog component, so closing the
 * dialog does not stop polling.
 */
export function agentSession(hooks: Hooks) {
  let chat = $state.raw<Chat>(newChat(crypto.randomUUID()));
  let status = $state.raw<AgentStatus | null>(null);
  let phase = $state<"idle" | "loading" | "ready" | "error">("idle");
  let loadError = $state("");
  let problem = $state("");
  let draft = $state("");
  let unseen = $state(false);
  let clock = $state(Date.now());
  let composerRevision = $state(0);

  const access = sessionAccess({
    ended: () => dispatch({ type: "session-ended" }),
    restored: () => dispatch({ type: "session-restored", now: Date.now() }),
  });

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const requests = new Map<string, AbortController>();
  let restored = false;
  let written = "";

  function persist() {
    // Until the stored conversation has been read, an untouched chat must not
    // overwrite it.
    if (!restored) return;
    const state = storedState(chat);
    const serialized = JSON.stringify(state);
    if (serialized === written) return;
    if (writeAgentState(hooks.userId, state)) written = serialized;
  }

  /** A result the owner has not seen: a settled or stuck turn while closed. */
  function noticeable(before: Chat, after: Chat) {
    return after.turns.some((turn) => {
      const earlier = before.turns.find((item) => item.runId === turn.runId);
      if (!earlier) return false;
      const wasBusy =
        earlier.state === "sending" ||
        earlier.state === "running" ||
        (earlier.state === "uncertain" && !earlier.exhausted);
      const isDone =
        turn.state === "succeeded" ||
        turn.state === "failed" ||
        turn.state === "cancelled" ||
        turn.state === "timed_out" ||
        turn.state === "lost" ||
        (turn.state === "uncertain" && turn.exhausted);
      return wasBusy && isDone;
    });
  }

  function dispatch(event: ChatEvent) {
    const before = chat;
    const step = reduce(before, event);
    if (step.chat !== before) {
      chat = step.chat;
      clock = Date.now();
      persist();
      if (!hooks.visible() && noticeable(before, step.chat)) unseen = true;
    }
    for (const effect of step.effects) perform(effect);
  }

  function schedule(key: string, delay: number, run: () => void) {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        run();
      }, delay),
    );
  }
  function stop(runId?: string) {
    for (const [key, timer] of [...timers])
      if (runId === undefined || key.endsWith(`:${runId}`)) {
        clearTimeout(timer);
        timers.delete(key);
      }
    for (const [key, request] of [...requests])
      if (runId === undefined || key.endsWith(`:${runId}`)) {
        request.abort();
        requests.delete(key);
      }
  }

  function perform(effect: Effect) {
    switch (effect.kind) {
      case "post":
        schedule(
          `post:${effect.runId}`,
          effect.delay,
          () => void post(effect.runId),
        );
        break;
      case "poll":
        schedule(
          `poll:${effect.runId}`,
          effect.delay,
          () => void poll(effect.runId),
        );
        break;
      case "cancel":
        schedule(
          `cancel:${effect.runId}`,
          effect.delay,
          () => void cancel(effect.runId),
        );
        break;
      case "status":
        refreshStatus();
        break;
      case "composer":
        draft = draft.trim() ? `${effect.text}\n\n${draft}` : effect.text;
        composerRevision++;
        break;
      case "stop":
        stop(effect.runId);
        break;
    }
  }

  const sameRun = (run: AgentRun, runId: string) => {
    if (run.run_id !== runId) throw new TypeError("Another run answered.");
    return run;
  };

  async function post(runId: string) {
    const turn = chat.turns.find((item) => item.runId === runId);
    const open =
      turn?.state === "sending" ||
      (turn?.state === "uncertain" && !turn.exhausted);
    if (!open || chat.paused || requests.has(`post:${runId}`)) return;
    const controller = new AbortController();
    requests.set(`post:${runId}`, controller);
    try {
      const run = sameRun(await startAgentRun(postInput(chat, runId)), runId);
      if (requests.get(`post:${runId}`) !== controller) return;
      dispatch({ type: "posted", runId, run, now: Date.now() });
    } catch (cause) {
      if (requests.get(`post:${runId}`) !== controller) return;
      dispatch({
        type: "post-failed",
        runId,
        failure: startFailure(cause),
        now: Date.now(),
      });
    } finally {
      if (requests.get(`post:${runId}`) === controller)
        requests.delete(`post:${runId}`);
    }
  }

  async function poll(runId: string) {
    if (
      chat.turns.find((item) => item.runId === runId)?.state !== "running" ||
      chat.paused
    )
      return;
    // A newer poll, for example on returning to the page, replaces a stalled one.
    requests.get(`poll:${runId}`)?.abort();
    const controller = new AbortController();
    requests.set(`poll:${runId}`, controller);
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Timeout.", "TimeoutError")),
      readTimeout,
    );
    try {
      const run = sameRun(
        await getAgentRun(runId, { signal: controller.signal }),
        runId,
      );
      if (requests.get(`poll:${runId}`) !== controller) return;
      dispatch({ type: "polled", runId, run, now: Date.now() });
    } catch (cause) {
      if (requests.get(`poll:${runId}`) !== controller) return;
      dispatch({
        type: "poll-failed",
        runId,
        failure: readFailure(cause),
        now: Date.now(),
      });
    } finally {
      clearTimeout(timeout);
      if (requests.get(`poll:${runId}`) === controller)
        requests.delete(`poll:${runId}`);
    }
  }

  async function cancel(runId: string) {
    if (
      chat.turns.find((item) => item.runId === runId)?.state !== "running" ||
      chat.paused
    )
      return;
    try {
      const run = sameRun(await cancelAgentRun(runId), runId);
      dispatch({ type: "cancel-answered", runId, run, now: Date.now() });
    } catch (cause) {
      dispatch({ type: "cancel-failed", runId, failure: readFailure(cause) });
    }
  }

  async function readStatus() {
    const next = await getAgentStatus();
    status = next;
    dispatch({ type: "status", bootId: next.boot_id });
    return next;
  }
  /** The previous reading stays when this fails: a refresh must not hide the chat. */
  function refreshStatus() {
    void readStatus().catch(() => {});
  }

  /** Read the status, then bring back the stored conversation (once). */
  async function load() {
    if (phase === "loading") return;
    phase = "loading";
    loadError = "";
    try {
      // Failed runs name their cause by code; the catalog must be ready.
      await loadMessages();
      const next = await readStatus();
      if (!restored) {
        const stored = readAgentState(hooks.userId);
        let remote: AgentConversation | "not-found" = "not-found";
        if (stored) {
          try {
            remote = await getAgentConversation(stored.conversationId);
          } catch (cause) {
            if (readFailure(cause).kind !== "not-found") throw cause;
          }
        }
        restored = true;
        dispatch({
          type: "restore",
          stored,
          remote,
          bootId: next.boot_id,
          conversationId: crypto.randomUUID(),
          now: Date.now(),
        });
      }
      phase = "ready";
    } catch (cause) {
      loadError = errorMessage(cause);
      phase = "error";
    }
  }

  function wake() {
    if (document.visibilityState !== "visible") return;
    dispatch({ type: "wake", now: Date.now() });
    if (hooks.visible() && phase === "ready") refreshStatus();
  }

  // Elapsed time ticks only while a run is being waited for.
  const waiting = $derived(chat.turns.some((turn) => turn.state === "running"));
  $effect(() => {
    if (!waiting) return;
    const tick = setInterval(() => (clock = Date.now()), 1000);
    return () => clearInterval(tick);
  });

  onMount(() => {
    // A conversation that exists in this browser resumes without being opened.
    if (readAgentState(hooks.userId)) void load();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      stop();
    };
  });

  const provider = (): AgentProvider | null =>
    chat.provider ?? status?.provider ?? null;
  const sendable = () =>
    phase === "ready" && !unavailable() && canSend(chat, draft);
  const unavailable = (): AgentProvider | null => {
    const wanted = provider();
    return wanted &&
      status?.providers.find((item) => item.id === wanted)?.available === false
      ? wanted
      : null;
  };

  return {
    get chat() {
      return chat;
    },
    get phase() {
      return phase;
    },
    get loadError() {
      return loadError;
    },
    /** A failed action the owner should see above the composer. */
    get problem() {
      return problem;
    },
    get draft() {
      return draft;
    },
    set draft(value: string) {
      draft = value;
    },
    get provider() {
      return provider();
    },
    /** The provider the next message would use, when its CLI is missing. */
    get unavailable() {
      return unavailable();
    },
    get sessionLost() {
      return access.lost;
    },
    get now() {
      return clock;
    },
    get composerRevision() {
      return composerRevision;
    },
    /** A turn is in flight: the owner cannot start another or a new chat. */
    get active() {
      return activeTurn(chat) !== undefined;
    },
    /** The dialog holds something that closing the session must not discard. */
    get holds() {
      return (
        !!draft.trim() ||
        chat.turns.some(
          (turn) =>
            turn.state === "sending" ||
            turn.state === "running" ||
            turn.state === "uncertain" ||
            turn.state === "lost",
        )
      );
    },
    get unseen() {
      return unseen;
    },
    get canSend() {
      return sendable();
    },
    /** The owner opened the dialog: show what is current. */
    opened() {
      unseen = false;
      problem = "";
      if (phase === "idle" || phase === "error") void load();
      else if (phase === "ready") refreshStatus();
    },
    /** The notice about a vanished conversation is shown once. */
    closed() {
      dispatch({ type: "dismiss-notice" });
    },
    retryLoad: () => void load(),
    send() {
      if (!sendable()) return;
      const before = chat;
      problem = "";
      dispatch({
        type: "send",
        runId: newRequestId(),
        message: draft,
        context: hooks.context(),
        now: Date.now(),
      });
      if (chat.turns.length > before.turns.length) draft = "";
    },
    cancel: (runId: string) => dispatch({ type: "cancel", runId }),
    retry: (runId: string) =>
      dispatch({ type: "retry", runId, now: Date.now() }),
    async sendAgain(runId: string) {
      problem = "";
      try {
        const next = await readStatus();
        dispatch({
          type: "send-again",
          runId,
          newRunId: newRequestId(),
          conversationId: crypto.randomUUID(),
          bootId: next.boot_id,
          now: Date.now(),
        });
      } catch (cause) {
        problem = errorMessage(cause);
      }
    },
    discard: () =>
      dispatch({ type: "discard", conversationId: crypto.randomUUID() }),
    newConversation() {
      problem = "";
      dispatch({
        type: "new-conversation",
        conversationId: crypto.randomUUID(),
      });
    },
    dismissError: () => dispatch({ type: "dismiss-error" }),
  };
}
