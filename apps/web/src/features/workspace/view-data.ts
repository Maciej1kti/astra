import {
  loadView,
  viewQueryKey,
  viewSections,
  resourcePage,
  attentionPage,
  type Attention,
  type FocusRef,
  type Section,
  type ViewQuery,
} from "./view-queries.ts";
import { cursorPage } from "../../lib/api/pagination.ts";
import { projectionNotice } from "../../lib/api/projection-state.ts";
import type { Summary } from "../../lib/api/api.ts";

export type ViewDataState = {
  projects: Summary[];
  cards: Summary[];
  milestones: Summary[];
  updates: Summary[];
  focus: FocusRef[];
  focusCards: Summary[];
  attentionRows: Attention[];
  attentionCursor: string | null;
  attentionPaged: boolean;
  pageHistory: Record<string, (string | null)[]>;
  pageCursors: Record<string, string | null>;
  sectionNotices: Partial<Record<Section, string>>;
  queryNotice: string;
  loadedQueryKey: string;
  loadingMore: boolean;
  revision: number;
};
const emptyState = (): ViewDataState => ({
  projects: [],
  cards: [],
  milestones: [],
  updates: [],
  focus: [],
  focusCards: [],
  attentionRows: [],
  attentionCursor: null,
  attentionPaged: false,
  pageHistory: {},
  pageCursors: {},
  sectionNotices: {},
  queryNotice: "",
  loadedQueryKey: "",
  loadingMore: false,
  revision: 0,
});
type Dependencies = {
  query: () => ViewQuery;
  active: () => boolean;
  error: (cause: unknown) => void;
  changed?: (state: ViewDataState) => void;
  load?: typeof loadView;
};

