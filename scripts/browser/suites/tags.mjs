/** Project-scoped tags through a paired browser and real source files. */
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

await runBrowserSuite(
  async ({ config, cli, runtime, evidence, browser, newContext, pair }) => {
    const project = config.projects[0].id;
    const other = config.projects[1].id;
    const base = `/api/v1/projects/${project}`;
    const commandFile = join(runtime, "tag-command.json");
    const results = [];
    const errors = [];
    const context = await newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    const manager = () =>
      page.getByRole("dialog", { name: "Manage project tags" });
    const get = (id) => cli("get", `${base}/cards/${id}`);
    const catalog = (id = project) => cli("get", `/api/v1/projects/${id}/tags`);
    const unique = (name) => `${name} ${Date.now().toString(36)}`;

    async function mutate(method, path, payload, version) {
      await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
      const args = ["command", method, path, "--json-file", commandFile];
      if (version) args.push("--if-version", version);
      return cli(...args).result;
    }
    async function create(projectId, payload) {
      return (
        await mutate("POST", `/api/v1/projects/${projectId}/cards`, payload)
      ).id;
    }
    async function open(projectId = project) {
      await page.goto(`${config.origin}/?view=list&project=${projectId}`);
      await page.getByRole("button", { name: "Workspace settings" }).click();
      await page.getByRole("button", { name: "Manage tags" }).click();
      await expect(
        manager().getByLabel("Project", { exact: true }),
      ).toHaveValue(projectId);
      await expect(
        manager().getByRole("list", { name: "Project tags" }),
      ).toBeVisible();
    }
    async function close() {
      if (!(await manager().count())) return;
      await manager()
        .getByRole("button", { name: "Close tag manager" })
        .click();
      await manager().waitFor({ state: "hidden" });
    }
    async function preview(source, target) {
      await manager()
        .getByRole("listitem")
        .filter({ hasText: source })
        .getByRole("button", { name: "Rename / merge" })
        .click();
      await manager().getByLabel("Destination tag").fill(target);
      await manager().getByRole("button", { name: "Preview changes" }).click();
      await expect(
        manager().getByRole("region", { name: "Tag rename preview" }),
      ).toBeVisible();
    }
    async function check(id, name, run) {
      try {
        results.push({ id, name, status: "pass", detail: await run() });
      } catch (cause) {
        results.push({ id, name, status: "fail", error: String(cause) });
        await page
          .screenshot({ path: join(evidence, `${id}-failure.png`) })
          .catch(() => {});
      } finally {
        await close().catch(() => {});
        console.log(JSON.stringify(results.at(-1)));
        await writeFile(
          join(evidence, "results.json"),
          JSON.stringify({ results, errors }, null, 2),
        );
      }
    }

    try {
      await pair(page);
      await check(
        "T01",
        "Project catalog and suggestions do not leak across projects",
        async () => {
          const name = unique("Local tag");
          const card = await create(project, {
            title: unique("Tag owner"),
            labels: [name],
          });
          assert(
            catalog().tags.some((tag) => tag.name === name && tag.usage === 1),
          );
          assert(
            cli(
              "--project",
              config.projects[0].folder,
              "tags",
              "list",
            ).tags.some((tag) => tag.name === name && tag.usage === 1),
          );
          assert(!catalog(other).tags.some((tag) => tag.name === name));
          await open(other);
          const otherCard = await create(other, {
            title: unique("Suggestion probe"),
          });
          await close();
          await page.goto(
            `${config.origin}/?view=list&project=${other}&type=card&resource=${otherCard}`,
          );
          const editor = page.getByRole("dialog", { name: "Edit resource" });
          await editor
            .getByRole("combobox", { name: "Labels" })
            .fill(name.slice(0, 8));
          await expect(
            editor.getByRole("option", { name, exact: true }),
          ).toHaveCount(0);
          assert.deepEqual(get(card).metadata.labels, [name]);
          return { name, isolated: true };
        },
      );

      await check(
        "T02",
        "One project job merges active and archived card labels",
        async () => {
          const source = unique("Source");
          const target = unique("Target");
          const first = await create(project, {
            title: unique("Active"),
            labels: [source, target, "Keep"],
          });
          const second = await create(project, {
            title: unique("Archived"),
            labels: ["Before", source],
            archived: true,
          });
          const otherCard = await create(other, {
            title: unique("Other"),
            labels: [source],
          });
          await open();
          await preview(source, target);
          await expect(
            manager().getByRole("heading", { name: "2 affected cards" }),
          ).toBeVisible();
          await manager()
            .getByRole("button", { name: "Rename in this project" })
            .click();
          await expect(
            manager().getByRole("button", { name: "Close tag manager" }),
          ).toBeEnabled();
          assert.deepEqual(get(first).metadata.labels, [target, "Keep"]);
          assert.deepEqual(get(second).metadata.labels, ["Before", target]);
          assert.equal(get(second).metadata.archived, true);
          assert.deepEqual(
            cli("get", `/api/v1/projects/${other}/cards/${otherCard}`).metadata
              .labels,
            [source],
          );
          assert(!catalog().tags.some((tag) => tag.name === source));
          return { first, second, otherCard };
        },
      );

      await check(
        "T03",
        "An edit after preview rejects the job before changing any card",
        async () => {
          const source = unique("Conflict");
          const target = unique("Renamed");
          const first = await create(project, {
            title: unique("First"),
            labels: [source],
          });
          const second = await create(project, {
            title: unique("Second"),
            labels: [source],
          });
          await open();
          await preview(source, target);
          const before = get(second);
          await mutate(
            "PATCH",
            `${base}/cards/${second}`,
            { set: { title: "External edit" } },
            before.version,
          );
          await manager()
            .getByRole("button", { name: "Rename in this project" })
            .click();
          await expect(manager().getByRole("alert")).toContainText(
            "PLAN_STALE",
          );
          assert.deepEqual(get(first).metadata.labels, [source]);
          assert.deepEqual(get(second).metadata.labels, [source]);
          return { staleRejected: true };
        },
      );
    } finally {
      await writeFile(
        join(evidence, "results.json"),
        JSON.stringify(
          { results, errors, browser: browser.version() },
          null,
          2,
        ),
      );
      if (results.some((item) => item.status !== "pass") || errors.length)
        process.exitCode = 1;
    }
  },
);
