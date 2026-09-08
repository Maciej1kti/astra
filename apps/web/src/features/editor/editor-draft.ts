import type { Resource } from "../../lib/api/api";
import type {
  CardCreate,
  CardPatch,
  MilestoneCreate,
  MilestonePatch,
  ProjectPatch,
  UpdateCreate,
} from "../../lib/contracts/api.generated";
import type { AcceptanceItem } from "../cards/card-work";
import type { EditorTarget } from "./editor-target";

type Common = { title: string; body: string; advanced: string };
type DeadlineFields = { due: string; dueKind: "hard" | "target" };
export type CardFields = DeadlineFields & {
  status: NonNullable<CardCreate["status"]>;
  priority: NonNullable<CardCreate["priority"]>;
  kind: NonNullable<CardCreate["kind"]>;
  start: string;
  end: string;
  review: string;
  labels: string[];
  tagDraft: string;
  expectedResult: string;
  owner: string;
  acceptance: AcceptanceItem[];
  acceptanceDraft: string;
  archived: boolean;
  milestoneId: string;
  blockedReason: string;
  dependencies: string[];
};
export type ProjectFields = {
  status: "active" | "paused" | "archived";
  phase: string;
  review: string;
};
export type MilestoneFields = DeadlineFields & {
  status: NonNullable<MilestoneCreate["status"]>;
};
export type ReportFields = {
  kind: UpdateCreate["kind"];
  author: string;
  targetType: UpdateCreate["target"]["type"];
  targetId: string;
  resolves: string;
  supersedes: string;
};
type Draft<K extends Resource["type"], Fields> = {
  type: K;
  project: string;
  source: Extract<Resource, { type: K }> | null;
  common: Common;
  fields: Fields;
};
export type CardDraft = Draft<"card", CardFields>;
export type EditorDraft =
  | CardDraft
  | Draft<"project", ProjectFields>
  | Draft<"milestone", MilestoneFields>
  | Draft<"update", ReportFields>;

export function createEditorDraft(target: EditorTarget): EditorDraft {
  const common: Common = {
    title: "",
    body: target.resource?.body ?? "",
    advanced: "{}",
  };
  const project = target.project;
  switch (target.type) {
    case "card": {
      const m = target.resource?.metadata ?? target.initialMetadata;
      common.title = m?.title ?? "";
      return {
        type: "card",
        project,
        source: target.resource,
        common,
        fields: {
          status: m?.status ?? "planned",
          priority: m?.priority ?? "normal",
          kind: m?.kind ?? "outcome",
          start: m?.schedule?.start ?? "",
          end: m?.schedule?.end ?? "",
          due: m?.due?.date ?? "",
          dueKind: m?.due?.kind ?? "target",
          review: m?.review_on ?? "",
          labels: [...(m?.labels ?? [])],
          tagDraft: "",
          expectedResult: m?.expected_result ?? "",
          owner: m?.owner ?? "",
          acceptance: (m?.acceptance ?? []).map((item) => ({ ...item })),
          acceptanceDraft: "",
          archived: m?.archived ?? false,
          milestoneId: m?.milestone_id ?? "",
          blockedReason: m?.blocked?.reason ?? "",
          dependencies: [...(m?.depends_on ?? [])],
        },
      };
    }
    case "project": {
      const m = target.resource.metadata;
      common.title = m.name;
      return {
        type: "project",
        project,
        source: target.resource,
        common,
        fields: {
          status: m.state,
          phase: m.phase ?? "",
          review: m.review_on ?? "",
        },
      };
    }
    case "milestone": {
      const m = target.resource?.metadata ?? target.initialMetadata;
      common.title = m?.title ?? "";
      return {
        type: "milestone",
        project,
        source: target.resource,
        common,
        fields: {
          status: m?.status ?? "planned",
          due: m?.due?.date ?? "",
          dueKind: m?.due?.kind ?? "target",
        },
      };
    }
    case "update": {
      const m = target.resource?.metadata ?? target.initialMetadata;
      common.title = m?.summary ?? "";
      return {
        type: "update",
        project,
        source: target.resource,
        common,
        fields: {
          kind: m?.kind ?? "note",
          author: m?.author?.label ?? "Owner",
          targetType: m?.target?.type ?? "project",
          targetId: m?.target?.id ?? project,
          resolves: (m?.resolves ?? []).join(", "),
          supersedes: m?.supersedes ?? "",
        },
      };
    }
  }
}

