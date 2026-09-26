/* Generated from contracts/domain.schema.json. Run npm run contracts. Types do not replace server validation. */

/**
 * Canonical JSON project sources use the shared type, metadata, body envelope. Markdown content is stored as string values; source location and type must match.
 */
export type LocalProjectsFileContract1 =
  ProjectDocument | CardDocument | MilestoneDocument | UpdateDocument | Workspace;
export type UUID = string;
export type Instant = string;
export type Position = string;
export type LocalDate = string;
export type LocalDateTime = string;
/**
 * @maxItems 20
 */
export type CardCounters =
  | []
  | [CardCounter]
  | [CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter, CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter]
  | [CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter, CardCounter]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ]
  | [
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter,
      CardCounter
    ];
export type CounterValue = number;
/**
 * Ograniczone JSON values; poza schema: max depth 12, 10000 nodes, brak niebezpiecznych kluczy prototypu w obiektach JS.
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
export type UpdateMetadata = {
  id: UUID;
  kind: "result" | "blocker" | "decision_needed" | "note" | "correction" | "resolution";
  target: ReportTarget;
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
    | ReportTarget
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
  folder?: string;
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
  status: "planned" | "active" | "review" | "done" | "cancelled";
  priority: "normal" | "high";
  position: Position;
  archived: boolean;
  pinned?: boolean;
  schedule?: Schedule;
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
  /**
   * Ordered acceptance items with unique stable IDs. Completion does not change card status.
   *
   * @maxItems 100
   */
  acceptance?: AcceptanceItem[];
  event?: TimedEvent;
  /**
   * @maxItems 200
   */
  comments?: CardComment[];
  counters?: CardCounters;
}
export interface Schedule {
  start: LocalDate;
  end: LocalDate;
}
export interface AcceptanceItem {
  id: UUID;
  text: string;
  completed: boolean;
}
export interface TimedEvent {
  start: LocalDateTime;
  duration_minutes: number;
}
export interface CardComment {
  id: UUID;
  author: Author;
  recorded_at: Instant;
  body: string;
}
export interface Author {
  kind: "human" | "agent";
  label: string;
  session_id?: string;
}
export interface CardCounter {
  id: UUID;
  name: string;
  unit: string;
  step: number;
  archived: boolean;
  values: CounterValues;
}
export interface CounterValues {
  [k: string]: CounterValue;
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
export interface Due {
  date: LocalDate;
}
export interface UpdateDocument {
  type: "update";
  metadata: UpdateMetadata;
  body: string;
}
export interface ReportTarget {
  type: "project" | "milestone";
  id: UUID;
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
  /**
   * Optional workspace tag names. Card label strings remain their source of truth.
   *
   * @maxItems 500
   */
  tags?: string[];
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
