import type { Resource, Summary } from "../api/api";
import type {
  AcceptanceItem,
  CardMetadata,
  MilestoneMetadata,
  ProjectMetadata,
  UpdateMetadata,
} from "../contracts/domain.generated";

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
    if (type === "milestone") {
      const milestone = m as MilestoneMetadata;
      if (milestone.due !== undefined) result.due = milestone.due;
    }
    if (m.position !== undefined) result.position = m.position;
    if (type === "card") {
      const card = m as CardMetadata;
      result.priority = card.priority;
      if (card.schedule !== undefined) result.schedule = card.schedule;
      if (card.archived !== undefined) result.archived = card.archived;
      if (card.labels !== undefined) result.labels = [...card.labels];
      if (card.acceptance !== undefined)
        result.acceptance_progress = acceptanceProgress(card.acceptance);
    }
  }
  return result;
}

export function acceptanceProgress(items: AcceptanceItem[]) {
  return {
    total: items.length,
    completed: items.filter((item) => item.completed).length,
  };
}