/** Only owned editable fields participate in dirty checks and draft export. */
export function draftSnapshot(draft: EditorDraft): string {
  return JSON.stringify({ ...draft.common, ...draft.fields });
}
function additionalFields(source: string): Record<string, unknown> {
  const extra: unknown = JSON.parse(source);
  if (!extra || Array.isArray(extra) || typeof extra !== "object")
    throw new Error("Additional fields must be a JSON object.");
  return extra as Record<string, unknown>;
}
type PatchSet<T> = Extract<T, { set?: unknown }>;
/** Translate an owned, per-kind draft into an explicit create or set/clear patch. */
export function editorPayload(draft: EditorDraft) {
  const { title, body, advanced } = draft.common;
  const extra = additionalFields(advanced);
  switch (draft.type) {
    case "card": {
      const d = draft.fields;
      const metadata = draft.source?.metadata;
      const fields: CardCreate = {
        ...extra,
        body,
        title,
        status: d.status,
        priority: d.priority,
        kind: d.kind,
        archived: d.archived,
        labels: [...d.labels],
      };
      const clear: NonNullable<PatchSet<CardPatch>["clear"]> = [];
      if (d.expectedResult.trim()) fields.expected_result = d.expectedResult;
      else if (metadata?.expected_result !== undefined)
        clear.push("expected_result");
      if (d.owner.trim()) fields.owner = d.owner;
      else if (metadata?.owner !== undefined) clear.push("owner");
      if (d.acceptance.length)
        fields.acceptance = d.acceptance.map((item) => ({ ...item }));
      else if (metadata?.acceptance !== undefined) clear.push("acceptance");
      if (
        !draft.source ||
        JSON.stringify(d.dependencies) !==
          JSON.stringify(metadata?.depends_on ?? [])
      )
        fields.depends_on = [...d.dependencies];
      if (d.milestoneId) fields.milestone_id = d.milestoneId;
      else if (metadata?.milestone_id) clear.push("milestone_id");
      if (d.blockedReason.trim())
        fields.blocked = { reason: d.blockedReason.trim() };
      else if (metadata?.blocked) clear.push("blocked");
      if (d.start && d.end) fields.schedule = { start: d.start, end: d.end };
      else if (d.start || d.end)
        throw new Error("A schedule needs both start and end dates.");
      else if (metadata?.schedule) clear.push("schedule");
      if (d.due) fields.due = { date: d.due, kind: d.dueKind };
      else if (metadata?.due) clear.push("due");
      if (d.review) fields.review_on = d.review;
      else if (metadata?.review_on) clear.push("review_on");
      return draft.source
        ? ({
            set: fields,
            ...(clear.length ? { clear } : {}),
          } satisfies CardPatch)
        : fields;
    }
    case "project": {
      const fields: NonNullable<PatchSet<ProjectPatch>["set"]> = {
        ...extra,
        body,
        name: title,
        state: draft.fields.status,
      };
      const clear: NonNullable<PatchSet<ProjectPatch>["clear"]> = [];
      if (draft.fields.phase) fields.phase = draft.fields.phase;
      else if (draft.source?.metadata.phase) clear.push("phase");
      if (draft.fields.review) fields.review_on = draft.fields.review;
      else if (draft.source?.metadata.review_on) clear.push("review_on");
      return {
        set: fields,
        ...(clear.length ? { clear } : {}),
      } satisfies ProjectPatch;
    }
    case "milestone": {
      const fields: MilestoneCreate = {
        ...extra,
        body,
        title,
        status: draft.fields.status,
      };
      const clear: NonNullable<PatchSet<MilestonePatch>["clear"]> = [];
      if (draft.fields.due)
        fields.due = { date: draft.fields.due, kind: draft.fields.dueKind };
      else if (draft.source?.metadata.due) clear.push("due");
      return draft.source
        ? ({
            set: fields,
            ...(clear.length ? { clear } : {}),
          } satisfies MilestonePatch)
        : fields;
    }
    case "update": {
      const d = draft.fields;
      const fields: UpdateCreate = {
        ...extra,
        body,
        summary: title,
        kind: d.kind,
        author: { kind: "human", label: d.author },
        target: {
          type: d.targetType,
          id: d.targetType === "project" ? draft.project : d.targetId,
        },
      };
      // Advanced report targets are validated by the server along with evidence.
      if (extra.target !== undefined)
        return reportPayload({ ...fields, target: extra.target }, d);
      return reportPayload(fields, d);
    }
  }
}
function reportPayload(fields: Record<string, unknown>, draft: ReportFields) {
  if (draft.kind === "resolution")
    fields.resolves = draft.resolves
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  if (draft.kind === "correction") fields.supersedes = draft.supersedes.trim();
  return fields;
}
