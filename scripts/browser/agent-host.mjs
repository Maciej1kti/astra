/** The daemon options of the `agent` suite: an agent directory and a scripted provider. */
import { access, constants, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * The test double stands in for both provider commands. The short timeout lets
 * a run that is left sleeping end as `timed_out` within the suite's time.
 */
export async function agentDaemonArgs({ temp, root }) {
  const double = join(root, "crates/projectd/tests/fixtures/fake-agent.sh");
  try {
    await access(double, constants.X_OK);
  } catch (cause) {
    throw new Error(
      `The scripted agent ${double} must exist and be executable.`,
      {
        cause,
      },
    );
  }
  const directory = join(temp, "agent-directory");
  await mkdir(directory, { mode: 0o700 });
  await copyFile(join(root, "agent/AGENTS.md"), join(directory, "AGENTS.md"));
  return [
    "--agent-dir",
    directory,
    "--agent-claude-bin",
    double,
    "--agent-codex-bin",
    double,
    "--agent-timeout",
    "8",
  ];
}
