import type { Pending } from "./api";

const uuid = (value: unknown, version: 4 | 7) =>
  typeof value === "string" &&
  new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
  ).test(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && [...value].length <= max;
const version = (value: unknown) =>
  typeof value === "string" && /^r1\.[0-9a-f]{64}$/.test(value);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fields(
  value: unknown,
  allowed: string[],
): value is Record<string, unknown> {
  return (
    object(value) && Object.keys(value).every((key) => allowed.includes(key))
  );
}
function identity(value: Record<string, unknown>, pending: Pending) {
  return (
    value.api_version === "1" &&
    uuid(value.request_id, 7) &&
    value.request_id === pending.requestId
  );
}
function expectedType(pending: Pending) {
  if (/^\/api\/v1\/users(?:\/[^/]+)?$/.test(pending.path)) return "user";
  if (/\/cards(?:\/[^/]+)?$/.test(pending.path)) return "card";
  if (/\/milestones(?:\/[^/]+)?$/.test(pending.path)) return "milestone";
  if (/\/updates(?:\/[^/]+)?$/.test(pending.path)) return "update";
  if (/\/projects\/[^/]+$/.test(pending.path)) return "project";
  if (pending.path.endsWith("/read-receipts")) return "receipt";
  if (workflow(pending)) return "job";
  return pending.path.split("/").at(-1);
}
function workflow(pending: Pending) {
  return (
    pending.path === "/api/v1/registrations" ||
    pending.path.endsWith("/tags/rename")
  );
}
function resource(value: unknown) {
  return (
    fields(value, ["type", "metadata", "body", "version"]) &&
    ["project", "card", "milestone", "update"].includes(String(value.type)) &&
    object(value.metadata) &&
    typeof value.body === "string" &&
    version(value.version)
  );
}
function userResource(value: unknown, id: unknown) {
  return (
    fields(value, ["id", "name", "is_default"]) &&
    uuid(value.id, 4) &&
    value.id === id &&
    text(value.name, 120) &&
    typeof value.is_default === "boolean"
  );
}
function userResult(value: Record<string, unknown>, pending: Pending) {
  if (!object(pending.payload) || !userResource(value.resource, value.id))
    return false;
  const user = value.resource as Record<string, unknown>;
  if (user.name !== pending.payload.name) return false;
  return pending.method === "POST" && pending.path === "/api/v1/users"
    ? value.id === pending.payload.id && user.is_default === false
    : pending.method === "PATCH" &&
        value.id === pending.path.split("/").at(-1) &&
        version(value.version);
}
function result(value: unknown, pending: Pending) {
  return (
    fields(value, ["type", "id", "version", "resource", "job_id", "deleted"]) &&
    value.type === expectedType(pending) &&
    (value.type !== "user" || userResult(value, pending)) &&
    (value.id === undefined || uuid(value.id, 4)) &&
    (value.job_id === undefined || uuid(value.job_id, 4)) &&
    (value.deleted === undefined || value.deleted === true) &&
    (value.deleted === true
      ? value.version === undefined && value.resource === undefined
      : (value.version === undefined || version(value.version)) &&
        (value.resource === undefined ||
          (value.type === "user"
            ? userResource(value.resource, value.id)
            : resource(value.resource) &&
              (value.resource as Record<string, unknown>).type === value.type)))
  );
}
function warning(value: unknown) {
  return (
    fields(value, ["code", "message", "field"]) &&
    text(value.code, 80) &&
    text(value.message, 1000) &&
    (value.field === undefined || text(value.field, 120))
  );
}
function committed(value: unknown, pending: Pending) {
  return (
    fields(value, [
      "api_version",
      "request_id",
      "status",
      "result",
      "warnings",
      "replayed",
    ]) &&
    identity(value, pending) &&
    ["committed", "noop"].includes(String(value.status)) &&
    result(value.result, pending) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 100 &&
    value.warnings.every(warning) &&
    typeof value.replayed === "boolean"
  );
}
export function validCommandError(value: unknown, pending: Pending) {
  return (
    fields(value, ["api_version", "error"]) &&
    value.api_version === "1" &&
    fields(value.error, ["code", "message", "request_id", "details"]) &&
    text(value.error.code, 80) &&
    text(value.error.message, 2000) &&
    (value.error.request_id === undefined ||
      (uuid(value.error.request_id, 7) &&
        value.error.request_id === pending.requestId)) &&
    (value.error.details === undefined || object(value.error.details))
  );
}
export function validateCommandStatus(value: unknown, pending: Pending) {
  const valid =
    fields(value, ["api_version", "request_id", "state", "result", "error"]) &&
    identity(value, pending) &&
    ["prepared", "committed", "rejected", "needs_review", "blocked"].includes(
      String(value.state),
    ) &&
    // A workflow's command row keeps its acceptance, so its finished status
    // carries no result; every other committed command must return one.
    (value.result === undefined
      ? value.state !== "committed" || workflow(pending)
      : committed(value.result, pending)) &&
    (value.error === undefined
      ? value.state !== "rejected"
      : value.state === "rejected" && validCommandError(value.error, pending));
  if (!valid) invalidConfirmation();
}
export function validateCommandReply(
  value: unknown,
  pending: Pending,
  httpStatus?: number,
) {
  if (committed(value, pending)) {
    if (
      httpStatus !== undefined &&
      (workflow(pending) || ![200, 201].includes(httpStatus))
    )
      invalidConfirmation();
    return;
  }
  if (httpStatus !== undefined && httpStatus !== 202) invalidConfirmation();
  if (
    fields(value, ["api_version", "request_id", "status", "job_id"]) &&
    identity(value, pending) &&
    workflow(pending) &&
    value.status === "running" &&
    uuid(value.job_id, 4)
  )
    return;
  if (
    object(value) &&
    ["prepared", "blocked", "needs_review"].includes(String(value.state))
  ) {
    validateCommandStatus(value, pending);
    return;
  }
  invalidConfirmation();
}
export function invalidConfirmation(): never {
  throw new Error(
    "Nieprawidłowa odpowiedź polecenia. Sprawdź pierwotne polecenie przed ponowieniem.",
  );
}
