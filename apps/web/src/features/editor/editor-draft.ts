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

import { eventEnd } from "../../lib/resources/timed-event.ts";

type Common = { title: string; body: string };
type EditableCommon = Common & { advanced: string };
export type CardFields = {
  status: NonNullable<CardCreate["status"]>;
  priority: NonNullable<CardCreate["priority"]>;
  start: string;
  end: string;
  time: string;
  duration: number;
  labels: string[];
  tagDraft: string;
  acceptance: AcceptanceItem[];
  acceptanceDraft: string;
  commentDraft: string;
  archived: boolean;
};
export type ProjectFields = {
  folder: string;
  folderDraft: string;
  status: "active" | "paused" | "archived";
};
export type MilestoneFields = {
  due: string;
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
type Draft<
  K extends Resource["type"],
  Fields,
  C extends Common = EditableCommon,
> = {
  type: K;
  project: string;
  source: Extract<Resource, { type: K }> | null;
  common: C;
  fields: Fields;
};
export type CardDraft = Draft<"card", CardFields, Common>;
export type EditorDraft =
  | CardDraft
  | Draft<"project", ProjectFields, Common>
  | Draft<"milestone", MilestoneFields, EditableCommon>
  | Draft<"update", ReportFields, EditableCommon>;

export function createEditorDraft(target: EditorTarget): EditorDraft {
  const common: Common = {
    title: "",
    body: target.resource?.body ?? "",
  };
  const editableCommon = () => ({ ...common, advanced: "{}" });
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
          start: m?.event?.start.slice(0, 10) ?? m?.schedule?.start ?? "",
          end: m?.schedule?.end ?? m?.event?.start.slice(0, 10) ?? "",
          time: m?.event?.start.slice(11) ?? "",
          duration: m?.event?.duration_minutes ?? 60,
          labels: [...(m?.labels ?? [])],
          tagDraft: "",
          acceptance: (m?.acceptance ?? []).map((item) => ({ ...item })),
          acceptanceDraft: "",
          commentDraft: "",
          archived: m?.archived ?? false,
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
          folder: m.folder ?? "",
          folderDraft: "",
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
        common: editableCommon(),
        fields: {
          status: m?.status ?? "planned",
          due: m?.due?.date ?? "",
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
        common: editableCommon(),
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
/** Snapshot of persisted fields; unfinished picker/checklist entries stay local. */
export function autosaveSnapshot(draft: EditorDraft): string {
  const value = JSON.parse(draftSnapshot(draft)) as Record<string, unknown>;
  delete value.tagDraft;
  delete value.folderDraft;
  delete value.acceptanceDraft;
  delete value.commentDraft;
  return JSON.stringify(value);
}
/** Detach a draft from Svelte's reactive proxy before queueing it. */
export function detachedEditorDraft(draft: EditorDraft): EditorDraft {
  return JSON.parse(JSON.stringify(draft)) as EditorDraft;
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
  const { title, body } = draft.common;
  const extra =
    draft.type === "milestone" || draft.type === "update"
      ? additionalFields(draft.common.advanced)
      : {};
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
        archived: d.archived,
        labels: [...d.labels],
      };
      const clear: NonNullable<PatchSet<CardPatch>["clear"]> = [];
      if (d.acceptance.length)
        fields.acceptance = d.acceptance.map((item) => ({ ...item }));
      else if (metadata?.acceptance !== undefined) clear.push("acceptance");
      if (d.time) {
        fields.event = {
          start: `${d.start}T${d.time}`,
          duration_minutes: d.duration,
        };
        eventEnd(fields.event);
        if (metadata?.schedule) clear.push("schedule");
      } else {
        if (d.start && d.end) fields.schedule = { start: d.start, end: d.end };
        else if (d.start || d.end)
          throw new Error("A schedule needs both start and end dates.");
        else if (metadata?.schedule) clear.push("schedule");
        if (metadata?.event) clear.push("event");
      }
      return draft.source
        ? ({
            set: fields,
            ...(clear.length ? { clear } : {}),
          } satisfies CardPatch)
        : fields;
    }
    case "project": {
      const fields: NonNullable<PatchSet<ProjectPatch>["set"]> = {
        body,
        name: title,
        state: draft.fields.status,
      };
      const folder = draft.fields.folder.trim();
      if (folder) fields.folder = folder;
      return {
        set: fields,
        ...(!folder && draft.source?.metadata.folder
          ? { clear: ["folder"] as ["folder"] }
          : {}),
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
      if (draft.fields.due) fields.due = { date: draft.fields.due };
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
