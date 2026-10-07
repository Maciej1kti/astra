/** The daemon options of the `project-creation` suite: a scripted GitHub CLI. */
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Where the scripted account of a host keeps its repositories and switches. */
export const githubAccount = (temp) => join(temp, "github");

/**
 * The test double stands in for `gh`; its repositories are bare Git
 * directories under the host's own temporary directory, so pushes are real.
 */
export async function githubDaemonArgs({ temp, root }) {
  const account = githubAccount(temp);
  await mkdir(join(account, "remotes"), { recursive: true, mode: 0o700 });
  const gh = join(account, "gh");
  await copyFile(join(root, "crates/projectd/tests/fixtures/fake-gh.sh"), gh);
  await chmod(gh, 0o700);
  return [
    "--github",
    "--github-gh-bin",
    gh,
    "--github-remote-base",
    `file://${account}/remotes/`,
  ];
}
