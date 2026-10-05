import assert from "node:assert/strict";
import test from "node:test";
import { failureAnnotation } from "../browser/annotations.mjs";

test("a failed suite becomes one escaped workflow error annotation", () => {
  const annotation = failureAnnotation(
    "session-recovery",
    'first line\r\n{"id":"R03","status":"fail","error":"100% wrong"}\n',
  );
  assert.equal(
    annotation,
    '::error title=Browser suite session-recovery failed::first line%0D%0A{"id":"R03","status":"fail","error":"100%25 wrong"}',
  );
});

test("an annotation keeps the end of a long log, where the failure is", () => {
  const annotation = failureAnnotation("editor", `${"x".repeat(9000)}\nlast`);
  assert.ok(annotation.length < 3200, String(annotation.length));
  assert.ok(annotation.endsWith("%0Alast"));
  assert.ok(annotation.includes("::…"));
});

test("failing scenario lines are preferred over passing output", () => {
  const log = [
    '{"id":"C01","status":"pass"}',
    '{"id":"C02","status":"fail","error":"Timeout 10000ms"}',
    ...Array.from(
      { length: 400 },
      (_, i) => `{"id":"P${i}","status":"pass","detail":"${"y".repeat(40)}"}`,
    ),
  ].join("\n");
  const annotation = failureAnnotation("command-recovery", log);
  assert.ok(annotation.includes('"id":"C02"'), annotation.slice(0, 200));
});
