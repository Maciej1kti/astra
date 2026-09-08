import { onMount } from "svelte";
import {
  api,
  ApiError,
  configure,
  clearReads,
  type Bootstrap,
} from "../../lib/api/api";
import type {
  Pairing,
  PreferencesResource,
} from "../../lib/contracts/api.generated";
import {
  invalidationBatch,
  type Invalidation,
} from "../../lib/api/invalidations";
import { publishSession, subscribeSession } from "../../lib/api/session-events";
import { getPreferences } from "../../lib/api/resources";

type SessionHooks = {
  error: (cause: unknown) => void;
  ended: () => void;
  foreground: () => Promise<void>;
  changes: (events: Invalidation[]) => void;
};

/** One mounted application's bootstrap, pairing and event-stream lifetime. */
export function sessionState(hooks: SessionHooks) {
  let boot = $state<Bootstrap | null>(null);
  let pairing = $state<Pairing | null>(null);
  let device = $state("My browser");
  let busy = $state(false);
  let loading = $state(true);
  let connected = $state(false);
  let source: EventSource | undefined;
  const changes = invalidationBatch((events) => {
    if (boot) hooks.changes(events);
  });

  function ended() {
    changes.cancel();
    source?.close();
    clearReads();
    boot = null;
    connected = false;
    hooks.ended();
  }
  function connect() {
    source?.close();
    if (!boot) return;
    source = new EventSource(
      `/api/v1/events?cursor=${encodeURIComponent(boot.snapshot_cursor)}`,
    );
    source.onopen = () => {
      connected = true;
    };
    source.onerror = () => {
      connected = false;
      // A 401 publishes session loss; a network timeout must preserve drafts.
      void api("/api/v1/bootstrap").catch(() => {});
    };
    for (const kind of [
      "changed",
      "health_changed",
      "resync_required",
      "workspace_changed",
    ]) {
      source.addEventListener(kind, (event) => {
        try {
          changes.push({ ...JSON.parse((event as MessageEvent).data), kind });
        } catch {
          changes.push({ kind: "resync_required" });
        }
      });
    }
  }
  async function initialize(
    ready: (preferences: PreferencesResource) => Promise<void>,
  ) {
    loading = true;
    try {
      boot = await api<Bootstrap>("/api/v1/bootstrap");
      configure(boot);
      publishSession("restored");
      const preferences = await getPreferences();
      await ready(preferences);
      connect();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        boot = null;
        try {
          pairing = await api<Pairing>("/api/v1/auth/pairings/current");
        } catch {
          pairing = null;
        }
      } else hooks.error(cause);
    } finally {
      loading = false;
    }
  }
  async function foreground() {
    if (document.visibilityState !== "visible" || !boot) return;
    try {
      boot = await api<Bootstrap>("/api/v1/bootstrap");
      configure(boot);
      await hooks.foreground();
    } catch (cause) {
      hooks.error(cause);
    }
  }
  async function startPairing() {
    busy = true;
    try {
      pairing = await api<Pairing>("/api/v1/auth/pairings", "POST", {
        device_label: device,
      });
    } catch (cause) {
      hooks.error(cause);
    } finally {
      busy = false;
    }
  }
  async function checkPairing(ready: () => Promise<void>) {
    busy = true;
    try {
      pairing = await api<Pairing>("/api/v1/auth/pairings/current");
      if (pairing.state === "approved" || pairing.state === "claimed") {
        if (!pairing.pending_csrf_token)
          throw new Error(
            "The pairing challenge is unavailable. Request access again.",
          );
        await api(
          "/api/v1/auth/pairings/claim",
          "POST",
          {},
          { "X-CSRF-Token": pairing.pending_csrf_token },
        );
        await ready();
      }
    } catch (cause) {
      hooks.error(cause);
    } finally {
      busy = false;
    }
  }
  async function logout() {
    await api("/api/v1/auth/logout", "POST", {});
    ended();
    pairing = null;
  }
  onMount(() => {
    const unsubscribe = subscribeSession({ ended });
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      unsubscribe();
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
      source?.close();
      changes.cancel();
    };
  });
  return {
    get boot() {
      return boot;
    },
    get loading() {
      return loading;
    },
    get busy() {
      return busy;
    },
    get connected() {
      return connected;
    },
    get pairing() {
      return pairing;
    },
    get device() {
      return device;
    },
    set device(value: string) {
      device = value;
    },
    restartPairing() {
      pairing = null;
    },
    initialize,
    startPairing,
    checkPairing,
    logout,
  };
}
