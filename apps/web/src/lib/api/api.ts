import { serverMessage, loadMessages } from "./messages.ts";
import {
  validateCommandReply,
  validCommandError,
  invalidConfirmation,
} from "./confirmation.ts";
import { publishSession } from "./session-events.ts";
import { InvalidResponseError, TransportError } from "./transport-errors.ts";
import { ReadRequests, ReadQueueFullError } from "./read-requests.ts";
import { pinUserToTab, selectedUserId } from "./user-selection.ts";
import type {
  Bootstrap,
  Summary,
  CommandStatus,
  CommandResponse,
  ProjectResource,
  CardResource,
  MilestoneResource,
  UpdateResource,
} from "../contracts/api.generated";
export type {
  Bootstrap,
  Summary,
  CommandStatus,
} from "../contracts/api.generated";
export type Resource =
  ProjectResource | CardResource | MilestoneResource | UpdateResource;
export type Pending = Readonly<{
  path: string;
  method: string;
  payload: unknown;
  version?: string;
  requestId: string;
  epoch: string;
  userId?: string;
}>;
export function commandStatus(
  pending: Pick<Pending, "requestId" | "epoch" | "userId">,
) {
  const query = new URLSearchParams({ epoch: pending.epoch });
  return api<CommandStatus>(
    `/api/v1/commands/${pending.requestId}?${query}`,
    "GET",
    undefined,
    pending.userId ? { "X-Astra-User": pending.userId } : {},
  );
}
export function isDefinitiveRejection(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status < 500 &&
    ![401, 403, 429].includes(error.status)
  );
}
function freezeJson(value: unknown): unknown {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freezeJson(nested);
    Object.freeze(value);
  }
  return value;
}
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, data: Record<string, unknown>) {
    const code = (data.error as { code?: string })?.code ?? "";
    super(serverMessage(code, status));
    this.status = status;
    this.data = data;
  }
}
let bootstrap: Bootstrap;
let clockOffset = 0;
// Only an accepted bootstrap creates a session whose loss can be reported.
let authenticated = false;
export function configure(value: Bootstrap) {
  bootstrap = value;
  authenticated = true;
  clockOffset = Date.parse(value.server_time) - Date.now();
  if (value.user) pinUserToTab(value.user.id);
}
/** A deliberate sign-out or reported loss: later 401s are not a new loss. */
export function closeSession() {
  authenticated = false;
}
const reads = new ReadRequests();
export type ReadOptions = {
  signal?: AbortSignal;
  fresh?: boolean;
  immediate?: boolean;
};
let independentRead = 0;
export function clearReads() {
  reads.clear();
}
export function apiCode(error: unknown) {
  return error instanceof ApiError
    ? (error.data.error as { code?: string })?.code
    : undefined;
}
export async function api<T>(
  path: string,
  method = "GET",
  payload?: unknown,
  headers: Record<string, string> = {},
  options: ReadOptions = {},
): Promise<T> {
  headers = {
    ...(selectedUserId() ? { "X-Astra-User": selectedUserId() } : {}),
    ...headers,
  };
  if (method !== "GET") return request<T>(path, method, payload, headers);
  const key = JSON.stringify([
    path,
    bootstrap?.csrf_token,
    Object.entries(headers).sort(),
    options.fresh ? ++independentRead : null,
  ]);
  try {
    return await reads.run(
      key,
      (signal) => request<T>(path, method, payload, headers, signal),
      options.signal,
      options.immediate,
    );
  } catch (error) {
    if (error instanceof ReadQueueFullError)
      throw new ApiError(503, {
        error: { code: "SERVER_BUSY", message: error.message },
      });
    throw error;
  }
}
/** One HTTP exchange. Neither failure below proves a mutation was rejected. */
async function exchange(path: string, init: RequestInit) {
  // A cancelled or timed-out request keeps its own reason.
  const failed = (cause: unknown, fallback?: Error) =>
    init.signal?.aborted
      ? cause
      : cause instanceof TypeError
        ? new TransportError({ cause })
        : (fallback ?? cause);
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (cause) {
    throw failed(cause);
  }
  // The status alone ends an existing session, whatever body accompanies it.
  if (response.status === 401 && authenticated) {
    authenticated = false;
    publishSession("ended");
  }
  let value;
  try {
    value = response.status === 204 ? null : await response.json();
  } catch (cause) {
    // Engines disagree on the error an unparsable body raises.
    throw failed(cause, new InvalidResponseError(response.status, { cause }));
  }
  if (!response.ok && (value === null || typeof value !== "object"))
    throw new InvalidResponseError(response.status);
  return { response, value };
}
async function request<T>(
  path: string,
  method: string,
  payload: unknown,
  headers: Record<string, string>,
  readSignal?: AbortSignal,
  pending?: Pending,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // Mutations have their own transport deadline and are never cancelled with a view.
    const controller = new AbortController();
    const timeout = readSignal
      ? undefined
      : setTimeout(() => controller.abort(), 15_000);
    const signal = readSignal ?? controller.signal;
    try {
      signal.throwIfAborted();
      const { response, value } = await exchange(path, {
        method,
        credentials: "same-origin",
        signal,
        headers: {
          ...(payload !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(bootstrap ? { "X-CSRF-Token": bootstrap.csrf_token } : {}),
          ...headers,
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });
      if (pending) {
        if (response.ok) validateCommandReply(value, pending, response.status);
        else if (!validCommandError(value, pending)) invalidConfirmation();
      }
      if (!response.ok || value?.warnings?.length || value?.error)
        await loadMessages();
      if (!response.ok) throw new ApiError(response.status, value);
      return value as T;
    } catch (error) {
      // Only explicit SERVER_BUSY read rejections are safe to retry automatically.
      if (!(
        method === "GET" &&
        attempt < 2 &&
        error instanceof ApiError &&
        error.status === 503 &&
        apiCode(error) === "SERVER_BUSY"
      ))
        throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 100 * (attempt + 1) + Math.random() * 80),
    );
  }
}
export function command(
  path: string,
  method: string,
  payload: unknown,
  version?: string,
  scope?: { userId: string; epoch: string },
): Pending {
  // RFC 9562 UUIDv7: a millisecond timestamp followed by random bits.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = BigInt(Math.trunc(Date.now() + clockOffset));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(time & 255n);
    time >>= 8n;
  }
  bytes[6] = ((bytes[6] ?? 0) & 15) | 112;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return Object.freeze({
    path,
    method,
    // Detach Svelte proxies/caller objects and preserve the JSON wire meaning.
    payload:
      payload === undefined
        ? undefined
        : freezeJson(JSON.parse(JSON.stringify(payload))),
    version,
    requestId,
    epoch: scope?.epoch ?? bootstrap.command_epoch,
    ...((scope?.userId ?? bootstrap.user?.id ?? selectedUserId())
      ? { userId: scope?.userId ?? bootstrap.user?.id ?? selectedUserId() }
      : {}),
  });
}
export type CommandReply =
  | { kind: "committed"; reply: CommandResponse }
  | { kind: "accepted"; jobId: string }
  | { kind: "unresolved"; state: "prepared" | "blocked" | "needs_review" };

