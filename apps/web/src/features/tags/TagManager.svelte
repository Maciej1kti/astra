<script lang="ts">
  import { onMount, tick } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import { tagReview } from "./tag-review.svelte";
  let {
    onclose,
    onchanged,
    projectNames = {},
  }: {
    onclose: () => void;
    onchanged: () => void;
    projectNames?: Record<string, string>;
  } = $props();
  const review = tagReview(() => onchanged());
  let query = $state("");
  let displayLimit = $state(100);
  let confirmClose = $state(false);
  let searchInput = $state<HTMLInputElement>();
  const matching = $derived(
    review.catalog?.tags.filter((tag) =>
      tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) ?? [],
  );
  const visible = $derived(matching.slice(0, displayLimit));
  const ready = $derived(
    review.results.filter((row) => row.state === "ready").length,
  );
  const saved = $derived(
    review.results.filter((row) => row.state === "saved").length,
  );
  $effect(() => {
    query;
    displayLimit = 100;
  });
  onMount(() => {
    const disconnect = review.connect();
    const leaving = (event: BeforeUnloadEvent) => {
      if (review.protectedDraft || review.busy) event.preventDefault();
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      disconnect();
      window.removeEventListener("beforeunload", leaving);
    };
  });
  async function back() {
    if (review.busy || review.unresolved) return;
    await review.back();
    await tick();
    searchInput?.focus();
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
    if (review.busy) return;
    if (review.protectedDraft) confirmClose = true;
    else onclose();
  }
  async function copyReview() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            newName: review.newName,
            source: review.source,
            target: review.target,
            preview: review.preview,
            results: review.results,
            pending: review.pending,
            pendingPurpose: review.pendingPurpose,
          },
          null,
          2,
        ),
      );
      review.info = "Tag review and command identities copied.";
    } catch {
      review.error =
        "Clipboard access is unavailable. Keep this review open until commands are resolved.";
    }
  }
</script>

