import test from "node:test";
import assert from "node:assert/strict";
import { isUuid, isUuidAnyCase } from "../../apps/web/src/lib/api/uuid.ts";

const v4 = "12345678-1234-4234-8234-123456789abc";
const v7 = "0199a000-0000-7000-8000-000000000001";

test("a canonical identifier is lowercase and of exactly the requested version", () => {
  assert.equal(isUuid(v4, 4), true);
  assert.equal(isUuid(v7, 7), true);
  assert.equal(isUuid(v4, 7), false);
  assert.equal(isUuid(v7, 4), false);
  for (const variant of ["8", "9", "a", "b"])
    assert.equal(
      isUuid(`12345678-1234-4234-${variant}234-123456789abc`, 4),
      true,
    );
  for (const value of [
    v4.toUpperCase(),
    "12345678-1234-4234-c234-123456789abc",
    "12345678-1234-4234-7234-123456789abc",
    "12345678-1234-1234-8234-123456789abc",
    `${v4}0`,
    ` ${v4}`,
    `${v4}\n`,
    v4.replaceAll("-", ""),
    `{${v4}}`,
    "",
    null,
    undefined,
    42,
    [v4],
  ])
    assert.equal(isUuid(value, 4), false, String(value));
});

test("a source identifier may be uppercase but is still version 4", () => {
  assert.equal(isUuidAnyCase(v4), true);
  assert.equal(isUuidAnyCase(v4.toUpperCase()), true);
  assert.equal(isUuidAnyCase("12345678-1234-4234-B234-123456789ABC"), true);
  for (const value of [
    v7,
    v7.toUpperCase(),
    "12345678-1234-4234-C234-123456789ABC",
    `${v4}0`,
    "",
    null,
    42,
  ])
    assert.equal(isUuidAnyCase(value), false, String(value));
});