/** Unknown or incomplete success responses must retain the original command. */
export function normalizeCommandReply(
  value: unknown,
  pending?: Pending,
): CommandReply {
  if (pending) validateCommandReply(value, pending);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      (record.status === "committed" || record.status === "noop") &&
      record.result &&
      typeof record.result === "object" &&
      Array.isArray(record.warnings)
    ) {
      return { kind: "committed", reply: value as CommandResponse };
    }
    if (
      record.status === "running" &&
      typeof record.job_id === "string" &&
      record.job_id
    ) {
      return { kind: "accepted", jobId: record.job_id };
    }
    if (
      record.state === "prepared" ||
      record.state === "blocked" ||
      record.state === "needs_review"
    ) {
      return { kind: "unresolved", state: record.state };
    }
  }
  throw new Error(
    "Nieprawidłowa odpowiedź polecenia. Sprawdź pierwotne polecenie przed ponowieniem.",
  );
}
export async function send(pending: Pending): Promise<CommandReply> {
  const value = await request<unknown>(
    pending.path,
    pending.method,
    pending.payload,
    {
      "X-Request-ID": pending.requestId,
      "X-Command-Epoch": pending.epoch,
      ...(pending.userId ? { "X-Astra-User": pending.userId } : {}),
      ...(pending.version ? { "If-Match": `"${pending.version}"` } : {}),
    },
    undefined,
    pending,
  );
  const reply = normalizeCommandReply(value, pending);
  if (reply.kind === "committed" && reply.reply.warnings.length)
    window.dispatchEvent(
      new CustomEvent("command-warning", { detail: reply.reply.warnings }),
    );
  return reply;
}
export async function all<T = Summary>(
  path: string,
  options: ReadOptions & {
    onPage?: (value: import("./projection-state").ProjectionState) => void;
  } = {},
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const value: {
      items: T[];
      next_cursor?: string | null;
      page?: { next_cursor?: string | null; freshness?: string };
      warnings?: { code?: string; message?: string }[];
    } = await api(
      `${path}${path.includes("?") ? "&" : "?"}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      "GET",
      undefined,
      {},
      options,
    );
    items.push(...value.items);
    options.onPage?.(value);
    cursor = value.next_cursor ?? value.page?.next_cursor ?? null;
    if (!cursor) return items;
  }
  throw new Error(
    "Wynik jest zbyt duży. Zawęź projekt lub filtr wyszukiwania.",
  );
}
export function resourcePath(
  item: Pick<Summary, "type" | "id" | "project_id">,
) {
  const root = `/api/v1/projects/${item.project_id}`;
  return item.type === "project"
    ? root
    : `${root}/${item.type === "card" ? "cards" : item.type === "milestone" ? "milestones" : "updates"}/${item.id}`;
}
