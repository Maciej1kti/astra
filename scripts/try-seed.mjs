import { lstat, open } from "node:fs/promises";
import { dirname, join } from "node:path";

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return false;
  }
}

async function remember(marker) {
  const file = await open(marker, "wx", 0o600);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  const directory = await open(dirname(marker), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/** A marker outside .project preserves intentional removal across launches. */
export async function seedSampleProject(cli, project, marker) {
  if (await exists(marker)) return;
  if (await exists(join(project, ".project"))) {
    await remember(marker);
    return;
  }
  const plan = cli(
    "registration-plan",
    project,
    "--name",
    "Try Local Projects",
  );
  try {
    cli("register", plan.plan_id);
  } catch (error) {
    if (error.status !== 9) throw error;
  }
  const cards = cli("--project", project, "cards").items;
  if (!cards.length)
    for (const title of [
      "Try editing this card",
      "Plan a few dates",
      "Write a progress update",
    ])
      cli("--project", project, "card", "create", "--title", title);
  await remember(marker);
}
