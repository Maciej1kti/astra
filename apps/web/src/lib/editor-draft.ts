import type { AcceptanceItem } from "./card-work";

export type EditorFields = {
  title: string;
  status: string;
  priority: string;
  kind: string;
  start: string;
  end: string;
  due: string;
  dueKind: string;
  review: string;
  body: string;
  labels: string[];
  expectedResult: string;
  owner: string;
  acceptance: AcceptanceItem[];
  advanced: string;
  author: string;
  phase: string;
  archived: boolean;
  milestoneId: string;
  blockedReason: string;
  dependencies: string[];
  targetType: string;
  targetId: string;
  resolves: string;
  supersedes: string;
};

/** Translate an owned draft into a create or explicit set/clear patch. */
export function editorPayload(
  type: string,
  project: string,
  existing: boolean,
  metadata: Record<string, unknown> | undefined,
  draft: EditorFields,
) {
  const {
    title,
    status,
    priority,
    kind,
    start,
    end,
    due,
    dueKind,
    review,
    body,
    labels,
    expectedResult,
    owner,
    acceptance,
    advanced,
    author,
    phase,
    archived,
    milestoneId,
    blockedReason,
    dependencies,
    targetType,
    targetId,
    resolves,
    supersedes,
  } = draft;
  const extra = JSON.parse(advanced);
  if (!extra || Array.isArray(extra) || typeof extra !== "object")
    throw new Error("Additional fields must be a JSON object.");
  const fields: Record<string, unknown> = { ...extra, body };
  const clear: string[] = [];
  if (type === "project") {
    fields.name = title;
    fields.state = status;
    if (phase) fields.phase = phase;
    else if (metadata?.phase) clear.push("phase");
  } else if (type === "update") {
    fields.summary = title;
    fields.kind = kind;
    fields.author = { kind: "human", label: author };
    fields.target = extra.target ?? {
      type: targetType,
      id: targetType === "project" ? project : targetId,
    };
    if (kind === "resolution")
      fields.resolves = resolves
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    if (kind === "correction") fields.supersedes = supersedes.trim();
  } else {
    fields.title = title;
    fields.status = status;
  }
  if (type === "card") {
    fields.archived = archived;
    if (expectedResult.trim()) fields.expected_result = expectedResult;
    else if (metadata?.expected_result !== undefined)
      clear.push("expected_result");
    if (owner.trim()) fields.owner = owner;
    else if (metadata?.owner !== undefined) clear.push("owner");
    if (acceptance.length)
      fields.acceptance = acceptance.map((item) => ({ ...item }));
    else if (metadata?.acceptance !== undefined) clear.push("acceptance");
    if (
      !existing ||
      JSON.stringify(dependencies) !==
        JSON.stringify(metadata?.depends_on ?? [])
    )
      fields.depends_on = dependencies;
    if (milestoneId) fields.milestone_id = milestoneId;
    else if (metadata?.milestone_id) clear.push("milestone_id");
    if (blockedReason.trim()) fields.blocked = { reason: blockedReason.trim() };
    else if (metadata?.blocked) clear.push("blocked");
    fields.priority = priority;
    fields.kind = kind;
    fields.labels = [...labels];
    if (start && end) fields.schedule = { start, end };
    else if (start || end)
      throw new Error("A schedule needs both start and end dates.");
    else if (metadata?.schedule) clear.push("schedule");
  }
  if (type === "card" || type === "milestone") {
    if (due) fields.due = { date: due, kind: dueKind };
    else if (metadata?.due) clear.push("due");
  }
  if (type === "card" || type === "project") {
    if (review) fields.review_on = review;
    else if (metadata?.review_on) clear.push("review_on");
  }
  return existing
    ? { set: fields, ...(clear.length ? { clear } : {}) }
    : fields;
}