<dialog
  class="app-dialog"
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
    <button
      aria-label="Close tag manager"
      disabled={review.busy}
      onclick={close}>✕</button
    >
  </header>
  <div class="dialog-body">
    {#if confirmClose}<section class="notice" role="alert">
        <p>
          {review.unresolved
            ? "A write may still complete. Closing does not cancel it. Copy this review to preserve its command identities."
            : "Close this tag review? Already saved cards will keep their changes."}
        </p>
        <div class="actions">
          <button use:focusButton onclick={() => (confirmClose = false)}
            >Keep reviewing</button
          ><button onclick={onclose}>Close review</button>
        </div>
      </section>{/if}
    {#if review.error}<p class="notice" role="alert">{review.error}</p>{/if}
    {#if review.info}<p class="notice" role="status">{review.info}</p>{/if}
    {#if review.pending}<button
        disabled={review.busy || review.accessLost}
        onclick={review.transmitCatalog}>Retry catalog command</button
      >{/if}
    {#if !review.catalog}<p role="status">
        {review.busy
          ? "Loading tags…"
          : "The review.catalog could not be loaded."}
      </p>
      <button disabled={review.busy || review.accessLost} onclick={review.load}
        >Reload catalog</button
      >
    {:else if review.source === null}
      <form
        class="create"
        onsubmit={(event) => {
          event.preventDefault();
          void review.add();
        }}
      >
        <label
          >New catalog tag<input
            bind:value={review.newName}
            disabled={review.busy || review.unresolved || review.accessLost}
            placeholder="e.g. Research"
          /></label
        ><button
          class="primary"
          disabled={review.busy ||
            review.unresolved ||
            review.accessLost ||
            !review.newName.trim()}>Create tag</button
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
        ><button
          disabled={review.busy || review.unresolved || review.accessLost}
          onclick={review.load}>Refresh catalog</button
        >
      </div>
      {#if !review.catalog.complete}<p class="notice" role="status">
          Some sources could not be counted. Usage below is a lower bound.
        </p>{/if}
      <ul class="tag-list" aria-label="Workspace tags">
        {#each visible as tag (tag.name)}<li>
            <div class="tag-detail">
              <strong>{tag.name}</strong><small
                >{tag.managed ? "In review.catalog" : "Used on cards"} · {tag.usage}
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
                disabled={review.busy || review.unresolved || review.accessLost}
                aria-label={`Rename or merge tag ${tag.name}`}
                onclick={() => review.choose(tag.name)}>Rename / merge</button
              >{#if !tag.managed}<button
                  disabled={review.busy ||
                    review.unresolved ||
                    review.accessLost}
                  aria-label={`Add ${tag.name} to catalog`}
                  onclick={() => review.include(tag.name)}
                  >Add to catalog</button
                >{:else if tag.usage === 0 && review.catalog.complete}<button
                  disabled={review.busy ||
                    review.unresolved ||
                    review.accessLost}
                  aria-label={`Remove unused tag ${tag.name}`}
                  onclick={() => review.removeUnused(tag.name)}
                  >Remove unused</button
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
      {#if review.catalog.issues.length}<details>
          <summary
            >Sources that need attention ({review.catalog.issues
              .length})</summary
          >{#each review.catalog.issues as issue}<p>
              {#if issue.project_id}<strong>{issueContext(issue)}</strong><br
                />{/if}{issue.message}
            </p>{/each}
        </details>{/if}
    {:else}
      <div class="actions">
        <button disabled={review.busy || review.unresolved} onclick={back}
          >← All tags</button
        ><button
          disabled={review.busy || review.unresolved || review.accessLost}
          onclick={review.load}>Refresh catalog</button
        >
      </div>
      <h3>Rename or merge <span class="literal">{review.source}</span></h3>
      <p class="hint">
        Choosing an existing name merges the two tags. Archived cards are
        included. Unrelated labels stay as they are.
      </p>
      <form
        class="create"
        onsubmit={(event) => {
          event.preventDefault();
          void review.inspect();
        }}
      >
        <label
          >Destination tag<input
            bind:value={review.target}
            list="tag-destinations"
            disabled={review.busy || review.unresolved || !!review.preview}
          /></label
        ><datalist id="tag-destinations"
          >{#each review.catalog.tags.filter((tag) => tag.name !== review.source) as tag}<option
              value={tag.name}
            ></option>{/each}</datalist
        ><button
          disabled={review.busy ||
            review.unresolved ||
            review.accessLost ||
            !review.target.trim() ||
            !!review.preview}>Preview changes</button
        >
      </form>
      {#if review.preview}
        <section aria-label="Tag change preview">
          <h3>
            {review.preview.changes.length} affected {review.preview.changes
              .length === 1
              ? "card"
              : "cards"}
          </h3>
          <p>
            {saved} saved · {ready} ready · {review.results.filter(
              (row) => row.state === "conflict" || row.state === "failed",
            ).length} need review
          </p>
          {#if !review.preview.complete}<p class="notice">
              Coverage is incomplete. Only the listed cards can be reviewed
              here; the source catalog name will be retained.
            </p>{/if}
          {#each review.preview.issues as issue}<p class="notice">
              {#if issue.project_id}<strong>{issueContext(issue)}</strong><br
                />{/if}{issue.message}
            </p>{/each}
          <ul class="results">
            {#each review.results as row, index}<li>
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
                    disabled={review.busy || review.accessLost}
                    onclick={() => review.apply(index)}
                    >Retry same card command</button
                  >{/if}
              </li>{/each}
          </ul>
          {#if review.operationFinished}<p class="notice" role="status">
              Tag change complete.
            </p>
          {:else}<div class="actions">
              {#if ready}<button
                  class="primary"
                  disabled={review.busy ||
                    review.unresolved ||
                    review.accessLost}
                  onclick={() => review.apply()}
                  >Apply to {ready} {ready === 1 ? "card" : "cards"}</button
                >{/if}{#if review.canFinish}<button
                  class="primary"
                  disabled={review.busy ||
                    review.unresolved ||
                    review.accessLost}
                  onclick={review.finish}>Finish catalog change</button
                >{/if}<button
                disabled={review.busy || review.unresolved || review.accessLost}
                onclick={review.restart}>Review new preview</button
              >
            </div>{/if}
          {#if !review.canFinish && !review.operationFinished}<p class="hint">
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
      >{review.busy
        ? "Working…"
        : review.unresolved
          ? "Command outcome needs checking"
          : "Changes use each card’s reviewed version"}</span
    ><button onclick={copyReview}>Copy review</button><button
      disabled={review.busy}
      onclick={close}>Close</button
    >
  </footer>
</dialog>

<style>
  dialog {
    width: min(880px, calc(100vw - 24px));
    max-height: 92dvh;
    padding: 0;
    border-radius: 14px;
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
