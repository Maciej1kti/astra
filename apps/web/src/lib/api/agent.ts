import { api, ApiError, apiCode, type ReadOptions } from "./api.ts";
import { InvalidResponseError } from "./transport-errors.ts";
import { isUuid } from "./uuid.ts";
import type {
  AgentConversation,
  AgentRun,
  AgentRunInput,
  AgentStatus,
} from "../contracts/api.generated";

/**
 * Operations of the in-app agent. Replies are checked against the contract
 * here, so a proxy's page or a half-written reply is an unreadable reply that
 * callers treat like a lost connection, never as a run.
 */

const providers = ["claude", "codex"];
const states = ["running", "succeeded", "failed", "cancelled", "timed_out"];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const optionalText = (value: unknown) => value === null || text(value);
const unreadable = () => new InvalidResponseError(200);

function isRun(value: unknown): value is AgentRun {
  if (!record(value)) return false;
  const { error } = value;
  return (
    isUuid(value.run_id, 7) &&
    isUuid(value.conversation_id, 4) &&
    providers.includes(value.provider as string) &&
    states.includes(value.state as string) &&
    text(value.message) &&
    optionalText(value.reply) &&
    typeof value.reply_truncated === "boolean" &&
    (error === null ||
      (record(error) && text(error.code) && optionalText(error.detail))) &&
    text(value.created_at) &&
    optionalText(value.finished_at)
  );
}
function run(value: unknown): AgentRun {
  if (!isRun(value)) throw unreadable();
  return value;
}
function status(value: unknown): AgentStatus {
  if (
    !record(value) ||
    !isUuid(value.boot_id, 4) ||
    !providers.includes(value.provider as string) ||
    !Array.isArray(value.providers) ||
    !value.providers.every(
      (entry: unknown) =>
        record(entry) &&
        providers.includes(entry.id as string) &&
        typeof entry.available === "boolean",
    )
  )
    throw unreadable();
  return value as unknown as AgentStatus;
}
function conversation(value: unknown): AgentConversation {
  if (
    !record(value) ||
    !isUuid(value.conversation_id, 4) ||
    !providers.includes(value.provider as string) ||
    !Array.isArray(value.runs) ||
    !value.runs.every(isRun)
  )
    throw unreadable();
  return value as unknown as AgentConversation;
}

/** Every read is current: polls and the boot ID must never share a request. */
const fresh = (options: Pick<ReadOptions, "signal"> = {}): ReadOptions => ({
  ...options,
  fresh: true,
});

export async function getAgentStatus(
  options: Pick<ReadOptions, "signal"> = {},
) {
  return status(
    await api<unknown>("/api/v1/agent", "GET", undefined, {}, fresh(options)),
  );
}

/** Repeating the identical body is harmless: the host starts the run once. */
export async function startAgentRun(input: AgentRunInput) {
  return run(await api<unknown>("/api/v1/agent/runs", "POST", input));
}

export async function getAgentRun(
  runId: string,
  options: Pick<ReadOptions, "signal"> = {},
) {
  return run(
    await api<unknown>(
      `/api/v1/agent/runs/${runId}`,
      "GET",
      undefined,
      {},
      fresh(options),
    ),
  );
}

export async function cancelAgentRun(runId: string) {
  return run(
    await api<unknown>(`/api/v1/agent/runs/${runId}/cancel`, "POST", {}),
  );
}

export async function getAgentConversation(
  conversationId: string,
  options: Pick<ReadOptions, "signal"> = {},
) {
  return conversation(
    await api<unknown>(
      `/api/v1/agent/conversations/${conversationId}`,
      "GET",
      undefined,
      {},
      fresh(options),
    ),
  );
}

const ended = (error: unknown) =>
  (error instanceof ApiError || error instanceof InvalidResponseError) &&
  error.status === 401;

/**
 * What a failed start means. A refusal by the host (any `AGENT_` code or a
 * validation failure) started nothing; every other failure leaves the outcome
 * unknown, so the identical request may be repeated.
 */
export type StartFailure =
  | { kind: "unknown" }
  | { kind: "restarted" }
  | { kind: "rejected"; code: string }
  | { kind: "session" };
export function startFailure(error: unknown): StartFailure {
  if (ended(error)) return { kind: "session" };
  const code = apiCode(error);
  if (code === "AGENT_HOST_RESTARTED") return { kind: "restarted" };
  if (code?.startsWith("AGENT_") || code === "VALIDATION_FAILED")
    return { kind: "rejected", code };
  return { kind: "unknown" };
}

/** What a failed poll, cancel or conversation read means. */
export type ReadFailure =
  { kind: "unreachable" } | { kind: "not-found" } | { kind: "session" };
export function readFailure(error: unknown): ReadFailure {
  if (ended(error)) return { kind: "session" };
  const code = apiCode(error);
  // The host answered and does not know it: a restart, or the agent was switched off.
  if (
    code === "AGENT_RUN_NOT_FOUND" ||
    code === "AGENT_CONVERSATION_NOT_FOUND" ||
    code === "AGENT_DISABLED"
  )
    return { kind: "not-found" };
  return { kind: "unreachable" };
}
