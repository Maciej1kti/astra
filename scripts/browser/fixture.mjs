/** Small deterministic source fixture for editor, card, tag and planning regressions. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function seed(host) {
  const { temp, cli } = host;
  const commandFile = join(temp, "fixture-command.json");
  async function create(path, payload) {
    await writeFile(commandFile, JSON.stringify(payload), { mode: 0o600 });
    const result = cli("command", "POST", path, "--json-file", commandFile).result;
    return result.resource?.metadata ?? result;
  }
  const projects = [];
  for (const title of ["Studio launch — QA synthetic", "Personal lab — QA synthetic", "Empty project — QA synthetic"]) {
    const folder = join(temp, title);
    await mkdir(folder, { mode: 0o700 });
    const plan = cli("registration-plan", folder, "--name", title);
    cli("register", plan.plan_id);
    projects.push({ id: plan.project_id, title, folder });
  }
  const base = `/api/v1/projects/${projects[0].id}`;
  const milestones = [];
  for (const [title, date] of [["Prototype ready", "2026-09-11"], ["Public launch", "2026-09-21"]]) {
    milestones.push(await create(`${base}/milestones`, { title, due: { date, kind: "hard" } }));
  }
  const cards = [];
  const titles = ["Design system foundations", "Build onboarding flow", "Review accessibility", "Confirm launch scope", "Draft-loss probe", "History probe", "Conflict probe", "Archive probe", "Keyboard order probe", "Undated backlog idea", "Polish copy — Zażółć gęślą jaźń 🧪", "A long synthetic title exercises wrapping while keeping actions reachable"];
  for (let i = 0; i < 36; i++) {
    const payload = {
      title: titles[i] ?? `QA work package ${String(i + 1).padStart(2, "0")}`,
      status: ["planned", "active", "review", "done", "cancelled"][i % 5],
      priority: ["urgent", "high", "normal", "low"][i % 4],
      labels: i % 2 ? ["frontend", "qa"] : ["design", "launch"],
      body: `Synthetic fixture ${i + 1}.\n\nBody-only needle: nebula-${i + 1}.\n\n- [ ] Example item\n- [x] Complete item\n\n**Bold** and _emphasis_.`,
      ...(i % 6 !== 3 ? { schedule: { start: `2026-09-${String(7 + i % 15).padStart(2, "0")}`, end: `2026-09-${String(9 + i % 15).padStart(2, "0")}` } } : {}),
      ...(i % 3 === 0 ? { due: { date: "2026-09-07", kind: i % 2 ? "target" : "hard" } } : {}),
      ...(i % 7 === 0 ? { blocked: { reason: "Waiting for synthetic approval" } } : {}),
      ...(i % 8 === 0 ? { review_on: "2026-09-08" } : {}),
      ...(i === 1 || i === 2 ? { depends_on: [cards[i - 1].id] } : {}),
    };
    cards.push(await create(`${base}/cards`, payload));
  }
  const other = await create(`/api/v1/projects/${projects[1].id}/cards`, { title: "Separate project focus probe", status: "active" });
  for (const [kind, summary] of [["result", "Prototype tested on synthetic fixtures"], ["blocker", "Awaiting launch decision"], ["decision_needed", "Choose the launch date"], ["note", "Audit notes and observations"]]) {
    await create(`${base}/updates`, { kind, summary, author: { kind: "human", label: "Synthetic QA" }, target: { type: "project", id: projects[0].id }, body: "Synthetic content. No customer data." });
  }
  return { origin: host.origin, socket: host.socket, temp, root: host.root, projects,
    cards: cards.map(({ id, title }) => ({ id, title })), other: { id: other.id, title: other.title }, milestones };
}
