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
    if (m.folder !== undefined) result.folder = m.folder;
  } else if (type === "update") {
    const m = resource.metadata as UpdateMetadata;
    result.title = m.summary;
    result.kind = m.kind;
    result.target = m.target;
    result.recorded_at = m.recorded_at;
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
    result.position = m.position;
    if (type === "card") {
      const card = m as CardMetadata;
      result.priority = card.priority;
      result.comment_count = card.comments?.length ?? 0;
      result.counter_count =
        card.counters?.filter((counter) => !counter.archived).length ?? 0;
      if (card.event !== undefined) result.event = card.event;
      if (card.schedule !== undefined) result.schedule = card.schedule;
      result.archived = card.archived;
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
