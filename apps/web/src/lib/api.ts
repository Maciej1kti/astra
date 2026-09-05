import type {
  CardMetadata,
  MilestoneMetadata,
  ProjectMetadata,
  UpdateMetadata,
} from "./domain.generated";
export type Metadata =
  CardMetadata | MilestoneMetadata | ProjectMetadata | UpdateMetadata;
export type Resource = {
  metadata: Metadata;
  body: string;
  version: string;
  read?: boolean;
};
export type Summary = {
  id: string;
  project_id: string;
  type: "project" | "card" | "milestone" | "update";
  title: string;
  status?: string;
  priority?: string;
  availability: string;
  schedule?: { start: string; end: string };
  due?: { date: string; kind: string };
  review_on?: string;
  position?: string;
  kind?: string;
  recorded_at?: string;
  blocked?: { reason: string };
  labels?: string[];
  archived?: boolean;
  version: string;
  read?: boolean;
};
export type Bootstrap = {
  csrf_token: string;
  command_epoch: string;
  snapshot_cursor: string;
  instance_name: string;
  timezone: string;
  server_time: string;
};
export type Pending = {
  path: string;
  method: string;
  payload: unknown;
  version?: string;
  requestId: string;
  epoch: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public data: Record<string, unknown>,
  ) {
    const code = (data.error as { code?: string })?.code ?? "";
    const messages: Record<string, string> = {
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
  }
}
let bootstrap: Bootstrap;
let clockOffset = 0;
export function configure(value: Bootstrap) {
  bootstrap = value;
  clockOffset = Date.parse(value.server_time) - Date.now();
}
let activeReads = 0;
const waitingReads: (() => void)[] = [];
async function readSlot() {
  if (activeReads < 3) activeReads++;
  else {
    if (waitingReads.length >= 32)
      throw new ApiError(503, {
        error: {
          code: "SERVER_BUSY",
          message: "Waiting for previous reads to finish.",
        },
      });
    await new Promise<void>((resolve) => waitingReads.push(resolve));
  }
  return () => {
    const next = waitingReads.shift();
    if (next) next();
    else activeReads--;
  };
}
export async function api<T>(
  path: string,
  method = "GET",
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let release: (() => void) | undefined;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (method === "GET") release = await readSlot();
      timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        signal: controller.signal,
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
      // Only retry rejected reads. Mutations retain their original identity and
      // always require an explicit retry after an uncertain transport result.
      if (!(
        method === "GET" &&
        attempt < 2 &&
        error instanceof ApiError &&
        error.status === 503 &&
        (error.data.error as { code?: string })?.code === "SERVER_BUSY"
      ))
        throw error;
    } finally {
      clearTimeout(timeout);
      release?.();
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
  return {
    path,
    method,
    payload,
    version,
    requestId,
    epoch: bootstrap.command_epoch,
  };
}
export async function send(pending: Pending): Promise<{
  result?: { resource?: Resource };
  job_id?: string;
  state?: string;
  warnings?: { code: string; message: string }[];
}> {
  const reply = await api<{
    result?: { resource?: Resource };
    job_id?: string;
    state?: string;
    warnings?: { code: string; message: string }[];
  }>(pending.path, pending.method, pending.payload, {
    "X-Request-ID": pending.requestId,
    "X-Command-Epoch": pending.epoch,
    ...(pending.version ? { "If-Match": `"${pending.version}"` } : {}),
  });
  if (reply.warnings?.length)
    window.dispatchEvent(
      new CustomEvent("command-warning", { detail: reply.warnings }),
    );
  return reply;
}
export async function all<T = Summary>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const value: {
      items: T[];
      next_cursor?: string | null;
      page?: { next_cursor?: string | null };
    } = await api(
      `${path}${path.includes("?") ? "&" : "?"}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...value.items);
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
