/** Real daemon regression for named/generic tag workflows and retained administration. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHost } from "./host.mjs";

export async function cliTagWorkflow() {
  const host = await createHost();
  function run(...args) {
    let stdout,
      code = 0;
    const env = { ...process.env };
    delete env.ASTRA_USER;
    try {
      stdout = execFileSync(
        join(host.binaries, "projectctl"),
        ["--socket", host.socket, ...args],
        {
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        },
      );
    } catch (error) {
      if (!Number.isInteger(error.status) || error.signal) throw error;
      code = error.status;
      stdout = error.stdout;
    }
    return { code, envelope: JSON.parse(stdout) };
  }
  try {
    const plan = host.cli(
      "registration-plan",
      host.folder,
      "--name",
      "Tag CLI regression",
    );
    host.cli("register", plan.plan_id);
    const root = `/api/v1/projects/${plan.project_id}`;
    const input = join(host.temp, "request.json");
    await writeFile(
      input,
      JSON.stringify({ title: "Tags", labels: ["Before", "Keep"] }),
    );
    const created = host.cli(
      "--project",
      host.folder,
      "card",
      "create",
      "--input",
      input,
    );
    const card = created.result.id;
    for (const [source, target, generic] of [
      ["Before", "After", false],
      ["After", "Final", true],
    ]) {
      await writeFile(input, JSON.stringify({ source, target }));
      const preview = generic
        ? run("command", "POST", `${root}/tags/preview?`, "--json-file", input)
        : run(
            "--project",
            host.folder,
            "tags",
            "preview",
            "--source",
            source,
            "--target",
            target,
          );
      assert.equal(preview.code, 0, JSON.stringify(preview.envelope));
      assert.equal(
        preview.envelope.request_id,
        null,
        "Preview must not acquire a durable identity",
      );
      assert.equal(preview.envelope.command_epoch, null);
      await writeFile(
        input,
        JSON.stringify({ plan_id: preview.envelope.data.plan_id }),
      );
      const arguments_ = generic
        ? ["command", "POST", `${root}/tags/rename?`, "--json-file", input]
        : [
            "--project",
            host.folder,
            "tags",
            "rename",
            preview.envelope.data.plan_id,
          ];
      const renamed = run(...arguments_);
      assert.equal(renamed.code, 9, JSON.stringify(renamed.envelope));
      assert.equal(renamed.envelope.ok, true, JSON.stringify(renamed.envelope));
      assert.equal(renamed.envelope.http_status, 202);
      assert.equal(renamed.envelope.data.status, "running");
      const { request_id, command_epoch } = renamed.envelope;
      assert.equal(renamed.envelope.data.request_id, request_id);
      assert.equal(
        host.cli("command-status", request_id, "--epoch", command_epoch).state,
        "committed",
      );
      assert.equal(host.cli("job", renamed.envelope.data.job_id).state, "done");
      const sourceBeforeRetry = await readFile(
        join(host.folder, `.project/cards/${card}.json`),
      );
      const replayed = run(
        ...arguments_,
        "--request-id",
        request_id,
        "--epoch",
        command_epoch,
      );
      assert.equal(replayed.code, 9, JSON.stringify(replayed.envelope));
      assert.deepEqual(replayed.envelope.data, renamed.envelope.data);
      assert.equal(replayed.envelope.request_id, request_id);
      assert.equal(replayed.envelope.command_epoch, command_epoch);
      assert.deepEqual(
        await readFile(join(host.folder, `.project/cards/${card}.json`)),
        sourceBeforeRetry,
      );
      assert.deepEqual(
        host.cli("--project", host.folder, "card", "get", card).metadata.labels,
        [target, "Keep"],
      );
    }
    const preferences = host.cli("get", "/api/v1/workspace/preferences");
    await writeFile(input, "{}");
    for (const [method, path] of [
      ["GET", `/api/v1/registrations/${plan.project_id}`],
      ["DELETE", `/api/v1/registrations/${plan.project_id}`],
      ["GET", "/api/v1/workspace/tag-suggestions"],
    ]) {
      const response =
        method === "GET"
          ? run("get", path)
          : run(
              "command",
              method,
              path,
              "--json-file",
              input,
              "--if-version",
              preferences.version,
            );
      assert.equal(response.code, 4, JSON.stringify(response.envelope));
      assert.equal(response.envelope.http_status, 404);
      assert.equal(response.envelope.error.code, "NOT_FOUND");
    }
    const source = await readFile(join(host.folder, ".project/project.json"));
    await writeFile(
      input,
      JSON.stringify({
        operation: "unregister",
        project_id: plan.project_id,
        expected_workspace_version: preferences.version,
      }),
    );
    const unregister = host.cli("maintenance-plan", "--json-file", input);
    const applied = run("maintenance-apply", unregister.plan_id);
    assert.equal(applied.envelope.ok, true, JSON.stringify(applied.envelope));
    assert.equal(host.cli("job", applied.envelope.data.job_id).state, "done");
    assert.equal(host.cli("projects").items.length, 0);
    assert.deepEqual(
      await readFile(join(host.folder, ".project/project.json")),
      source,
    );
  } finally {
    await host.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cliTagWorkflow();
  console.log(
    "PASS real daemon CLI tag workflows, retries and local unregistration",
  );
}
