import type { AgentRunContext } from "../../lib/contracts/api.generated";
import { isUuid } from "../../lib/api/uuid.ts";
import { workspaceViews } from "../workspace/navigation.ts";

/** The longest message the agent contract accepts, in UTF-16 code units. */
export const agentMessageLimit = 8000;

/** A turn that was sent but whose acknowledgement has not been seen. */
export type StoredTurn = {
  runId: string;
  bootId: string;
  message: string;
  context?: AgentRunContext;
};
/**
 * What survives a reload: which conversation this profile was in, whether the
 * host has ever acknowledged one of its turns, and the one turn that may not
 * have reached the host yet.
 */
export type StoredAgent = {
  conversationId: string;
  acknowledged: boolean;
  pending: StoredTurn | null;
};

export const agentStorageKey = (userId: string) => `astra-agent:v1:${userId}`;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function context(value: unknown): AgentRunContext | undefined {
  if (!record(value)) return undefined;
  const view = workspaceViews.find((candidate) => candidate === value.view);
  const project = isUuid(value.project_id, 4) ? value.project_id : undefined;
  if (!view && !project) return undefined;
  return {
    ...(view ? { view } : {}),
    ...(project ? { project_id: project } : {}),
  };
}

function turn(value: unknown): StoredTurn | null {
  if (
    !record(value) ||
    !isUuid(value.runId, 7) ||
    !isUuid(value.bootId, 4) ||
    typeof value.message !== "string" ||
    !value.message.trim() ||
    value.message.length > agentMessageLimit
  )
    return null;
  const scope = context(value.context);
  return {
    runId: value.runId,
    bootId: value.bootId,
    message: value.message,
    ...(scope ? { context: scope } : {}),
  };
}

/** Keep only fields this version understands; anything else is a stranger's. */
function normalize(value: unknown): StoredAgent | null {
  if (!record(value) || !isUuid(value.conversationId, 4)) return null;
  return {
    conversationId: value.conversationId,
    acknowledged: value.acknowledged === true,
    pending: turn(value.pending),
  };
}

/** Browser-local resumption data only; the host stays authoritative. */
export function readAgentState(
  userId: string,
  storage?: Pick<Storage, "getItem">,
): StoredAgent | null {
  try {
    return normalize(
      JSON.parse(
        (storage ?? localStorage).getItem(agentStorageKey(userId)) ?? "null",
      ),
    );
  } catch {
    return null;
  }
}

/** `null` forgets the profile's conversation. Reports whether storage took it. */
export function writeAgentState(
  userId: string,
  state: StoredAgent | null,
  storage?: Pick<Storage, "setItem" | "removeItem">,
): boolean {
  try {
    const target = storage ?? localStorage;
    const clean = normalize(state);
    if (clean) target.setItem(agentStorageKey(userId), JSON.stringify(clean));
    else if (state === null) target.removeItem(agentStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}
