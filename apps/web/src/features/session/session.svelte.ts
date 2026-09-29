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
  preferences: (value: PreferencesResource) => void;
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
  let generation = 0;
  let preferencesGeneration = 0;
  async function preferences() {
    const current = generation;
    const request = ++preferencesGeneration;
    const value = await getPreferences({ fresh: true });
    if (!boot || current !== generation) return;
    if (request === preferencesGeneration) {
      boot = { ...boot, timezone: value.timezone };
      hooks.preferences(value);
    }
    return value;
  }
  const changes = invalidationBatch((events) => {
    const current = generation;
    void (async () => {
      if (!boot) return;
      if (
        events.some((event) =>
          ["workspace_changed", "resync_required"].includes(event.kind ?? ""),
        )
      ) {
        try {
          await preferences();
        } catch (cause) {
          hooks.error(cause);
        }
      }
      if (boot && current === generation) hooks.changes(events);
    })();
  });

  function ended() {
    generation++;
    changes.cancel();
    source?.close();
    source = undefined;
    clearReads();
    boot = null;
    connected = false;
    hooks.ended();
  }
  function connect() {
    if (source || !boot) return;
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
    const current = generation;
    try {
      const value = await api<Bootstrap>("/api/v1/bootstrap");
      if (current !== generation) return;
      boot = value;
      configure(boot);
      publishSession("restored");
      connect();
      const valuePreferences = await preferences();
      if (valuePreferences && current === generation)
        await ready(valuePreferences);
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
    const current = generation;
    try {
      const value = await api<Bootstrap>("/api/v1/bootstrap");
      if (!boot || current !== generation) return;
      boot = value;
      configure(boot);
      connect();
      await preferences();
      if (boot && current === generation) await hooks.foreground();
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
      generation++;
      source?.close();
      source = undefined;
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
