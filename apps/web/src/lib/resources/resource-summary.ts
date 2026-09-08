import type { Resource, Summary } from "../api/api";
import type {
  CardMetadata,
  MilestoneMetadata,
  ProjectMetadata,
  UpdateMetadata,
} from "../contracts/domain.generated";
import { acceptanceProgress } from "../../features/cards/card-work.ts";

/** Project only summary fields; do not retain bodies, extensions or edit state. */
export function detailSummary(
  resource: Resource,
  project: string,
  type: Summary["type"],
): Summary {
  const result: Summary = {
    id: resource.metadata.id,
    project_id: project,
    type,
    title: "",
    version: resource.version,
    availability: "ready",
  };
  if (type === "project") {
    const m = resource.metadata as ProjectMetadata;
    result.title = m.name;
    result.status = m.state;
    if (m.review_on !== undefined) result.review_on = m.review_on;
  } else if (type === "update") {
    const m = resource.metadata as UpdateMetadata;
    result.title = m.summary;
    result.kind = m.kind;
    result.target = m.target;
    if (m.recorded_at !== undefined) result.recorded_at = m.recorded_at;
    if (resource.type === "update" && resource.read !== undefined)
      result.read = resource.read;
  } else {
    const m = resource.metadata as CardMetadata | MilestoneMetadata;
    result.title = m.title;
    result.status = m.status;
    if (m.due !== undefined) result.due = m.due;
    if (m.position !== undefined) result.position = m.position;
    if (type === "card") {
      const card = m as CardMetadata;
      result.priority = card.priority;
      result.kind = card.kind;
      if (card.schedule !== undefined) result.schedule = card.schedule;
      if (card.review_on !== undefined) result.review_on = card.review_on;
      if (card.archived !== undefined) result.archived = card.archived;
      if (card.blocked !== undefined) result.blocked = card.blocked;
      if (card.labels !== undefined) result.labels = [...card.labels];
      if (card.owner !== undefined) result.owner = card.owner;
      if (card.acceptance !== undefined)
        result.acceptance_progress = acceptanceProgress(card.acceptance);
    }
  }
  return result;
}
