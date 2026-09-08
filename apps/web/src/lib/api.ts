import { ReadRequests, ReadQueueFullError } from "./read-requests.ts";
import type {
  Bootstrap,
  Summary,
  CommandStatus,
  CommandResponse,
  Accepted,
} from "./api.generated";
export type { Bootstrap, Summary, CommandStatus } from "./api.generated";
export type Resource = NonNullable<CommandResponse["result"]["resource"]>;
export type Metadata = Resource["metadata"];
export type Pending = Readonly<{
  path: string;
  method: string;
  payload: unknown;
  version?: string;
  requestId: string;
  epoch: string;
}>;
export type CommandState = CommandStatus["state"];
export function commandStatus(pending: Pick<Pending, "requestId" | "epoch">) {
  const query = new URLSearchParams({ epoch: pending.epoch });
  return api<CommandStatus>(`/api/v1/commands/${pending.requestId}?${query}`);
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
    const messages: Record<string, string> = {
      DEPENDENCY_INVALID:
        "This dependency would create a cycle or refer to a missing card. Choose a different connection.",
      VERSION_CONFLICT:
        "This resource changed since you opened it. Your draft has been kept.",
      UNDO_TARGET_CHANGED:
        "A later change prevents this undo. The saved resource has not been changed.",
      EPOCH_CHANGED:
        "The server state changed. Check the current resource before starting a new command.",
      VALIDATION_FAILED:
        "Some fields are not valid. Check the dates and additional fields.",
      WORKSPACE_RECOVERY_REQUIRED:
        "The workspace has an unresolved save. Check diagnostics before retrying.",
      SESSION_REQUIRED: "Your session ended. Connect this browser again.",
    };
    super(
      messages[code] ??
        String(
          (data.error as { message?: string })?.message ??
            `Request failed (${status})`,
        ),
    );
    this.status = status;
    this.data = data;
  }
}
let bootstrap: Bootstrap;
let clockOffset = 0;
export function configure(value: Bootstrap) {
  bootstrap = value;
  clockOffset = Date.parse(value.server_time) - Date.now();
}
const reads = new ReadRequests();
export type ReadOptions = { signal?: AbortSignal; fresh?: boolean };
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
    );
  } catch (error) {
    if (error instanceof ReadQueueFullError)
      throw new ApiError(503, {
        error: { code: "SERVER_BUSY", message: error.message },
      });
    throw error;
  }
}
async function request<T>(
  path: string,
  method: string,
  payload: unknown,
  headers: Record<string, string>,
  readSignal?: AbortSignal,
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
      const response = await fetch(path, {
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
      const value = response.status === 204 ? null : await response.json();
      if (response.status === 401)
        window.dispatchEvent(new Event("session-ended"));
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
): Pending {
  // RFC 9562 UUIDv7: a millisecond timestamp followed by random bits.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = BigInt(Math.trunc(Date.now() + clockOffset));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(time & 255n);
    time >>= 8n;
  }
  bytes[6] = (bytes[6] & 15) | 112;
  bytes[8] = (bytes[8] & 63) | 128;
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
    epoch: bootstrap.command_epoch,
  });
}
export type CommandReply = Partial<
  Pick<CommandResponse, "result" | "warnings"> &
    Pick<CommandStatus, "state"> &
    Pick<Accepted, "job_id">
>;
export async function send(pending: Pending): Promise<CommandReply> {
  const reply = await api<CommandReply>(
    pending.path,
    pending.method,
    pending.payload,
    {
      "X-Request-ID": pending.requestId,
      "X-Command-Epoch": pending.epoch,
      ...(pending.version ? { "If-Match": `"${pending.version}"` } : {}),
    },
  );
  if (reply.warnings?.length)
    window.dispatchEvent(
      new CustomEvent("command-warning", { detail: reply.warnings }),
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
  throw new Error("Result is too large. Narrow the project or search filter.");
}
export function resourcePath(
  item: Pick<Summary, "type" | "id" | "project_id">,
) {
  const root = `/api/v1/projects/${item.project_id}`;
  return item.type === "project"
    ? root
    : `${root}/${item.type === "card" ? "cards" : item.type === "milestone" ? "milestones" : "updates"}/${item.id}`;
}
