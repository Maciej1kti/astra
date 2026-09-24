<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { modal } from "../../lib/ui/dialog";
  import { api } from "../../lib/api/api";
  import { commandOperation } from "../../lib/api/command-operation.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import type {
    Job,
    ProjectTagRenamePlan,
    TagCatalog,
  } from "../../lib/contracts/api.generated";
  import {
    applyProjectTagRename,
    getProjectTags,
    planProjectTagRename,
  } from "../../lib/api/tags";
  import { catalogNameError } from "./tag-management";

  let {
    onclose,
    onchanged,
    projectNames = {},
    initialProject = "",
  }: {
    onclose: () => void;
    onchanged: () => void;
    projectNames?: Record<string, string>;
    initialProject?: string;
  } = $props();
  let project = $state(
    untrack(() => initialProject || Object.keys(projectNames)[0] || ""),
  );
  let catalog = $state<TagCatalog | null>(null);
  let source = $state("");
  let target = $state("");
  let plan = $state<ProjectTagRenamePlan | null>(null);
  let job = $state<Job | null>(null);
  let busy = $state(false);
  let error = $state("");
  let accessLost = $state(false);
  let active = true;
  const operation = commandOperation(() => !accessLost);
  const pending = $derived(operation.pending);
  const canClose = $derived(
    !busy &&
      ((!pending && !job) ||
        job?.state === "needs_review" ||
        job?.state === "failed"),
  );
  const targetError = $derived(
    target === source
      ? "Choose a different tag name."
      : target && catalog?.tags.some((tag) => tag.name === target)
        ? ""
        : target
          ? catalogNameError(target)
          : "",
  );

  async function load() {
    if (!project || pending || job) return;
    busy = true;
    error = "";
    plan = null;
    source = "";
    target = "";
    try {
      catalog = await getProjectTags(project);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }
  async function preview() {
    if (!source || !target || targetError || busy || !catalog?.complete) return;
    busy = true;
    error = "";
    try {
      plan = await planProjectTagRename(project, { source, target });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }
  async function poll(id: string) {
    try {
      const next = await api<Job>(
        `/api/v1/jobs/${id}`,
        "GET",
        undefined,
        {},
        { fresh: true },
      );
      if (!active) return;
      job = next;
      if (next.state === "done") {
        if (operation.phase === "accepted") operation.finishJob();
        plan = null;
        job = null;
        catalog = await getProjectTags(project);
        onchanged();
        window.dispatchEvent(new Event("tag-suggestions-changed"));
      } else if (next.state === "running") {
        setTimeout(() => {
          if (active) void poll(id);
        }, 600);
      } else {
        error =
          "The rename needs review. Check diagnostics before starting another change.";
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
  async function apply() {
    if (!plan || pending || busy || accessLost) return;
    operation.prepare(applyProjectTagRename(project, plan.plan_id));
    await retry();
  }
  async function retry() {
    if (!pending || busy || accessLost) return;
    busy = true;
    error = "";
    try {
      const result = await operation.retry();
      const id =
        result.kind === "accepted" ? result.jobId : result.reply.result.job_id;
      if (!id)
        throw new Error(
          "The rename outcome is unknown. Check the original command.",
        );
      await poll(id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ project, plan, pending, job }, null, 2),
      );
    } catch {
      error = "Clipboard access is unavailable.";
    }
  }
  onMount(() => {
    void load();
    const unsubscribe = subscribeSession({
      ended: () => {
        accessLost = true;
        error = "Session ended. Reconnect to check this command.";
      },
      restored: () => {
        accessLost = false;
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  });
</script>

<dialog
  class="app-dialog"
  use:modal
  aria-label="Manage project tags"
  oncancel={(event) => {
    if (!canClose) event.preventDefault();
  }}
>
  <header>
    <div>
      <h2>Project tags</h2>
      <p>Names used on cards in this project.</p>
    </div>
    <button
      aria-label="Close tag manager"
      disabled={!canClose}
      onclick={onclose}>✕</button
    >
  </header>
  <div class="dialog-body">
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
    <label for="tag-manager-project">Project</label>
    <select
      id="tag-manager-project"
      bind:value={project}
      disabled={busy || !!pending || !!job}
      onchange={() => void load()}
    >
      {#each Object.entries(projectNames) as [id, name]}<option value={id}
          >{name}</option
        >{/each}
    </select>
    {#if catalog}
      {#if !catalog.complete}<p class="notice">
          Some card sources could not be read. Rename is unavailable until they
          are fixed.
        </p>{/if}
      <ul class="tag-list" aria-label="Project tags">
        {#each catalog.tags as tag}<li>
            <strong>{tag.name}</strong>
            <small>{tag.usage} {tag.usage === 1 ? "card" : "cards"}</small>
            <button
              disabled={busy || !!pending || !!job || !catalog.complete}
              onclick={() => {
                source = tag.name;
                target = "";
                plan = null;
              }}>Rename / merge</button
            >
          </li>{:else}<li>
            No tags yet. Add a label to a card to create one.
          </li>{/each}
      </ul>
      {#if source}
        <h3>Rename or merge {source}</h3>
        <p>
          Archived cards are included. Choosing an existing tag merges them.
        </p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
        >
          <label
            >Destination tag <input
              bind:value={target}
              list="project-tag-names"
              disabled={busy || !!pending || !!job}
            /></label
          >
          <datalist id="project-tag-names"
            >{#each catalog.tags.filter((tag) => tag.name !== source) as tag}<option
                value={tag.name}
              ></option>{/each}</datalist
          >
          {#if targetError}<p class="notice">{targetError}</p>{/if}
          <button
            disabled={busy ||
              !!pending ||
              !!job ||
              !target ||
              !!targetError ||
              !catalog.complete}>Preview changes</button
          >
        </form>
      {/if}
      {#if plan}
        <section aria-label="Tag rename preview">
          <h3>
            {plan.changes.length} affected {plan.changes.length === 1
              ? "card"
              : "cards"}
          </h3>
          <ul>
            {#each plan.changes as change}<li>{change.title}</li>{/each}
          </ul>
          <button
            class="primary"
            disabled={busy || !!pending || !!job || accessLost}
            onclick={() => void apply()}>Rename in this project</button
          >
        </section>
      {/if}
      {#if job}<p role="status">
          Rename: {job.state} ({job.completed_steps}/{job.total_steps})
        </p>{/if}
      {#if pending}<p role="status">Command ID: {pending.requestId}</p>
        <button disabled={busy || accessLost} onclick={() => void retry()}
          >Retry same command</button
        >{/if}
    {:else if busy}<p role="status">Loading tags…</p>{/if}
  </div>
  <footer>
    <button disabled={busy || !!pending || !!job} onclick={() => void load()}
      >Refresh</button
    ><button onclick={() => void copy()}>Copy details</button><button
      disabled={!canClose}
      onclick={onclose}>Close</button
    >
  </footer>
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 24px));
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
  }
  h2,
  header p {
    margin: 0;
  }
  header p,
  small {
    color: var(--muted);
  }
  .dialog-body {
    overflow-y: auto;
    max-height: calc(92dvh - 160px);
    padding: 20px;
  }
  label {
    display: grid;
    gap: 7px;
    margin-bottom: 12px;
  }
  select,
  input {
    width: 100%;
  }
  .tag-list {
    padding: 0;
    list-style: none;
  }
  .tag-list li {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .tag-list li button {
    margin-left: auto;
  }
  .notice {
    padding: 10px;
  }
</style>
