/* Generated from contracts/openapi.generated.json. Run npm run contracts. */

/**
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
/**
 * @maxItems 100
 */
export type Acceptance = AcceptanceItem[];
export type UpdateMetadata = {
  id: string;
  kind: "result" | "blocker" | "decision_needed" | "note" | "correction" | "resolution";
  target: Target;
  summary: string;
  author: Author;
  recorded_at: string;
  observed_at?: string;
  supersedes?: string;
  /**
   * @maxItems 100
   */
  resolves?: string[];
  /**
   * @maxItems 50
   */
  evidence?: (
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
      }
  )[];
  [k: string]:
    | ExtensionValue
    | string
    | "result"
    | "blocker"
    | "decision_needed"
    | "note"
    | "correction"
    | "resolution"
    | Target
    | Author
    | string[]
    | (
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
          }
      )[]
    | undefined;
};

export interface ApiContracts {
  Bootstrap: Bootstrap;
  Summary: Summary;
  CommandResponse: CommandResponse;
  CommandStatus: CommandStatus;
  Accepted: Accepted;
  TagSuggestions: TagSuggestions;
  Error: Error;
}
export interface Bootstrap {
  api_version: "1";
  build_id: string;
  instance_id: string;
  instance_name: string;
  command_epoch: string;
  server_time: string;
  timezone: string;
  locale: "pl" | "en";
  csrf_token: string;
  snapshot_cursor: string;
  /**
   * @maxItems 100
   */
  capabilities: string[];
}
export interface Summary {
  type: "project" | "card" | "milestone" | "update";
  project_id: string;
  id: string;
  title: string;
  version: string;
  status?: string;
  priority?: string;
  schedule?: Schedule;
  due?: Due;
  review_on?: string;
  archived?: boolean;
  position?: string;
  availability?: "ready" | "stale" | "invalid" | "unavailable" | "recovering";
  /**
   * @maxItems 100
   */
  warning_codes?: string[];
  phase?: string;
  kind?: string;
  recorded_at?: string;
  author?: Author;
  target?: Target;
  blocked?: Blocked;
  /**
   * @maxItems 20
   */
  labels?: string[];
  milestone_id?: string;
  owner?: string;
  acceptance_progress?: AcceptanceProgress;
  read?: boolean;
}
export interface Schedule {
  start: string;
  end: string;
}
export interface Due {
  date: string;
  kind: "hard" | "target";
}
export interface Author {
  kind: "human" | "agent";
  label: string;
  session_id?: string;
}
export interface Target {
  type: "project" | "card" | "milestone";
  id: string;
}
export interface Blocked {
  reason: string;
}
export interface AcceptanceProgress {
  total: number;
  completed: number;
}
export interface CommandResponse {
  api_version: "1";
  request_id: string;
  status: "committed" | "noop";
  result: ResourceResult;
  /**
   * @maxItems 100
   */
  warnings: Warning[];
  replayed: boolean;
}
export interface ResourceResult {
  type:
    | "project"
    | "card"
    | "milestone"
    | "update"
    | "focus"
    | "preferences"
    | "tags"
    | "registration"
    | "receipt"
    | "normalization"
    | "job";
  id?: string;
  version?: string;
  resource?: ProjectResource | CardResource | MilestoneResource | UpdateResource;
  job_id?: string;
}
export interface ProjectResource {
  type: "project";
  metadata: ProjectMetadata;
  body: string;
  version: string;
}
export interface ProjectMetadata {
  id: string;
  created_at: string;
  updated_at: string;
  schema_version: 1;
  name: string;
  state: "active" | "paused" | "archived";
  phase?: string;
  review_on?: string;
  [k: string]: ExtensionValue | string | 1 | "active" | "paused" | "archived" | undefined;
}
export interface CardResource {
  type: "card";
  metadata: CardMetadata;
  body: string;
  version: string;
}
export interface CardMetadata {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  kind: "outcome" | "decision";
  status: "planned" | "active" | "review" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  position: string;
  archived: boolean;
  schedule?: Schedule;
  due?: Due;
  review_on?: string;
  milestone_id?: string;
  blocked?: Blocked;
  /**
   * @maxItems 100
   */
  depends_on?: string[];
  expected_result?: string;
  owner?: string;
  acceptance?: Acceptance;
  /**
   * @maxItems 20
   */
  labels?: string[];
  [k: string]:
    | ExtensionValue
    | string
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
    | string[]
    | Acceptance
    | undefined;
}
export interface AcceptanceItem {
  id: string;
  text: string;
  completed: boolean;
}
export interface MilestoneResource {
  type: "milestone";
  metadata: MilestoneMetadata;
  body: string;
  version: string;
}
export interface MilestoneMetadata {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  status: "planned" | "active" | "achieved" | "cancelled";
  position: string;
  archived: boolean;
  due?: Due;
  [k: string]: ExtensionValue | string | "planned" | "active" | "achieved" | "cancelled" | boolean | Due | undefined;
}
export interface UpdateResource {
  type: "update";
  metadata: UpdateMetadata;
  body: string;
  version: string;
  read?: boolean;
}
export interface Warning {
  code: string;
  message: string;
  field?: string;
}
export interface CommandStatus {
  api_version: "1";
  request_id: string;
  state: "prepared" | "committed" | "rejected" | "needs_review" | "blocked";
  result?: CommandResponse;
  error?: Error;
}
export interface Error {
  api_version: "1";
  error: {
    code: string;
    message: string;
    request_id?: string;
    details?: {
      [k: string]: unknown;
    };
  };
}
export interface Accepted {
  api_version: "1";
  request_id: string;
  job_id: string;
  status: "running";
}
export interface TagSuggestions {
  /**
   * @maxItems 10000
   */
  names: string[];
  complete: boolean;
  freshness: "index_snapshot" | "stale";
  snapshot_cursor: string;
  warnings: Warning[];
}
