import { tick } from "svelte";
import {
  readRoute,
  writeRoute,
  searchOnlyNavigation,
  type WorkspaceRoute,
} from "./navigation";
import type { Resource } from "../../lib/api/api";

type ResourceRoute = NonNullable<WorkspaceRoute["resource"]>;
type NavigationHooks = {
  today: () => string;
  hasEditor: () => boolean;
  requestClose: () => boolean;
  dialogsOpen: () => boolean;
  clearEditor: () => void;
  loadResource: (target: ResourceRoute) => Promise<Resource>;
  showResource: (target: ResourceRoute, resource: Resource) => void;
  refresh: () => Promise<void>;
  error: (cause: unknown) => void;
};

/** Route state, browser history and the outstanding guarded navigation belong together. */
export function navigationState(
  initial: WorkspaceRoute,
  hooks: NavigationHooks,
) {
  let current = $state(initial);
  let restoring = $state(false);
  let pending: URLSearchParams | null = null;
  let generation = 0;
  let ready = false;
  let lastUrl = location.pathname + location.search;

  function keepEditing() {
    pending = null;
    history.pushState(null, "", lastUrl);
    restoring = false;
  }
  async function restore(params: URLSearchParams) {
    const requested = ++generation;
    restoring = true;
    pending = null;
    try {
      current = readRoute(params, hooks.today());
      hooks.clearEditor();
      if (current.resource) {
        const target = current.resource;
        const resource = await hooks.loadResource(target);
        if (requested !== generation) return;
        hooks.showResource(target, resource);
      }
      await hooks.refresh();
      if (requested !== generation) return;
      await tick();
      lastUrl = location.pathname + location.search;
      ready = false;
    } catch (cause) {
      if (requested === generation) hooks.error(cause);
    } finally {
      if (requested === generation) restoring = false;
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
          "Close the open dialog before changing views with browser navigation.",
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
  return {
    get current() {
      return current;
    },
    get pending() {
      return pending;
    },
    get restoring() {
      return restoring;
    },
    get generation() {
      return generation;
    },
    set generation(value: number) {
      generation = value;
    },
    assign(route: WorkspaceRoute) {
      current = route;
    },
    reset() {
      generation++;
      pending = null;
      restoring = false;
      ready = false;
    },
    restore,
    keepEditing,
    fromHistory,
    sync,
  };
}
