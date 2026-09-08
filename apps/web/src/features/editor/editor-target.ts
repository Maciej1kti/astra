import type { Resource } from "../../lib/api/api";
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
  };
}[Resource["type"]];
type New<K extends string, Input> = {
  project: string;
  type: K;
  resource: null;
  initialMetadata?: Partial<Input>;
  autoCreate?: boolean;
};
export type EditorTarget =
  | Existing
  | New<"card", CardCreate>
  | New<"milestone", MilestoneCreate>
  | New<"update", UpdateCreate>;
export type CreateType = Exclude<Resource["type"], "project">;

export function editTarget(project: string, resource: Resource): EditorTarget {
  switch (resource.type) {
    case "project":
      return { project, type: resource.type, resource };
    case "card":
      return { project, type: resource.type, resource };
    case "milestone":
      return { project, type: resource.type, resource };
    case "update":
      return { project, type: resource.type, resource };
  }
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
