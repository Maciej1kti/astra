import type { Resource } from "../../lib/api/api";
import type { EditorOpening } from "./editor-opening";
import type {
  CardCreate,
  MilestoneCreate,
  UpdateCreate,
} from "../../lib/contracts/api.generated";

type Existing = {
  [K in Resource["type"]]: {
    project: string;
    type: K;
    resource: Extract<Resource, { type: K }>;
    initialMetadata?: never;
    autoCreate?: false;
    opening?: EditorOpening;
  };
}[Resource["type"]];
type New<K extends string, Input> = {
  project: string;
  type: K;
  resource: null;
  initialMetadata?: Partial<Input>;
  autoCreate?: boolean;
  opening?: never;
};
export type EditorTarget =
  | Existing
  | New<"card", CardCreate>
  | New<"milestone", MilestoneCreate>
  | New<"update", UpdateCreate>;
export type CreateType = Exclude<Resource["type"], "project">;

export function editTarget(
  project: string,
  resource: Resource,
  opening?: EditorOpening,
): EditorTarget {
  switch (resource.type) {
    case "project":
      return { project, type: resource.type, resource, opening };
    case "card":
      return { project, type: resource.type, resource, opening };
    case "milestone":
      return { project, type: resource.type, resource, opening };
    case "update":
      return { project, type: resource.type, resource, opening };
  }
}

export function resolutionTarget(
  project: string,
  decision: Extract<Resource, { type: "update" }>,
): EditorTarget {
  return {
    project,
    type: "update",
    resource: null,
    initialMetadata: {
      kind: "resolution",
      summary: `Resolved: ${decision.metadata.summary}`.slice(0, 500),
      target: decision.metadata.target,
      resolves: [decision.metadata.id],
    },
  };
}

export function createTarget(
  project: string,
  type: CreateType,
  initialMetadata: Partial<CardCreate> = {},
  autoCreate = false,
): EditorTarget {
  switch (type) {
    case "card":
      return { project, type, resource: null, initialMetadata, autoCreate };
    case "milestone":
      return { project, type, resource: null };
    case "update":
      return { project, type, resource: null };
  }
}