/** Owns view reads and cursors. Routing and session owners supply scope and lifetime. */
export class ViewData {
  private snapshot = emptyState();
  private generation = 0;
  private projectsReady = false;
  private controller: AbortController | undefined;
  private job: { key: string; promise: Promise<void> } | undefined;
  private queued = new Set<Section>();
  private attentionStart: string | null = null;
  private dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
  }
  get state() {
    return this.snapshot;
  }
  private publish() {
    this.snapshot = { ...this.snapshot };
    this.dependencies.changed?.(this.snapshot);
  }
  invalidate() {
    this.generation++;
    this.controller?.abort();
    this.job = undefined;
    this.queued.clear();
    this.snapshot.loadingMore = false;
    this.publish();
  }
  reset() {
    this.invalidate();
    this.projectsReady = false;
    this.attentionStart = null;
    this.snapshot = emptyState();
    this.publish();
  }
  refresh(sections?: Section[]): Promise<void> {
    const query = this.dependencies.query();
    const key = viewQueryKey(query);
    const changedRoute = this.snapshot.loadedQueryKey !== key;
    const needed = viewSections(query);
    const requested = changedRoute ? needed : (sections ?? needed);
    if (this.job?.key === key) {
      requested.forEach((section) => this.queued.add(section));
      return this.job.promise;
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    this.snapshot.loadingMore = false;
    const selected = [...new Set([...requested, ...this.queued])].filter(
      (section) =>
        needed.includes(section) &&
        (section !== "projects" ||
          !this.projectsReady ||
          !changedRoute ||
          sections?.includes("projects") ||
          this.queued.has("projects")),
    );
    this.queued.clear();
    const cursors = changedRoute
      ? {}
      : {
          ...Object.fromEntries(
            Object.entries(this.snapshot.pageHistory).map(([kind, history]) => [
              kind,
              history.at(-1) ?? null,
            ]),
          ),
          attention: this.attentionStart,
        };
    if (changedRoute) {
      this.snapshot.queryNotice = "";
      this.snapshot.pageHistory = {};
      this.snapshot.pageCursors = {};
      this.attentionStart = null;
    }
    const promise = (async () => {
      try {
        const result = await (this.dependencies.load ?? loadView)(
          query,
          selected,
          cursors,
          controller.signal,
        );
        if (
          generation !== this.generation ||
          key !== viewQueryKey(this.dependencies.query())
        )
          return;
        this.snapshot.sectionNotices = {
          ...this.snapshot.sectionNotices,
          ...result.notices,
        };
        if (result.projects) {
          this.snapshot.projects = result.projects;
          this.projectsReady = true;
        }
        if (result.focus) {
          this.snapshot.focus = result.focus;
          this.snapshot.focusCards = result.focusCards ?? [];
        }
        if (result.attention) {
          this.snapshot.attentionRows = result.attention.value.items;
          this.snapshot.attentionCursor =
            result.attention.value.page.next_cursor;
          if (result.attention.reset) {
            this.attentionStart = null;
            this.snapshot.queryNotice =
              "Attention changed. Showing the first page of the latest results.";
          }
          this.snapshot.attentionPaged = this.attentionStart !== null;
        }
        for (const [kind, page] of Object.entries(result.pages)) {
          this.setRows(kind, page.value.items);
          this.snapshot.pageCursors[kind] = page.value.page.next_cursor;
          if (changedRoute || page.reset || !this.snapshot.pageHistory[kind])
            this.snapshot.pageHistory[kind] = [null];
          if (page.reset)
            this.snapshot.queryNotice =
              "This collection changed. Showing the first page of the latest results.";
        }
        this.snapshot.loadedQueryKey = key;
        if (!changedRoute && selected.includes("planning"))
          this.snapshot.revision++;
        this.publish();
      } finally {
        if (generation === this.generation) {
          this.job = undefined;
          if (this.queued.size && this.dependencies.active()) {
            const followup = [...this.queued];
            this.queued.clear();
            void this.refresh(followup).catch(this.dependencies.error);
          }
        }
      }
    })();
    this.job = { key, promise };
    return promise;
  }
  private setRows(kind: string, rows: Summary[]) {
    if (kind === "card") this.snapshot.cards = rows;
    else if (kind === "milestone") this.snapshot.milestones = rows;
    else this.snapshot.updates = rows;
  }
  async more(kind: string, back = false) {
    const state = this.snapshot;
    if (
      state.loadingMore ||
      (!back && !state.pageCursors[kind]) ||
      (back && (state.pageHistory[kind]?.length ?? 0) < 2)
    )
      return;
    const generation = this.generation;
    const query = this.dependencies.query();
    state.loadingMore = true;
    this.publish();
    try {
      const history = state.pageHistory[kind] ?? [null];
      const target = back
        ? history[history.length - 2]
        : state.pageCursors[kind];
      const result = await cursorPage(
        (cursor) => resourcePage(query, kind, cursor),
        target,
      );
      if (
        generation !== this.generation ||
        viewQueryKey(query) !== viewQueryKey(this.dependencies.query())
      )
        return;
      this.snapshot.pageHistory[kind] = result.reset
        ? [null]
        : back
          ? history.slice(0, -1)
          : [...history, target];
      this.setRows(kind, result.value.items);
      this.snapshot.pageCursors[kind] = result.value.page.next_cursor;
      this.snapshot.sectionNotices[kind as Section] = projectionNotice(
        result.value,
      );
      if (result.reset)
        this.snapshot.queryNotice =
          "This collection changed. Showing the first page of the latest results.";
    } catch (cause) {
      if (generation === this.generation) this.dependencies.error(cause);
    } finally {
      if (generation === this.generation) {
        this.snapshot.loadingMore = false;
        this.publish();
      }
    }
  }
  async moreAttention(first = false) {
    if (this.snapshot.loadingMore) return;
    const generation = this.generation;
    const project = this.dependencies.query().project;
    const target = first ? null : this.snapshot.attentionCursor;
    this.snapshot.loadingMore = true;
    this.publish();
    try {
      const result = await cursorPage(
        (cursor) => attentionPage(project, cursor),
        target,
      );
      if (
        generation !== this.generation ||
        project !== this.dependencies.query().project
      )
        return;
      this.snapshot.attentionRows = result.value.items;
      this.snapshot.sectionNotices.attention = projectionNotice(result.value);
      this.snapshot.attentionCursor = result.value.page.next_cursor;
      this.attentionStart = result.reset ? null : target;
      this.snapshot.attentionPaged = this.attentionStart !== null;
      if (result.reset)
        this.snapshot.queryNotice =
          "Attention changed. Showing the first page of the latest results.";
    } catch (cause) {
      if (generation === this.generation) this.dependencies.error(cause);
    } finally {
      if (generation === this.generation) {
        this.snapshot.loadingMore = false;
        this.publish();
      }
    }
  }
}
