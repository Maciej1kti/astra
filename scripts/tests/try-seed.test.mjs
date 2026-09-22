import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedSampleProject } from "../try-seed.mjs";

test("manual restart leaves an unregistered sample out of the workspace", async () => {
  const project = await mkdtemp(join(tmpdir(), "astra-unregistered-sample-"));
  try {
    await mkdir(join(project, ".project"));
    const calls = [];
    await seedSampleProject(
      (...args) => {
        calls.push(args);
        throw new Error("Sample is no longer registered");
      },
      project,
      join(project, "sample-seeded"),
    );
    assert.deepEqual(
      calls,
      [],
      "retained sources must not trigger registration",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("first manual launch seeds three cards once and preserves later edits", async () => {
  const project = await mkdtemp(join(tmpdir(), "astra-new-sample-"));
  try {
    const calls = [];
    let registered = false;
    const cli = (...args) => {
      calls.push(args);
      if (args[0] === "registration-plan") return { plan_id: "sample-plan" };
      if (args[0] === "register") {
        registered = true;
        return {};
      }
      if (args.at(-1) === "cards") {
        if (!registered) throw new Error("Sample is not registered");
        return { items: [] };
      }
      return {};
    };
    await seedSampleProject(cli, project, join(project, "sample-seeded"));
    assert.equal(calls.filter((args) => args[0] === "register").length, 1);
    assert.deepEqual(
      calls.filter((args) => args[3] === "create").map((args) => args.at(-1)),
      ["Try editing this card", "Plan a few dates", "Write a progress update"],
    );
    await mkdir(join(project, ".project"));
    const previousCalls = calls.length;
    await seedSampleProject(cli, project, join(project, "sample-seeded"));
    assert.equal(calls.length, previousCalls);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("physical deletion of a previously seen sample does not recreate it", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astra-deleted-sample-"));
  const project = join(temp, "sample");
  const marker = join(temp, "sample-seeded");
  try {
    await mkdir(join(project, ".project"), { recursive: true });
    const cli = () => {
      throw new Error("An intentionally deleted sample must not be recreated");
    };
    await seedSampleProject(cli, project, marker);
    await rm(join(project, ".project"), { recursive: true });
    await seedSampleProject(cli, project, marker);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
