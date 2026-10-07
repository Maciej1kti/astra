/**
 * Adding a project by name against a daemon started with a scripted GitHub
 * CLI: the folder in the default root, the private repository with a real
 * push, colliding names, a GitHub failure with its repetition, and the
 * default root in Settings. The account's state is crates/projectd/tests/fixtures.
 */
import { githubAccount } from "../github-host.mjs";
import { runBrowserSuite } from "../runtime.mjs";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

await runBrowserSuite(
  async ({ config, cli, evidence, browser, newContext }) => {
    const results = [];
    const errors = [];
    const webkit = browser.browserType().name() === "webkit";
    const account = githubAccount(config.temp);
    const home = join(config.temp, "new-projects");
    await mkdir(home, { mode: 0o700 });
    const homeRoot = cli("add-root", home, "--label", "Nowe projekty");
    const exists = (path) =>
      access(path).then(
        () => true,
        () => false,
      );
    const calls = async () =>
      (await readFile(join(account, "log"), "utf8").catch(() => ""))
        .split("\n")
        .filter(Boolean);
    const pushedFiles = (repository) =>
      execFileSync(
        "git",
        [
          "--git-dir",
          join(account, "remotes/octo", `${repository}.git`),
          "ls-tree",
          "-r",
          "--name-only",
          "main",
        ],
        { encoding: "utf8" },
      )
        .split("\n")
        .filter(Boolean);

    async function visit(page, parameters = { view: "projects" }) {
      await page.goto(`${config.origin}/?${new URLSearchParams(parameters)}`);
      await expect(page.locator("header.topbar")).toBeVisible();
      await expect(page.locator(".asidebottom")).toContainText(
        "Połączono z serwerem",
      );
    }
    const dialogOf = (page) =>
      page.getByRole("dialog", { name: "Dodaj projekt", exact: true });
    async function open(page) {
      await visit(page);
      await page
        .getByRole("button", { name: "Dodaj projekt", exact: false })
        .first()
        .click();
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      return dialog;
    }
    const nameOf = (dialog) =>
      dialog.getByLabel("Nazwa projektu", { exact: true });
    const createOf = (dialog) =>
      dialog.getByRole("button", { name: "Utwórz projekt", exact: true });
    /** A screenshot of settled layers: entrances have finished. */
    async function snapshot(page, name) {
      if (webkit) return;
      await page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({ path: join(evidence, name) });
    }
    async function check(id, name, run, options = {}) {
      const context = await newContext(options);
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on("pageerror", (error) =>
        errors.push({ id, message: error.message }),
      );
      const started = Date.now();
      try {
        const detail = await run(page);
        results.push({ id, name, status: "pass", detail });
      } catch (error) {
        results.push({ id, name, status: "fail", error: String(error) });
        await snapshot(page, `${id}-failure.png`).catch(() => {});
      } finally {
        results.at(-1).ms = Date.now() - started;
        await context.close();
        console.log(JSON.stringify(results.at(-1)));
        await writeFile(
          join(evidence, "results.json"),
          JSON.stringify(
            { results, errors, browser: browser.version() },
            null,
            2,
          ) + "\n",
        );
      }
    }

    await check(
      "P01",
      "A name alone creates the folder, registers the project and pushes a private repository",
      async (page) => {
        const dialog = await open(page);
        await expect(dialog).toContainText("także prywatne repozytorium");
        await expect(createOf(dialog)).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: /Wybierz folder/ }),
        ).toHaveCount(0);
        await snapshot(page, "P01-empty-dialog.png");
        // The keyboard alone is enough: type the name and press Enter.
        await nameOf(dialog).fill("Remont Kuchni Żółtej");
        await nameOf(dialog).press("Enter");
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        await expect(page).toHaveURL(/project=/);
        const project = new URL(page.url()).searchParams.get("project");
        const folder = join(home, "remont-kuchni-zoltej");
        assert.match(
          await readFile(join(folder, ".project/project.json"), "utf8"),
          /Remont Kuchni Żółtej/,
        );
        assert(
          (await calls()).includes(
            "repo create octo/remont-kuchni-zoltej --private",
          ),
        );
        const files = pushedFiles("remont-kuchni-zoltej");
        assert(files.includes(".project/project.json"), files.join());
        assert(files.includes("AGENTS.md"), files.join());
        assert(!files.some((file) => file.startsWith(".project/.local")));
        assert.equal(
          cli("get", `/api/v1/projects/${project}/repository`).state,
          "published",
        );

        // The project's Git dialog reports the repository and offers no publication.
        await page.getByRole("button", { name: "Git", exact: true }).click();
        const git = page.getByRole("dialog", {
          name: "Stan repozytorium Git",
          exact: true,
        });
        await expect(git).toContainText(
          "Projekt jest opublikowany w zdalnym repozytorium.",
        );
        await expect(git).toContainText("octo/remont-kuchni-zoltej.git");
        await expect(
          git.getByRole("button", { name: /Opublikuj|Ponów/ }),
        ).toHaveCount(0);
        await snapshot(page, "P01-git-dialog.png");
        return { project, files };
      },
    );

    await check(
      "P02",
      "A name taken in the root or on GitHub receives the first free suffix",
      async (page) => {
        // remont-kuchni-zoltej exists from P01; its -2 is taken on GitHub only.
        await mkdir(join(account, "remotes/octo/remont-kuchni-zoltej-2.git"), {
          recursive: true,
        });
        const dialog = await open(page);
        await nameOf(dialog).fill("remont kuchni żółtej");
        await createOf(dialog).click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        const folders = (await readdir(home)).sort();
        assert.deepEqual(folders, [
          "remont-kuchni-zoltej",
          "remont-kuchni-zoltej-3",
        ]);
        assert(
          await exists(
            join(account, "remotes/octo/remont-kuchni-zoltej-3.git/HEAD"),
          ),
        );
        return { folders };
      },
    );

    await check(
      "P03",
      "A GitHub failure leaves a working local project and the publication can be repeated",
      async (page) => {
        await writeFile(join(account, "offline"), "");
        const dialog = await open(page);
        await nameOf(dialog).fill("Bez sieci");
        await createOf(dialog).click();
        await expect(dialog).toContainText(
          "Projekt jest gotowy do pracy lokalnie",
        );
        await expect(dialog).toContainText("GitHub jest nieosiągalny z hosta");
        assert(await exists(join(home, "bez-sieci/.project/project.json")));
        assert(!(await exists(join(account, "remotes/octo/bez-sieci.git"))));
        await snapshot(page, "P03-github-failed.png");
        const retry = dialog.getByRole("button", {
          name: "Ponów publikację",
          exact: true,
        });
        // Still unreachable: the same notice stays and nothing is lost.
        await retry.click();
        await expect(retry).toBeEnabled();
        await expect(dialog).toContainText("GitHub jest nieosiągalny z hosta");
        await rm(join(account, "offline"));
        await retry.click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        await expect(page).toHaveURL(/project=/);
        assert(pushedFiles("bez-sieci").includes(".project/project.json"));
        assert.equal((await readdir(home)).includes("bez-sieci-2"), false);
        return { repeated: true };
      },
    );

    await check(
      "P04",
      "A failed publication can be left and repeated later from the project's Git dialog",
      async (page) => {
        await writeFile(join(account, "signed-out"), "");
        const dialog = await open(page);
        await nameOf(dialog).fill("Później");
        await createOf(dialog).click();
        await expect(dialog).toContainText(
          "Host nie jest zalogowany do GitHuba",
        );
        await dialog
          .getByRole("button", { name: "Otwórz projekt", exact: true })
          .click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        await expect(page).toHaveURL(/project=/);
        await rm(join(account, "signed-out"));
        await page.getByRole("button", { name: "Git", exact: true }).click();
        const git = page.getByRole("dialog", {
          name: "Stan repozytorium Git",
          exact: true,
        });
        await expect(git).toContainText(
          "Nie udało się opublikować projektu na GitHubie.",
        );
        await git
          .getByRole("button", { name: "Ponów publikację", exact: true })
          .click();
        await expect(git).toContainText(
          "Projekt jest opublikowany w zdalnym repozytorium.",
        );
        assert(pushedFiles("pozniej").includes("AGENTS.md"));
        return { publishedLater: true };
      },
    );

    await check(
      "P05",
      "Settings choose the root of new projects when the host approves several",
      async (page) => {
        const other = join(config.temp, "other-projects");
        await mkdir(other, { mode: 0o700 });
        const otherRoot = cli("add-root", other, "--label", "Inne projekty");
        const dialog = await open(page);
        await nameOf(dialog).fill("Bez katalogu");
        await createOf(dialog).click();
        await expect(dialog.getByRole("alert")).toContainText(
          "Nie wybrano katalogu nowych projektów. Wskaż go w Ustawieniach.",
        );
        // A refused creation leaves nothing behind and can be started again.
        await expect(nameOf(dialog)).toBeEnabled();
        assert.equal((await readdir(other)).length, 0);
        await dialog
          .getByRole("button", {
            name: "Zamknij dodawanie projektu",
            exact: true,
          })
          .click();

        await page
          .getByRole("button", {
            name: "Ustawienia przestrzeni roboczej",
            exact: true,
          })
          .click();
        const settings = page.getByRole("dialog", {
          name: "Ustawienia przestrzeni roboczej",
          exact: true,
        });
        const select = settings.getByLabel("Katalog nowych projektów", {
          exact: true,
        });
        await expect(select).toBeEnabled();
        await expect(select.locator("option")).toHaveText([
          "Nie wybrano",
          `Nowe projekty · ${home}`,
          `Inne projekty · ${other}`,
        ]);
        await select.selectOption(otherRoot.id);
        await snapshot(page, "P05-settings.png");
        await settings
          .getByRole("button", { name: "Zapisz ustawienia", exact: true })
          .click();
        await expect
          .poll(
            () =>
              cli("get", "/api/v1/workspace/preferences").preferences
                .project_root_id,
          )
          .toBe(otherRoot.id);
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog[open]")).toHaveCount(0);

        const again = await open(page);
        await nameOf(again).fill("W innym katalogu");
        await createOf(again).click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        assert(
          await exists(join(other, "w-innym-katalogu/.project/project.json")),
        );
        cli("remove-root", otherRoot.id);
        return { root: otherRoot.id, home: homeRoot.id };
      },
    );

    await check(
      "P06",
      "The dialog fits a phone and still offers an existing folder",
      async (page) => {
        const dialog = await open(page);
        await nameOf(dialog).fill("Projekt z telefonu o dość długiej nazwie");
        const geometry = await dialog.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            viewport: innerWidth,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert(geometry.left >= 0 && geometry.right <= geometry.viewport);
        assert.equal(geometry.overflow, false);
        const submit = await createOf(dialog).boundingBox();
        assert(submit.height >= 40, `tap target ${submit.height}`);
        await snapshot(page, "P06-phone.png");
        await dialog
          .getByText("Masz już folder z projektem?", { exact: true })
          .tap();
        await dialog
          .getByRole("button", { name: "Dodaj istniejący folder", exact: true })
          .tap();
        await expect(
          dialogOf(page).getByText("Wybierz folder projektu na tym serwerze.", {
            exact: false,
          }),
        ).toBeVisible();
        return geometry;
      },
      {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: !webkit,
      },
    );

    assert.deepEqual(errors, []);
    const failed = results.filter((result) => result.status === "fail");
    assert.deepEqual(failed, []);
  },
);
