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
export type UpdateCreate = {
  kind: "result" | "blocker" | "decision_needed" | "note" | "correction" | "resolution";
  target: Target;
  summary: string;
  author: Author;
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
  id?: string;
  body?: string;
  [k: string]:
    | ExtensionValue
    | "result"
    | "blocker"
    | "decision_needed"
    | "note"
    | "correction"
    | "resolution"
    | Target
    | string
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
  UUID: string;
  RequestID: string;
  LocalDate: string;
  Instant: string;
  Version: string;
  Position: string;
  ExtensionValue: ExtensionValue;
  Schedule: Schedule;
  Due: Due;
  Blocked: Blocked;
  Author: Author;
  Target: Target;
  Evidence:
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
  ProjectMetadata: ProjectMetadata;
  AcceptanceItem: AcceptanceItem;
  ExpectedResult: string;
  CardOwner: string;
  Acceptance: Acceptance;
  AcceptanceProgress: AcceptanceProgress;
  CardMetadata: CardMetadata;
  MilestoneMetadata: MilestoneMetadata;
  UpdateMetadata: UpdateMetadata;
  ProjectDocument: ProjectDocument;
  CardDocument: CardDocument;
  MilestoneDocument: MilestoneDocument;
  UpdateDocument: UpdateDocument;
  FocusRef: FocusRef;
  ProjectRegistration: ProjectRegistration;
  Preferences: Preferences;
  Workspace: Workspace;
  ProjectResource: ProjectResource;
  CardResource: CardResource;
  MilestoneResource: MilestoneResource;
  UpdateResource: UpdateResource;
  Placement: Placement;
  ProjectPatch:
    | {
        set?: {
          name?: string;
          state?: "active" | "paused" | "archived";
          phase?: string;
          review_on?: string;
          body?: string;
        };
        /**
         * @maxItems 20
         */
        clear?: ("phase" | "review_on")[];
      }
    | {
        undo: {
          history_entry_id: string;
        };
      };
  CardPatch:
    | {
        set?: {
          title?: string;
          kind?: "outcome" | "decision";
          status?: "planned" | "active" | "review" | "done" | "cancelled";
          priority?: "low" | "normal" | "high" | "urgent";
          archived?: boolean;
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
          body?: string;
        };
        /**
         * @maxItems 20
         */
        clear?: (
          | "schedule"
          | "due"
          | "review_on"
          | "milestone_id"
          | "blocked"
          | "depends_on"
          | "labels"
          | "expected_result"
          | "owner"
          | "acceptance"
        )[];
        placement?: Placement;
      }
    | {
        undo: {
          history_entry_id: string;
        };
      };
  CardCreate: CardCreate;
  MilestonePatch:
    | {
        set?: {
          title?: string;
          status?: "planned" | "active" | "achieved" | "cancelled";
          archived?: boolean;
          due?: Due;
          body?: string;
        };
        /**
         * @maxItems 20
         */
        clear?: "due"[];
      }
    | {
        undo: {
          history_entry_id: string;
        };
      };
  MilestoneCreate: MilestoneCreate;
  UpdateCreate: UpdateCreate;
  Error: Error;
  Warning: Warning;
  ResourceResult: ResourceResult;
  CommandResponse: CommandResponse;
  CommandStatus: CommandStatus;
  Accepted: Accepted;
  PageMeta: PageMeta;
  Summary: Summary;
  SummaryPage: SummaryPage;
  CalendarItem: CalendarItem;
  CalendarPage: CalendarPage;
  BoardView: BoardView;
  GanttEdge: GanttEdge;
  TimelineAnalysis: TimelineAnalysis;
  TimelineForecast: TimelineForecast;
  GanttPage: GanttPage;
  FocusResource: FocusResource;
  FocusReplace: FocusReplace;
  TagName: string;
  TagsReplace: TagsReplace;
  TagIssue: TagIssue;
  TagUsageProject: TagUsageProject;
  CatalogTag: CatalogTag;
  TagSuggestions: TagSuggestions;
  TagCatalog: TagCatalog;
  TagPreviewRequest: TagPreviewRequest;
  TagChange: TagChange;
  TagPreview: TagPreview;
  PreferencesResource: PreferencesResource;
  PreferencesPatch: PreferencesPatch;
  Bootstrap: Bootstrap;
  RegistrationPlanInput: RegistrationPlanInput;
  RegistrationPlan: RegistrationPlan;
  RegistrationCommit: RegistrationCommit;
  Root: Root;
  DirectoryPage: DirectoryPage;
  AttentionItem: AttentionItem;
  AttentionPage: AttentionPage;
  Context: Context;
  PairingCreate: PairingCreate;
  Pairing: Pairing;
  Session: Session;
  HistoryEntry: HistoryEntry;
  HistoryPage: HistoryPage;
  Job: Job;
  Diagnostics: Diagnostics;
  ReceiptInput: ReceiptInput;
  ReceiptsInput: ReceiptsInput;
  Event: Event;
  Health: Health;
  PairingPage: PairingPage;
  Sessions: Sessions;
  Roots: Roots;
  RegistrationResource: RegistrationResource;
  ContextEntry: ContextEntry;
  EventTarget: EventTarget;
  SourceValidation: SourceValidation;
  GitObservation: GitObservation;
  NativeFolderInput: NativeFolderInput;
  NativeFolderSelection: NativeFolderSelection;
}
export interface Schedule {
  start: string;
  end: string;
}
export interface Due {
  date: string;
  kind: "hard" | "target";
}
export interface Blocked {
  reason: string;
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
export interface AcceptanceItem {
  id: string;
  text: string;
  completed: boolean;
}
export interface AcceptanceProgress {
  total: number;
  completed: number;
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
export interface ProjectDocument {
  type: "project";
  metadata: ProjectMetadata;
  body: string;
}
export interface CardDocument {
  type: "card";
  metadata: CardMetadata;
  body: string;
}
export interface MilestoneDocument {
  type: "milestone";
  metadata: MilestoneMetadata;
  body: string;
}
export interface UpdateDocument {
  type: "update";
  metadata: UpdateMetadata;
  body: string;
}
export interface FocusRef {
  project_id: string;
  card_id: string;
}
export interface ProjectRegistration {
  project_id: string;
  path: string;
  added_at: string;
}
export interface Preferences {
  week_start?: "monday" | "sunday";
  default_view?: "focus" | "projects" | "board" | "calendar" | "gantt" | "list" | "updates";
}
export interface Workspace {
  format_version: 1;
  instance_id: string;
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
  /**
   * @maxItems 500
   */
  tags?: string[];
  preferences: Preferences;
}
export interface ProjectResource {
  type: "project";
  metadata: ProjectMetadata;
  body: string;
  version: string;
}
export interface CardResource {
  type: "card";
  metadata: CardMetadata;
  body: string;
  version: string;
}
export interface MilestoneResource {
  type: "milestone";
  metadata: MilestoneMetadata;
  body: string;
  version: string;
}
export interface UpdateResource {
  type: "update";
  metadata: UpdateMetadata;
  body: string;
  version: string;
  read?: boolean;
}
export interface Placement {
  after_id: string | null;
  before_id: string | null;
}
export interface CardCreate {
  title: string;
  kind?: "outcome" | "decision";
  status?: "planned" | "active" | "review" | "done" | "cancelled";
  priority?: "low" | "normal" | "high" | "urgent";
  archived?: boolean;
  schedule?: Schedule;
  due?: Due;
  review_on?: string;
  milestone_id?: string;
  blocked?: Blocked;
  /**
   * @maxItems 100
   */
  depends_on?: string[];
  /**
   * @maxItems 20
   */
  labels?: string[];
  expected_result?: string;
  owner?: string;
  acceptance?: Acceptance;
  body?: string;
  id?: string;
}
export interface MilestoneCreate {
  title: string;
  status?: "planned" | "active" | "achieved" | "cancelled";
  archived?: boolean;
  due?: Due;
  body?: string;
  id?: string;
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
export interface Warning {
  code: string;
  message: string;
  field?: string;
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
export interface CommandStatus {
  api_version: "1";
  request_id: string;
  state: "prepared" | "committed" | "rejected" | "needs_review" | "blocked";
  result?: CommandResponse;
  error?: Error;
}
export interface Accepted {
  api_version: "1";
  request_id: string;
  job_id: string;
  status: "running";
}
export interface PageMeta {
  next_cursor: string | null;
  snapshot_cursor: string;
  has_more: boolean;
  freshness: "verified" | "index_snapshot" | "stale" | "degraded";
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
export interface SummaryPage {
  /**
   * @maxItems 1000
   */
  items: Summary[];
  page: PageMeta;
  /**
   * @maxItems 100
   */
  warnings: Warning[];
  minItems?: 0;
}
export interface CalendarItem {
  item_id: string;
  kind: "card_schedule" | "card_due" | "card_review" | "milestone_due" | "project_review";
  project_id: string;
  resource_id: string;
  version: string;
  title: string;
  start: string;
  end: string;
  due_kind?: "hard" | "target";
}
export interface CalendarPage {
  /**
   * @maxItems 1000
   */
  items: CalendarItem[];
  page: PageMeta;
  /**
   * @maxItems 100
   */
  warnings: Warning[];
  minItems?: 0;
}
export interface BoardView {
  /**
   * @maxItems 5
   */
  columns: {
    status: "planned" | "active" | "review" | "done" | "cancelled";
    /**
     * @maxItems 200
     */
    items: Summary[];
    page: PageMeta;
    total: number;
  }[];
  snapshot_cursor: string;
  /**
   * @maxItems 100
   */
  warnings: Warning[];
}
export interface GanttEdge {
  from: string;
  to: string;
  kind: "finish_to_start";
  outside_page: boolean;
  warning: string | null;
}
export interface TimelineAnalysis {
  planned_start: string | null;
  planned_end: string | null;
  forecast_end: string | null;
  delay_days: number;
  scheduled_cards: number;
  unscheduled_cards: number;
  unresolved_cards: number;
  complete: boolean;
  /**
   * @maxItems 10000
   */
  driving_path: string[];
}
export interface TimelineForecast {
  id: string;
  schedule: Schedule;
  delay_days: number;
  drives_finish: boolean;
}
export interface GanttPage {
  analysis: TimelineAnalysis;
  /**
   * @maxItems 500
   */
  forecasts: TimelineForecast[];
  /**
   * @maxItems 500
   */
  rows: Summary[];
  /**
   * @maxItems 50000
   */
  edges: GanttEdge[];
  page: PageMeta;
  /**
   * @maxItems 100
   */
  warnings: Warning[];
}
export interface FocusResource {
  /**
   * @maxItems 100
   */
  items: FocusRef[];
  version: string;
  minItems?: 0;
}
export interface FocusReplace {
  /**
   * @maxItems 100
   */
  items: FocusRef[];
  minItems?: 0;
}
export interface TagsReplace {
  /**
   * @maxItems 500
   */
  tags: string[];
}
export interface TagIssue {
  project_id?: string;
  card_id?: string;
  message: string;
}
export interface TagUsageProject {
  project_id: string;
  project_name: string;
  count: number;
}
export interface CatalogTag {
  name: string;
  managed: boolean;
  usage: number;
  projects: TagUsageProject[];
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
export interface TagCatalog {
  version: string;
  tags: CatalogTag[];
  complete: boolean;
  issues: TagIssue[];
}
export interface TagPreviewRequest {
  source: string;
  target: string;
}
export interface TagChange {
  project_id: string;
  project_name: string;
  card_id: string;
  title: string;
  version: string;
  /**
   * @maxItems 20
   */
  labels: string[];
}
export interface TagPreview {
  version: string;
  source: string;
  target: string;
  /**
   * @maxItems 500
   */
  changes: TagChange[];
  complete: boolean;
  issues: TagIssue[];
}
export interface PreferencesResource {
  timezone: string;
  locale: "pl" | "en";
  preferences: Preferences;
  version: string;
}
export interface PreferencesPatch {
  timezone?: string;
  locale?: "pl" | "en";
  preferences?: Preferences;
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
export interface RegistrationPlanInput {
  root_id: string;
  relative_path: string;
  name?: string;
  git_mode?: "private" | "tracked";
}
export interface RegistrationPlan {
  plan_id: string;
  project_id: string;
  expires_at: string;
  display_path: string;
  /**
   * @maxItems 100
   */
  changes: {
    path: string;
    action: "create" | "append_managed_block" | "update_managed_block" | "no_change" | "conflict";
    before_hash: string | null;
  }[];
  /**
   * @maxItems 100
   */
  warnings: Warning[];
}
export interface RegistrationCommit {
  plan_id: string;
}
export interface Root {
  id: string;
  label: string;
  display_path: string;
}
export interface DirectoryPage {
  root_id: string;
  relative_path: string;
  /**
   * @maxItems 200
   */
  items: {
    name: string;
    relative_path: string;
    registered: boolean;
  }[];
  next_cursor: string | null;
  minItems?: 0;
}
export interface AttentionItem {
  id: string;
  project_id: string;
  target: Target;
  reason: "overdue" | "due_soon" | "review_due" | "blocked" | "decision_needed" | "review";
  label: string;
  date?: string;
}
export interface AttentionPage {
  /**
   * @maxItems 100
   */
  warnings?: Warning[];
  /**
   * @maxItems 200
   */
  items: AttentionItem[];
  page: PageMeta;
  minItems?: 0;
}
export interface Context {
  api_version: "1";
  project: ContextEntry;
  /**
   * @maxItems 200
   */
  cards: ContextEntry[];
  /**
   * @maxItems 200
   */
  milestones: ContextEntry[];
  /**
   * @maxItems 200
   */
  updates: ContextEntry[];
  generated_at: string;
  truncated: boolean;
  budget_bytes: number;
  omitted: {
    [k: string]: number;
  };
  /**
   * @maxItems 100
   */
  warnings: Warning[];
  /**
   * @maxItems 200
   */
  focus: FocusRef[];
  included: {
    [k: string]: number;
  };
  /**
   * @maxItems 200
   */
  next_reads: {
    type: "project" | "card" | "milestone" | "update";
    id: string;
  }[];
}
export interface ContextEntry {
  type: "project" | "card" | "milestone" | "update";
  id: string;
  title: string;
  version: string;
  excerpt: string;
  truncated: boolean;
  phase?: string;
  status?: string;
  schedule?: Schedule;
  due?: Due;
  priority?: "low" | "normal" | "high" | "urgent";
  review_on?: string;
  blocked?: Blocked;
  target?: Target;
  recorded_at?: string;
  expected_result?: string;
  owner?: string;
  acceptance?: Acceptance;
}
export interface PairingCreate {
  device_label: string;
}
export interface Pairing {
  id: string;
  device_label: string;
  challenge: string;
  state: "pending" | "approved" | "denied" | "expired" | "claimed";
  expires_at: string;
  pending_csrf_token?: string;
}
export interface Session {
  id: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  current: boolean;
}
export interface HistoryEntry {
  id: string;
  request_id: string;
  recorded_at: string;
  before_version: string | null;
  after_version: string;
  /**
   * @maxItems 100
   */
  changed_fields: string[];
  can_undo: boolean;
}
export interface HistoryPage {
  /**
   * @maxItems 200
   */
  items: HistoryEntry[];
  page: PageMeta;
  minItems?: 0;
}
export interface Job {
  id: string;
  kind: string;
  state: "running" | "done" | "failed" | "needs_review";
  completed_steps: number;
  total_steps: number;
  error?: Error;
}
export interface Diagnostics {
  instance_id: string | null;
  state: "ready" | "degraded" | "recovering";
  invalid_documents: number;
  pending_commands: number;
  index_state: "ready" | "building" | "degraded";
  /**
   * @maxItems 100
   */
  warnings: Warning[];
  /**
   * @maxItems 100
   */
  issues: {
    project_id: string;
    path: string;
    code: string;
  }[];
  /**
   * @maxItems 50
   */
  jobs: {
    id: string;
    state: "running" | "needs_review";
    project_id: string;
  }[];
  history: {
    entries: number;
    bytes: number;
    retention_days: number;
    byte_budget: number;
  };
}
export interface ReceiptInput {
  project_id: string;
  update_id: string;
  read: boolean;
}
export interface ReceiptsInput {
  /**
   * @maxItems 200
   */
  items: ReceiptInput[];
  minItems?: 0;
}
export interface Event {
  tags_changed?: boolean;
  kind: "changed" | "resync_required" | "health_changed";
  cursor: string;
  target?: EventTarget;
  project_id?: string;
  version?: string;
  request_id?: string;
  reason?: string;
}
export interface EventTarget {
  type:
    "project" | "card" | "milestone" | "update" | "workspace" | "focus" | "preferences" | "receipt" | "registration";
  id?: string;
}
export interface Health {
  status: "ok" | "starting" | "degraded";
}
export interface PairingPage {
  /**
   * @maxItems 10
   */
  items: Pairing[];
  minItems?: 0;
}
export interface Sessions {
  /**
   * @maxItems 100
   */
  items: Session[];
  minItems?: 0;
}
export interface Roots {
  /**
   * @maxItems 1000
   */
  items: Root[];
  minItems?: 0;
}
export interface RegistrationResource {
  project_id: string;
  display_path: string;
  version: string;
}
export interface SourceValidation {
  scope: "source_documents";
  checked: number;
  invalid: number;
  normalization_required: number;
  issues_truncated: boolean;
  valid: boolean;
  /**
   * @maxItems 200
   */
  issues: {
    path: string;
    code: string;
  }[];
}
export interface GitObservation {
  project_id: string;
  observed_at: string;
  scope: "head_and_index";
  stale: boolean;
  untracked_checked: false;
  working_tree_checked: false;
  error: string | null;
  branch: string | null;
  commit: string | null;
  conflicted_paths: number | null;
  staged_paths: number | null;
}
export interface NativeFolderInput {
  selection_id: string;
  name?: string;
  git_mode: "private" | "tracked";
}
export interface NativeFolderSelection {
  selection_id: string;
  state: "pending" | "selected" | "cancelled" | "failed";
  plan: RegistrationPlan | null;
  error: string | null;
}

export type UUID = ApiContracts["UUID"];

export type RequestID = ApiContracts["RequestID"];

export type LocalDate = ApiContracts["LocalDate"];

export type Instant = ApiContracts["Instant"];

export type Version = ApiContracts["Version"];

export type Position = ApiContracts["Position"];

export type Evidence = ApiContracts["Evidence"];

export type ExpectedResult = ApiContracts["ExpectedResult"];

export type CardOwner = ApiContracts["CardOwner"];

export type ProjectPatch = ApiContracts["ProjectPatch"];

export type CardPatch = ApiContracts["CardPatch"];

export type MilestonePatch = ApiContracts["MilestonePatch"];

export type TagName = ApiContracts["TagName"];
