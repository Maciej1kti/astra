<script lang="ts">
  import { onMount, tick } from "svelte";
  import { modal } from "./dialog";
  import {
    api,
    isDefinitiveRejection,
    ApiError,
    command,
    send,
    type Pending,
  } from "./api";
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

  let {
    onclose,
    onchanged,
    projectNames = {},
  }: {
    onclose: () => void;
    onchanged: () => void;
    projectNames?: Record<string, string>;
  } = $props();
  let catalog = $state<TagCatalog | null>(null);
  let query = $state("");
  let displayLimit = $state(100);
  let newName = $state("");
  let source = $state<string | null>(null);
  let target = $state("");
  let preview = $state<TagPreview | null>(null);
  let results = $state<TagChangeResult[]>([]);
  let pending = $state<Pending | null>(null);
  let pendingPurpose = $state("");
  let busy = $state(false);
  let accessLost = $state(false);
  let error = $state("");
  let info = $state("");
  let confirmClose = $state(false);
  let operationFinished = $state(false);
  let generation = 0;
  let searchInput = $state<HTMLInputElement>();
  const unresolved = $derived(
    !!pending || results.some((row) => !!row.pending),
  );
  const protectedDraft = $derived(!!newName || source !== null || unresolved);
  const matching = $derived(
    catalog?.tags.filter((tag) =>
      tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [],
  );
  const visible = $derived(matching.slice(0, displayLimit));
  $effect(() => {
    query;
    displayLimit = 100;
  });
  const ready = $derived(results.filter((row) => row.state === "ready").length);
  const saved = $derived(results.filter((row) => row.state === "saved").length);
  const canFinish = $derived(canFinishTagChange(catalog, preview, results));

  onMount(() => {
    void load();
    const ended = () => {
      generation++;
      accessLost = true;
      error =
        "Your session ended. This review and its command identities are preserved. Reconnect before continuing.";
    };
    const restored = () => {
      accessLost = false;
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (protectedDraft || busy) event.preventDefault();
    };
    window.addEventListener("session-ended", ended);
    window.addEventListener("session-restored", restored);
    window.addEventListener("beforeunload", leaving);
    return () => {
      generation++;
      window.removeEventListener("session-ended", ended);
      window.removeEventListener("session-restored", restored);
      window.removeEventListener("beforeunload", leaving);
    };
  });
  async function readCatalog() {
    const current = ++generation;
    // Management always rereads source usage, independently of suggestion requests.
    const next = await api<TagCatalog>(
      "/api/v1/workspace/tags",
      "GET",
      undefined,
      {},
      { fresh: true },
    );
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
  function focusButton(node: HTMLButtonElement) {
    node.focus();
  }
  function issueContext(issue: { project_id?: string; card_id?: string }) {
    return [
      issue.project_id
        ? (projectNames[issue.project_id] ?? `Project ${issue.project_id}`)
        : "",
      issue.card_id ? `Card ${issue.card_id}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function close() {
    if (busy) return;
    if (protectedDraft) confirmClose = true;
    else onclose();
  }
  async function copyReview() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            newName,
            source,
            target,
            preview,
            results,
            pending,
            pendingPurpose,
          },
          null,
          2,
        ),
      );
      info = "Tag review and command identities copied.";
    } catch {
      error =
        "Clipboard access is unavailable. Keep this review open until commands are resolved.";
    }
  }
  async function saveCatalog(names: string[], purpose: string) {
    if (!catalog || busy || unresolved || accessLost) return;
    if (names.length > 500) {
      error = "The catalog can contain up to 500 tags.";
      return;
    }
    pendingPurpose = purpose;
    pending = command(
      "/api/v1/workspace/tags",
      "PUT",
      { tags: names },
      catalog.version,
    );
    await transmitCatalog();
  }
  async function transmitCatalog() {
    if (!pending || busy || accessLost) return;
    busy = true;
    error = "";
    try {
      const reply = await send(pending);
      if (reply.state) {
        error = `Catalog save is ${reply.state}. Retry this same command to check its outcome.`;
        return;
      }
      pending = null;
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
      if (isDefinitiveRejection(e)) {
        pending = null;
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
      const next = await api<TagPreview>(
        "/api/v1/workspace/tags/preview",
        "POST",
        { source, target },
      );
      preview = next;
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
    const intention =
      row.pending ??
      command(
        `/api/v1/projects/${row.change.project_id}/cards/${row.change.card_id}`,
        "PATCH",
        { set: { labels: row.change.labels } },
        row.change.version,
      );
    results[index] = {
      ...row,
      pending: intention,
      state: "uncertain",
      message: "Saving…",
    };
    try {
      const reply = await send(intention);
      if (reply.state) {
        results[index] = {
          ...row,
          pending: intention,
          state: "uncertain",
          message: `Write is ${reply.state}. Retry this same command.`,
        };
        return false;
      }
      results[index] = {
        ...row,
        pending: undefined,
        state: "saved",
        message: "Saved",
      };
      onchanged();
      return true;
    } catch (e) {
      const definitive = isDefinitiveRejection(e);
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
    operationFinished = false;
    await tick();
    searchInput?.focus();
  }
</script>

<dialog
  use:modal
  aria-label="Manage tags"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <header>
    <div>
      <h2>Manage tags</h2>
      <p>One vocabulary across your projects.</p>
    </div>
    <button aria-label="Close tag manager" disabled={busy} onclick={close}
      >✕</button
    >
  </header>
  <div class="dialog-body">
    {#if confirmClose}<section class="notice" role="alert">
        <p>
          {unresolved
            ? "A write may still complete. Closing does not cancel it. Copy this review to preserve its command identities."
            : "Close this tag review? Already saved cards will keep their changes."}
        </p>
        <div class="actions">
          <button use:focusButton onclick={() => (confirmClose = false)}
            >Keep reviewing</button
          ><button onclick={onclose}>Close review</button>
        </div>
      </section>{/if}
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
    {#if info}<p class="notice" role="status">{info}</p>{/if}
    {#if pending}<button disabled={busy || accessLost} onclick={transmitCatalog}
        >Retry catalog command</button
      >{/if}
    {#if !catalog}<p role="status">
        {busy ? "Loading tags…" : "The catalog could not be loaded."}
      </p>
      <button disabled={busy || accessLost} onclick={load}
        >Reload catalog</button
      >
    {:else if source === null}
      <form
        class="create"
        onsubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label
          >New catalog tag<input
            bind:value={newName}
            disabled={busy || unresolved || accessLost}
            placeholder="e.g. Research"
          /></label
        ><button
          class="primary"
          disabled={busy || unresolved || accessLost || !newName.trim()}
          >Create tag</button
        >
      </form>
      <p class="hint">
        Names are case-sensitive. New names trim outer spaces; existing spelling
        and Unicode are preserved. Creating a catalog tag does not change any
        card.
      </p>
      <div class="search">
        <label
          >Find tags<input
            bind:this={searchInput}
            bind:value={query}
            type="search"
          /></label
        ><button disabled={busy || unresolved || accessLost} onclick={load}
          >Refresh catalog</button
        >
      </div>
      {#if !catalog.complete}<p class="notice" role="status">
          Some sources could not be counted. Usage below is a lower bound.
        </p>{/if}
      <ul class="tag-list" aria-label="Workspace tags">
        {#each visible as tag (tag.name)}<li>
            <div class="tag-detail">
              <strong>{tag.name}</strong><small
                >{tag.managed ? "In catalog" : "Used on cards"} · {tag.usage}
                {tag.usage === 1 ? "card" : "cards"}</small
              >{#if tag.projects.length}<details>
                  <summary
                    >Usage in {tag.projects.length}
                    {tag.projects.length === 1
                      ? "project"
                      : "projects"}</summary
                  >{#each tag.projects as project}<p>
                      {project.project_name}: {project.count}
                    </p>{/each}
                </details>{/if}
            </div>
            <div class="tag-actions">
              <button
                disabled={busy || unresolved || accessLost}
                aria-label={`Rename or merge tag ${tag.name}`}
                onclick={() => choose(tag.name)}>Rename / merge</button
              >{#if !tag.managed}<button
                  disabled={busy || unresolved || accessLost}
                  aria-label={`Add ${tag.name} to catalog`}
                  onclick={() =>
                    saveCatalog(
                      [...catalogNames(catalog!), tag.name],
                      `Added “${tag.name}” to the catalog.`,
                    )}>Add to catalog</button
                >{:else if tag.usage === 0 && catalog.complete}<button
                  disabled={busy || unresolved || accessLost}
                  aria-label={`Remove unused tag ${tag.name}`}
                  onclick={() =>
                    saveCatalog(
                      catalogNames(catalog!).filter(
                        (name) => name !== tag.name,
                      ),
                      `Removed unused catalog tag “${tag.name}”.`,
                    )}>Remove unused</button
                >{/if}
            </div>
          </li>{:else}<li class="empty">
            {query
              ? "No tags match this search."
              : "No tags yet. Create a reusable name above, or add a tag to a card."}
          </li>{/each}
      </ul>
      {#if matching.length > visible.length}<button
          onclick={() => (displayLimit += 100)}
          >Show more tags ({visible.length} of {matching.length})</button
        >{/if}
      {#if catalog.issues.length}<details>
          <summary
            >Sources that need attention ({catalog.issues.length})</summary
          >{#each catalog.issues as issue}<p>
              {#if issue.project_id}<strong>{issueContext(issue)}</strong><br
                />{/if}{issue.message}
            </p>{/each}
        </details>{/if}
    {:else}
      <div class="actions">
        <button disabled={busy || unresolved} onclick={back}>← All tags</button
        ><button disabled={busy || unresolved || accessLost} onclick={load}
          >Refresh catalog</button
        >
      </div>
      <h3>Rename or merge <span class="literal">{source}</span></h3>
      <p class="hint">
        Choosing an existing name merges the two tags. Archived cards are
        included. Unrelated labels stay as they are.
      </p>
      <form
        class="create"
        onsubmit={(event) => {
          event.preventDefault();
          void inspect();
        }}
      >
        <label
          >Destination tag<input
            bind:value={target}
            list="tag-destinations"
            disabled={busy || unresolved || !!preview}
          /></label
        ><datalist id="tag-destinations"
          >{#each catalog.tags.filter((tag) => tag.name !== source) as tag}<option
              value={tag.name}
            ></option>{/each}</datalist
        ><button
          disabled={busy ||
            unresolved ||
            accessLost ||
            !target.trim() ||
            !!preview}>Preview changes</button
        >
      </form>
      {#if preview}
        <section aria-label="Tag change preview">
          <h3>
            {preview.changes.length} affected {preview.changes.length === 1
              ? "card"
              : "cards"}
          </h3>
          <p>
            {saved} saved · {ready} ready · {results.filter(
              (row) => row.state === "conflict" || row.state === "failed",
            ).length} need review
          </p>
          {#if !preview.complete}<p class="notice">
              Coverage is incomplete. Only the listed cards can be reviewed
              here; the source catalog name will be retained.
            </p>{/if}
          {#each preview.issues as issue}<p class="notice">
              {#if issue.project_id}<strong>{issueContext(issue)}</strong><br
                />{/if}{issue.message}
            </p>{/each}
          <ul class="results">
            {#each results as row, index}<li>
                <div>
                  <strong>{row.change.title}</strong><small
                    >{row.change.project_name}</small
                  >
                  <p class={`result-${row.state}`}>{row.message}</p>
                  <p class="labels">
                    {#each row.change.labels as label}<span>{label}</span
                      >{/each}
                  </p>
                </div>
                {#if row.pending}<button
                    disabled={busy || accessLost}
                    onclick={() => apply(index)}>Retry same card command</button
                  >{/if}
              </li>{/each}
          </ul>
          {#if operationFinished}<p class="notice" role="status">
              Tag change complete.
            </p>
          {:else}<div class="actions">
              {#if ready}<button
                  class="primary"
                  disabled={busy || unresolved || accessLost}
                  onclick={() => apply()}
                  >Apply to {ready} {ready === 1 ? "card" : "cards"}</button
                >{/if}{#if canFinish}<button
                  class="primary"
                  disabled={busy || unresolved || accessLost}
                  onclick={finish}>Finish catalog change</button
                >{/if}<button
                disabled={busy || unresolved || accessLost}
                onclick={() => {
                  preview = null;
                  results = [];
                  error = "";
                  info =
                    "Previously saved changes remain. Review a new preview before applying more changes.";
                }}>Review new preview</button
              >
            </div>{/if}
          {#if !canFinish && !operationFinished}<p class="hint">
              The source name stays in the catalog until all source cards have
              been counted and changed. Resolve unavailable sources or
              conflicts, then review a new preview.
            </p>{/if}
        </section>
      {/if}
    {/if}
  </div>
  <footer>
    <span aria-live="polite"
      >{busy
        ? "Working…"
        : unresolved
          ? "Command outcome needs checking"
          : "Changes use each card’s reviewed version"}</span
    ><button onclick={copyReview}>Copy review</button><button
      disabled={busy}
      onclick={close}>Close</button
    >
  </footer>
</dialog>

<style>
  dialog {
    width: min(880px, calc(100vw - 24px));
    max-height: 92dvh;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    color: var(--ink);
    background: var(--paper);
  }
  header,
  footer {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
  }
  header {
    border-bottom: 1px solid var(--line);
  }
  footer {
    border-top: 1px solid var(--line);
    background: var(--paper);
  }
  h2,
  header p {
    margin: 0;
  }
  header p {
    margin-top: 5px;
    color: var(--muted);
    font-size: 13px;
  }
  .dialog-body {
    overflow-y: auto;
    max-height: calc(92dvh - 160px);
    padding: 20px;
    overscroll-behavior: contain;
  }
  .create,
  .search,
  .actions {
    display: flex;
    gap: 8px;
    align-items: end;
    flex-wrap: wrap;
  }
  .create label,
  .search label {
    flex: 1;
    min-width: 160px;
  }
  label {
    display: grid;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
  }
  input {
    width: 100%;
    min-width: 0;
  }
  .search {
    margin: 24px 0 12px;
  }
  .hint,
  small,
  footer span {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
  .tag-list,
  .results {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    gap: 16px;
    justify-content: space-between;
    padding: 15px 0;
    border-bottom: 1px solid var(--line);
  }
  .tag-detail,
  .results li > div {
    min-width: 0;
  }
  strong,
  .literal {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  small {
    display: block;
    margin-top: 5px;
  }
  .tag-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: end;
  }
  details {
    font-size: 12px;
    color: var(--muted);
    margin-top: 8px;
  }
  summary {
    cursor: pointer;
    min-height: 30px;
    align-content: center;
  }
  details p {
    margin: 5px 0;
  }
  .results {
    max-height: 40dvh;
    overflow-y: auto;
    margin-bottom: 16px;
  }
  .results p {
    font-size: 12px;
    margin: 7px 0;
  }
  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .labels span {
    border: 1px solid var(--line);
    padding: 3px 6px;
    border-radius: 6px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .result-conflict,
  .result-failed,
  .result-uncertain {
    color: var(--danger, #b3261e);
  }
  .result-saved {
    color: var(--muted);
  }
  .notice {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    line-height: 1.5;
    font-size: 13px;
  }
  button {
    min-height: 44px;
  }
  .empty {
    color: var(--muted);
    padding: 24px 0;
  }
  @media (max-width: 600px) {
    header,
    footer,
    .dialog-body {
      padding: 14px;
    }
    li {
      flex-direction: column;
      gap: 10px;
    }
    .tag-actions {
      justify-content: start;
    }
    footer {
      flex-wrap: wrap;
    }
    footer span {
      width: 100%;
    }
    .dialog-body {
      max-height: calc(92dvh - 205px);
    }
  }
</style>
