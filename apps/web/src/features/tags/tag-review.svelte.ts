import { patchCard } from "../../lib/api/resources";
import {
  getTagCatalog,
  previewTagChange,
  replaceTags,
} from "../../lib/api/tags";
import { subscribeSession } from "../../lib/api/session-events";
import { commandOperation } from "../../lib/api/command-operation.svelte";
import { CommandController } from "../../lib/api/command-controller";
import { ApiError } from "../../lib/api/api";
import { rememberTagSuggestions } from "./tag-suggestions";
import {
  catalogNames,
  catalogNameError,
  destinationTag,
  canFinishTagChange,
  type TagCatalog,
  type TagPreview,
  type TagChangeResult,
} from "./tag-management";

/** Owns one catalog review, including each card's independent retry identity. */
export function tagReview(onchanged: () => void) {
  const operation = commandOperation(() => !accessLost);
  const rowOperations = new Map<string, CommandController>();
  let catalog = $state<TagCatalog | null>(null);
  let newName = $state("");
  let source = $state<string | null>(null);
  let target = $state("");
  let preview = $state<TagPreview | null>(null);
  let results = $state<TagChangeResult[]>([]);
  let pending = $derived(operation.pending);
  let pendingPurpose = $state("");
  let busy = $state(false);
  let accessLost = $state(false);
  let error = $state("");
  let info = $state("");
  let operationFinished = $state(false);
  let generation = 0;
  const unresolved = $derived(
    !!pending || results.some((row) => !!row.pending),
  );
  const protectedDraft = $derived(!!newName || source !== null || unresolved);
  const canFinish = $derived(canFinishTagChange(catalog, preview, results));

  function connect() {
    void load();
    const unsubscribe = subscribeSession({
      ended: () => {
        generation++;
        accessLost = true;
        error =
          "Your session ended. This review and its command identities are preserved. Reconnect before continuing.";
      },
      restored: () => {
        accessLost = false;
      },
    });
    return () => {
      generation++;
      unsubscribe();
    };
  }
  async function readCatalog() {
    const current = ++generation;
    // Management always rereads source usage, independently of suggestion requests.
    const next = await getTagCatalog();
    if (current === generation && !accessLost) {
      catalog = next;
      rememberTagSuggestions(next);
    }
  }
  async function load() {
    if (busy || unresolved || accessLost) return;
    busy = true;
    error = "";
    try {
      await readCatalog();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  async function saveCatalog(names: string[], purpose: string) {
    if (!catalog || busy || unresolved || accessLost) return;
    if (names.length > 500) {
      error = "The catalog can contain up to 500 tags.";
      return;
    }
    pendingPurpose = purpose;
    operation.prepare(replaceTags({ tags: names }, catalog.version));
    await transmitCatalog();
  }
  async function transmitCatalog() {
    if (!pending || busy || accessLost) return;
    busy = true;
    error = "";
    try {
      await operation.commit();
      info = pendingPurpose;
      newName = "";
      onchanged();
      await readCatalog();
      if (preview) {
        operationFinished =
          canFinishTagChange(catalog, preview, results) &&
          !!catalog?.tags.some(
            (tag) => tag.name === preview!.target && tag.managed,
          );
        if (!operationFinished)
          info +=
            " Refreshed usage needs another review before this rename can be considered complete.";
      }
    } catch (e) {
      fail(e);
      if (operation.phase === "rejected" && e instanceof ApiError) {
        if (e.status === 412)
          error =
            "The workspace changed. Refresh the catalog and review your change again; your draft is preserved.";
      }
    } finally {
      busy = false;
    }
  }
  async function add() {
    if (!catalog) return;
    const name = newName.trim();
    error = catalogNameError(name, catalogNames(catalog));
    if (!error)
      await saveCatalog(
        [...catalogNames(catalog), name],
        `Added “${name}” to the catalog.`,
      );
  }
  function choose(name: string) {
    if (busy || unresolved) return;
    source = name;
    target = "";
    preview = null;
    results = [];
    rowOperations.clear();
    operationFinished = false;
    error = "";
    info = "";
  }
  async function inspect() {
    if (!catalog || source === null || busy || unresolved || accessLost) return;
    target = destinationTag(target, catalog);
    error = catalog.tags.some((tag) => tag.name === target)
      ? ""
      : catalogNameError(target);
    if (source === target) error = "Choose a different name.";
    if (error) return;
    busy = true;
    info = "";
    try {
      const next = await previewTagChange({ source, target });
      preview = next;
      rowOperations.clear();
      results = next.changes.map((change) => ({
        change,
        state: "ready",
        message: "Ready to apply",
      }));
      operationFinished = false;
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
  async function transmitRow(index: number) {
    const row = results[index];
    const key = `${row.change.project_id}:${row.change.card_id}`;
    let rowOperation = rowOperations.get(key);
    if (!rowOperation) {
      rowOperation = new CommandController({ allowed: () => !accessLost });
      rowOperations.set(key, rowOperation);
    }
    const intention =
      row.pending ??
      patchCard(
        row.change.project_id,
        row.change.card_id,
        { set: { labels: row.change.labels } },
        row.change.version,
      );
    if (!rowOperation.pending) rowOperation.prepare(intention);
    results[index] = {
      ...row,
      pending: intention,
      state: "uncertain",
      message: "Saving…",
    };
    try {
      await rowOperation.commit();
      results[index] = {
        ...row,
        pending: undefined,
        state: "saved",
        message: "Saved",
      };
      onchanged();
      return true;
    } catch (e) {
      const definitive = rowOperation.state.phase === "rejected";
      results[index] = {
        ...row,
        pending: definitive ? undefined : intention,
        state: definitive
          ? e instanceof ApiError && e.status === 412
            ? "conflict"
            : "failed"
          : "uncertain",
        message:
          e instanceof ApiError && e.status === 412
            ? "Card changed since preview. Review a new preview before retrying."
            : e instanceof Error
              ? e.message
              : String(e),
      };
      return definitive;
    }
  }
  async function apply(retryIndex?: number) {
    if (busy || accessLost || pending) return;
    if (retryIndex === undefined && unresolved) return;
    busy = true;
    error = "";
    try {
      if (retryIndex !== undefined) await transmitRow(retryIndex);
      else
        for (let index = 0; index < results.length; index++) {
          if (accessLost) break;
          if (results[index].state === "ready" && !(await transmitRow(index)))
            break;
        }
      await readCatalog();
      info =
        "Card results are listed below. Each saved card has its own history entry.";
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }
  async function finish() {
    if (!catalog || !preview || !canFinish) return;
    const reviewed = preview;
    const names = [
      ...new Set([
        ...catalogNames(catalog).filter((name) => name !== reviewed.source),
        reviewed.target,
      ]),
    ];
    await saveCatalog(
      names,
      `Finished: “${reviewed.target}” is in the catalog; the unused source name was removed.`,
    );
  }
  async function back() {
    if (busy || unresolved) return;
    source = null;
    target = "";
    preview = null;
    results = [];
    rowOperations.clear();
    operationFinished = false;
  }
  function include(name: string) {
    if (catalog)
      return saveCatalog(
        [...catalogNames(catalog), name],
        `Added “${name}” to the catalog.`,
      );
  }
  function removeUnused(name: string) {
    if (catalog)
      return saveCatalog(
        catalogNames(catalog).filter((item) => item !== name),
        `Removed unused catalog tag “${name}”.`,
      );
  }
  function restart() {
    if (busy || unresolved) return;
    preview = null;
    results = [];
    rowOperations.clear();
    error = "";
    info =
      "Previously saved changes remain. Review a new preview before applying more changes.";
  }
  return {
    get catalog() {
      return catalog;
    },
    get newName() {
      return newName;
    },
    get source() {
      return source;
    },
    get target() {
      return target;
    },
    get preview() {
      return preview;
    },
    get results() {
      return results;
    },
    get pending() {
      return pending;
    },
    get pendingPurpose() {
      return pendingPurpose;
    },
    get busy() {
      return busy;
    },
    get accessLost() {
      return accessLost;
    },
    get error() {
      return error;
    },
    get info() {
      return info;
    },
    get operationFinished() {
      return operationFinished;
    },
    get unresolved() {
      return unresolved;
    },
    get protectedDraft() {
      return protectedDraft;
    },
    get canFinish() {
      return canFinish;
    },
    set newName(value: string) {
      newName = value;
    },
    set target(value: string) {
      target = value;
    },
    set error(value: string) {
      error = value;
    },
    set info(value: string) {
      info = value;
    },
    include,
    removeUnused,
    restart,
    connect,
    load,
    add,
    choose,
    inspect,
    apply,
    finish,
    back,
    transmitCatalog,
  };
}
