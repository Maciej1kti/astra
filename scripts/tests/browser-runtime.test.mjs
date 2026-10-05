import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localClient } from "../browser/host.mjs";
import {
  readSuiteRuntime,
  withBrowser,
  withHost,
} from "../browser/runtime.mjs";
import { runSuites } from "../browser/regressions.mjs";

test("CLI exit and envelope must both establish the expected result", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astra-cli-runtime-"));
  try {
    const binary = join(temp, "fixture-cli");
    await writeFile(
      binary,
      `#!${process.execPath}
const scenario = process.argv.at(-1);
const envelope = { api_version: "1", ok: true, http_status: 200, data: { value: "saved" } };
let code = 0;
if (scenario === "unexpected") code = 7;
if (scenario === "accepted" || scenario === "invalid-accepted") code = 9;
if (scenario === "accepted") {
  envelope.http_status = 202;
  envelope.data = { status: "running", job_id: "original-job" };
}
if (scenario === "error") envelope.ok = false;
if (scenario === "no-data") delete envelope.data;
if (scenario === "malformed") { process.stdout.write("invalid JSON"); process.exit(0); }
process.stdout.write(JSON.stringify(envelope));
process.exit(code);
`,
      { mode: 0o700 },
    );
    const cli = localClient("unused-synthetic-socket", { binary });
    assert.deepEqual(cli("get", "success"), { value: "saved" });
    assert.throws(() => cli("get", "unexpected"), /exited 7/);
    assert.throws(() => cli("get", "accepted"), /exited 9/);
    assert.deepEqual(cli("register", "accepted"), {
      status: "running",
      job_id: "original-job",
    });
    assert.throws(() => cli("register", "invalid-accepted"), /200 !== 202/);
    assert.throws(() => cli("get", "error"));
    assert.throws(() => cli("get", "no-data"), /must contain data/);
    assert.throws(() => cli("get", "malformed"), SyntaxError);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("browser setup failure closes the browser and then the synthetic host", async () => {
  const closed = [];
  const setupFailure = new Error("Storage state cannot be loaded");
  await assert.rejects(
    withHost(
      () =>
        withBrowser(
          async ({ newContext }) => {
            await newContext();
          },
          {
            launch: async () => ({
              newContext: async () => {
                throw setupFailure;
              },
              close: async () => {
                closed.push("browser");
              },
            }),
          },
        ),
      {
        create: async () => ({
          close: async () => {
            closed.push("host");
          },
        }),
      },
    ),
    setupFailure,
  );
  assert.deepEqual(closed, ["browser", "host"]);
});

test("scenario/reporting failure closes an acquired browser and host; fixture failure closes the host", async () => {
  const closed = [];
  const failure = new Error("Scenario assertion or report write failed");
  const create = async () => ({
    close: async () => {
      closed.push("host");
    },
  });
  await assert.rejects(
    withHost(
      () =>
        withBrowser(
          async ({ newContext }) => {
            await newContext({ timezoneId: "Pacific/Honolulu" });
            throw failure;
          },
          {
            launch: async () => ({
              newContext: async (options) => {
                assert.equal(options.timezoneId, "Pacific/Honolulu");
                assert.equal(options.ignoreHTTPSErrors, true);
                assert.deepEqual(options.viewport, {
                  width: 1440,
                  height: 1000,
                });
              },
              close: async () => {
                closed.push("browser");
              },
            }),
          },
        ),
      { create },
    ),
    failure,
  );
  assert.deepEqual(closed, ["browser", "host"]);
  await assert.rejects(
    withHost(
      async () => {
        throw new Error("Seed failed");
      },
      { create },
    ),
    /Seed failed/,
  );
  assert.deepEqual(closed, ["browser", "host", "host"]);
});

test("runtime and suite selection are explicit before acquiring any browser or host", async () => {
  await assert.rejects(readSuiteRuntime({}), /provide ASTRA_AUDIT_RUNTIME/);
  await assert.rejects(
    readSuiteRuntime({ ASTRA_AUDIT_RUNTIME: "/unused" }),
    /ASTRA_EVIDENCE_DIR/,
  );
  await assert.rejects(runSuites(["not-a-suite"]), /Choose browser suites/);
  await assert.rejects(runSuites([]), /Choose browser suites/);
});
