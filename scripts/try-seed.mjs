import { lstat } from "node:fs/promises";
import { join } from "node:path";

/** Existing metadata also marks an intentionally unregistered sample. */
export async function seedSampleProject(cli, project) {
  try {
    await lstat(join(project, ".project"));
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
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
}
