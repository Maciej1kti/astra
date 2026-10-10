import { tick } from "svelte";
import {
  readRoute,
  writeRoute,
  searchOnlyNavigation,
  type WorkspaceRoute,
  type View,
} from "./navigation";
import type { Resource } from "../../lib/api/api";

type ResourceRoute = NonNullable<WorkspaceRoute["resource"]>;
export type RouteFilters = Pick<
  WorkspaceRoute,
  | "project"
  | "folder"
  | "search"
  | "archived"
  | "status"
  | "priority"
  | "label"
  | "unreadOnly"
  | "month"
  | "planningScope"
>;
type NavigationHooks<Loaded> = {
  today: () => string;
  hasEditor: () => boolean;
  requestClose: () => boolean;
  dialogsOpen: () => boolean;
  clearEditor: () => void;
  loadResource: (target: ResourceRoute, signal: AbortSignal) => Promise<Loaded>;
  showResource: (target: ResourceRoute, resource: Loaded) => void;
  refresh: () => Promise<void>;
  error: (cause: unknown) => void;
};

/** Route state, browser history and the outstanding guarded navigation belong together. */
export function navigationState<Loaded = Resource>(
  initial: WorkspaceRoute,
  hooks: NavigationHooks<Loaded>,
) {
  let current = $state(initial);
  let restoring = $state(false);
  let pending: URLSearchParams | null = null;
  let generation = 0;
  let resourceRead: AbortController | null = null;
  let ready = false;
  let lastUrl = location.pathname + location.search;

  function keepEditing() {
    pending = null;
    history.pushState(null, "", lastUrl);
    restoring = false;
  }
  async function restore(params: URLSearchParams) {
    invalidateResourceRead();
    const requested = generation;
    restoring = true;
    pending = null;
    try {
      current = readRoute(params, hooks.today());
      hooks.clearEditor();
      if (current.resource) {
        const target = current.resource;
        const controller = (resourceRead = new AbortController());
        const resource = await hooks.loadResource(target, controller.signal);
        if (requested !== generation) return;
        resourceRead = null;
        hooks.showResource(target, resource);
      }
      await hooks.refresh();
      if (requested !== generation) return;
      await tick();
      if (requested !== generation) return;
      lastUrl = location.pathname + location.search;
      ready = false;
    } catch (cause) {
      if (requested === generation) {
        resourceRead?.abort();
        hooks.error(cause);
      }
    } finally {
      if (requested === generation) {
        resourceRead = null;
        restoring = false;
      }
    }
  }
  function fromHistory() {
    const target = new URLSearchParams(location.search);
    restoring = true;
    if (hooks.hasEditor()) {
      pending = target;
      if (!hooks.requestClose()) keepEditing();
    } else if (hooks.dialogsOpen()) {
      keepEditing();
      hooks.error(
        new Error(
          "Zamknij otwarte okno przed zmianą widoku przez nawigację przeglądarki.",
        ),
      );
    } else void restore(target);
  }
  function sync(resource?: ResourceRoute) {
    const route = writeRoute({ ...current, resource });
    const url = `${location.pathname}?${route}`;
    if (
      !ready ||
      searchOnlyNavigation(
        new URL(lastUrl, location.origin).searchParams,
        route,
      )
    )
      history.replaceState(null, "", url);
    else if (url !== lastUrl) history.pushState(null, "", url);
    ready = true;
    lastUrl = url;
  }
  function invalidateResourceRead() {
    generation++;
    resourceRead?.abort();
    resourceRead = null;
    pending = null;
    restoring = false;
  }
  function assign(route: WorkspaceRoute) {
    invalidateResourceRead();
    current = route;
  }
  function changeFilters(patch: Partial<RouteFilters>) {
    if (patch.project !== undefined && patch.project !== current.project)
      invalidateResourceRead();
    current = { ...current, ...patch };
  }
  async function openResource(target: ResourceRoute) {
    invalidateResourceRead();
    const requested = generation;
    const controller = (resourceRead = new AbortController());
    try {
      const resource = await hooks.loadResource(target, controller.signal);
      if (requested === generation) {
        resourceRead = null;
        hooks.showResource(target, resource);
      }
    } catch (cause) {
      controller.abort();
      if (requested === generation) hooks.error(cause);
    } finally {
      if (resourceRead === controller) resourceRead = null;
    }
  }
  return {
    get current(): Readonly<WorkspaceRoute> {
      return current;
    },
    get pending() {
      return pending;
    },
    get restoring() {
      return restoring;
    },
    selectView: (view: View) => {
      if (view !== current.view) assign({ ...current, view });
    },
    showProject(project: string) {
      assign({ ...current, project, view: "board", search: "" });
    },
    startDraft() {
      invalidateResourceRead();
    },
    navigateCalendar: (
      calendarDate: string,
      calendarLayout: WorkspaceRoute["calendarLayout"],
    ) => {
      current = { ...current, calendarDate, calendarLayout };
    },
    reset() {
      invalidateResourceRead();
      ready = false;
    },
    restore,
    assign,
    changeFilters,
    openResource,
    keepEditing,
    fromHistory,
    sync,
  };
}
