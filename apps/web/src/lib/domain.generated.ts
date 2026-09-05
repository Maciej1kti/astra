/* Generated from contracts/domain.schema.json. Run npm run contracts. Types do not replace server validation. */

/**
 * Walidacja sparsowanych dokumentów; reguły domenowe i limity bajtów są osobne.
 */
export type LocalProjectsFileContract1 =
  ProjectDocument | CardDocument | MilestoneDocument | UpdateDocument | Workspace;
export type UUID = string;
export type Instant = string;
export type LocalDate = string;
/**
 * Ograniczone JSON values; poza schema: max depth 12, 10000 nodes, brak niebezpiecznych kluczy prototypu w obiektach JS.
 *
 * This interface was referenced by `ProjectMetadata`'s JSON-Schema definition
 * via the `patternProperty` "^x-[a-z0-9][a-z0-9_.-]{0,62}$".
 *
 * This interface was referenced by `CardMetadata`'s JSON-Schema definition
 * via the `patternProperty` "^x-[a-z0-9][a-z0-9_.-]{0,62}$".
 *
 * This interface was referenced by `MilestoneMetadata`'s JSON-Schema definition
 * via the `patternProperty` "^x-[a-z0-9][a-z0-9_.-]{0,62}$".
 *
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^x-[a-z0-9][a-z0-9_.-]{0,62}$".
 */
export type ExtensionValue =
  | string
  | number
  | boolean
  | null
  | unknown[]
  | {
      [k: string]: unknown;
    };
export type Position = string;
export type UpdateMetadata = {
  id: UUID;
  kind: "result" | "blocker" | "decision_needed" | "note" | "correction" | "resolution";
  target: Target;
  summary: string;
  author: Author;
  recorded_at: Instant;
  observed_at?: Instant;
  supersedes?: UUID;
  /**
   * @maxItems 100
   */
  resolves?: UUID[];
  /**
   * @maxItems 50
   */
  evidence?: Evidence[];
  [k: string]:
    | ExtensionValue
    | UUID
    | "result"
    | "blocker"
    | "decision_needed"
    | "note"
    | "correction"
    | "resolution"
    | Target
    | Author
    | UUID[]
    | Evidence[]
    | undefined;
};
export type Evidence =
  | {
      type: "url";
      value: string;
      label?: string;
    }
  | {
      type: "commit";
      value: string;
      label?: string;
    }
  | {
      type: "path";
      value: string;
      label?: string;
    };

export interface ProjectDocument {
  type: "project";
  metadata: ProjectMetadata;
  body: string;
}
export interface ProjectMetadata {
  id: UUID;
  created_at: Instant;
  updated_at: Instant;
  schema_version: 1;
  name: string;
  state: "active" | "paused" | "archived";
  phase?: string;
  review_on?: LocalDate;
  [k: string]: ExtensionValue | UUID | 1 | "active" | "paused" | "archived" | undefined;
}
export interface CardDocument {
  type: "card";
  metadata: CardMetadata;
  body: string;
}
export interface CardMetadata {
  id: UUID;
  created_at: Instant;
  updated_at: Instant;
  title: string;
  kind: "outcome" | "decision";
  status: "planned" | "active" | "review" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  position: Position;
  archived: boolean;
  schedule?: Schedule;
  due?: Due;
  review_on?: LocalDate;
  milestone_id?: UUID;
  blocked?: Blocked;
  /**
   * @maxItems 100
   */
  depends_on?: UUID[];
  /**
   * @maxItems 20
   */
  labels?:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
  [k: string]:
    | ExtensionValue
    | UUID
    | "outcome"
    | "decision"
    | "planned"
    | "active"
    | "review"
    | "done"
    | "cancelled"
    | "low"
    | "normal"
    | "high"
    | "urgent"
    | boolean
    | Schedule
    | Due
    | Blocked
    | UUID[]
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | undefined;
}
export interface Schedule {
  start: LocalDate;
  end: LocalDate;
}
export interface Due {
  date: LocalDate;
  kind: "hard" | "target";
}
export interface Blocked {
  reason: string;
}
export interface MilestoneDocument {
  type: "milestone";
  metadata: MilestoneMetadata;
  body: string;
}
export interface MilestoneMetadata {
  id: UUID;
  created_at: Instant;
  updated_at: Instant;
  title: string;
  status: "planned" | "active" | "achieved" | "cancelled";
  position: Position;
  archived: boolean;
  due?: Due;
  [k: string]: ExtensionValue | UUID | "planned" | "active" | "achieved" | "cancelled" | boolean | Due | undefined;
}
export interface UpdateDocument {
  type: "update";
  metadata: UpdateMetadata;
  body: string;
}
export interface Target {
  type: "project" | "card" | "milestone";
  id: UUID;
}
export interface Author {
  kind: "human" | "agent";
  label: string;
  session_id?: string;
}
export interface Workspace {
  format_version: 1;
  instance_id: UUID;
  timezone: string;
  locale: "pl" | "en";
  /**
   * @maxItems 10000
   */
  projects: ProjectRegistration[];
  /**
   * @maxItems 100
   */
  focus: FocusRef[];
  preferences: Preferences;
}
export interface ProjectRegistration {
  project_id: UUID;
  path: string;
  added_at: Instant;
}
export interface FocusRef {
  project_id: UUID;
  card_id: UUID;
}
export interface Preferences {
  week_start?: "monday" | "sunday";
  default_view?: "focus" | "projects" | "board" | "calendar" | "gantt" | "list" | "updates";
}
