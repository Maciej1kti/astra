const form = (version: 4 | 7, flags = "") =>
  new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
    flags,
  );
const canonical = { 4: form(4), 7: form(7) };
const anyCase = form(4, "i");

/**
 * A lowercase RFC 9562 UUID of exactly this version, as the server writes it:
 * version 4 for resources, users and jobs, version 7 for request IDs.
 */
export function isUuid(value: unknown, version: 4 | 7): value is string {
  return typeof value === "string" && canonical[version].test(value);
}

/** Source files edited by other tools may carry an uppercase version 4 ID. */
export function isUuidAnyCase(value: unknown): value is string {
  return typeof value === "string" && anyCase.test(value);
}
