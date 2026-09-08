<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { api, command, send, type Pending } from "./api";
  import { modal } from "./dialog";
  let {
    open = $bindable(false),
    onregistered,
  }: {
    open: boolean;
    onregistered: (project: string) => void | Promise<void>;
  } = $props();
  let busy = $state(false),
    error = $state("");
  type Root = { id: string; label: string; display_path: string };
  let roots = $state<Root[]>([]),
    root = $state(""),
    relative = $state(""),
    projectName = $state(""),
    tracked = $state(false),
    plan = $state<{
      plan_id: string;
      project_id: string;
      display_path: string;
      changes: { path: string; action: string; description: string }[];
      warnings: { message: string }[];
    } | null>(null);
  let browsing = $state(false),
    directoryReady = $state(false),
    directoryCursor = $state<string | null>(null),
    directoryPaged = $state(false);
  let browseGeneration = 0;
  let directories = $state<
    { name: string; relative_path: string; registered: boolean }[]
  >([]);
  let registrationPending = $state<Pending | null>(null),
    registrationJob = $state<string | null>(null);
  function message(value: unknown) {
    error = value instanceof Error ? value.message : String(value);
  }
  $effect(() => {
    if (open) untrack(() => void browseProjects());
  });
  onMount(() => {
    const ended = () => {
      browseGeneration++;
      roots = [];
      directories = [];
      directoryReady = false;
      open = false;
    };
    window.addEventListener("session-ended", ended);
    return () => {
      browseGeneration++;
      window.removeEventListener("session-ended", ended);
    };
  });
  async function browseProjects() {
    const generation = ++browseGeneration;
    if (registrationPending) {
      try {
        const found = (await api<{ items: Root[] }>("/api/v1/roots")).items;
        if (generation === browseGeneration && open) roots = found;
      } catch (e) {
        message(e);
      }
      return;
    }
    plan = null;
    projectName = "";
    directoryReady = false;
    error = "";
    try {
      const found = (await api<{ items: Root[] }>("/api/v1/roots")).items;
      if (generation !== browseGeneration || !open) return;
      roots = found;
      root = roots[0]?.id ?? "";
      relative = "";
      if (root) await browse("");
    } catch (e) {
      message(e);
    }
  }
  async function browse(path: string, cursor: string | null = null) {
    if (registrationPending || busy) return;
    const generation = ++browseGeneration,
      selectedRoot = root;
    relative = path;
    plan = null;
    directoryReady = false;
    browsing = true;
    directories = [];
    error = "";
    try {
      const page = await api<{
        items: typeof directories;
        next_cursor: string | null;
      }>(
        `/api/v1/roots/${selectedRoot}/directories?relative_path=${encodeURIComponent(path)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (generation !== browseGeneration) return;
      directories = page.items;
      directoryCursor = page.next_cursor;
      directoryPaged = !!cursor;
      directoryReady = true;
    } catch (e) {
      if (generation === browseGeneration) message(e);
    } finally {
      if (generation === browseGeneration) browsing = false;
    }
  }
  async function preview() {
    if (!directoryReady || browsing || registrationPending) return;
    busy = true;
    error = "";
    try {
      plan = await api("/api/v1/registration-plans", "POST", {
        root_id: root,
        relative_path: relative || ".",
        ...(projectName ? { name: projectName } : {}),
        git_mode: tracked ? "tracked" : "private",
      });
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
  async function register() {
    if (!plan) return;
    busy = true;
    try {
      if (!registrationJob) {
        registrationPending ??= command("/api/v1/registrations", "POST", {
          plan_id: plan.plan_id,
        });
        const result = await send(registrationPending);
        registrationJob = result.job_id ?? null;
        if (!registrationJob)
          throw new Error(
            "Registration result is pending. Retry the same request.",
          );
      }
      const job = await api<{ state: string }>(
        `/api/v1/jobs/${registrationJob}`,
      );
      if (job.state !== "done")
        throw new Error(
          `Registration is ${job.state}. Job: ${registrationJob}`,
        );
      const projectId = plan.project_id;
      open = false;
      registrationPending = null;
      registrationJob = null;
      await onregistered(projectId);
    } catch (e) {
      message(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}<div class="modalshade">
    <dialog
      use:modal
      class="modal"
      aria-label="Add project"
      oncancel={(e) => {
        e.preventDefault();
        if (!busy) open = false;
      }}
    >
      <header>
        <h2>Add a project</h2>
        <button
          onclick={() => (open = false)}
          aria-label="Close"
          disabled={busy}>✕</button
        >
      </header>
      <p>Choose the project folder on this host. Files stay in that folder.</p>
      {#if !roots.length}<p>
          No directories have been approved yet. On the host, run:
        </p>
        <code
          >projectctl --socket /path/to/projectd.sock add-root /absolute/path
          --label "Projects"</code
        >{:else}<label
          >Project folders<select
            bind:value={root}
            disabled={!!registrationPending || busy}
            onchange={() => browse("")}
            >{#each roots as r}<option value={r.id}>{r.label}</option
              >{/each}</select
          ></label
        >
        <p class="breadcrumb">
          {roots.find((r) => r.id === root)?.display_path}/{relative}
        </p>
        <button
          disabled={!relative || busy || !!registrationPending || browsing}
          onclick={() => browse(relative.split("/").slice(0, -1).join("/"))}
          >↑ Parent directory</button
        >
        <div class="directories">
          {#if browsing}<p role="status">Loading folders…</p>{/if}
          {#each directories as directory}<button
              disabled={busy || !!registrationPending || browsing}
              aria-label={`Open folder: ${directory.name}`}
              onclick={() => browse(directory.relative_path)}
              >▱ {directory.name}{directory.registered ? " · registered" : ""}
              <span>→</span></button
            >{:else}{#if directoryReady}<p>
                No subfolders here. You can select this folder.
              </p>{/if}{/each}
        </div>
        {#if directoryPaged}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative)}>First folder page</button
          >{/if}
        {#if directoryCursor}<button
            disabled={busy || browsing || !!registrationPending}
            onclick={() => browse(relative, directoryCursor)}
            >More folders</button
          >{/if}
        <label
          >Project name<input
            bind:value={projectName}
            disabled={!!registrationPending || busy}
            oninput={() => (plan = null)}
            placeholder="Use folder name"
          /></label
        ><label class="check"
          ><input
            type="checkbox"
            disabled={!!registrationPending || busy}
            bind:checked={tracked}
            onchange={() => (plan = null)}
          /> Track .project files in the project’s Git repository</label
        >{#if plan}<section class="notice">
            <strong>Selected folder</strong>
            <p class="breadcrumb">{plan.display_path}</p>
            <p>
              Add planning files in .project and project instructions in
              AGENTS.md. Existing content is preserved.
            </p>
            {#each plan.warnings as warning}<p>{warning.message}</p>{/each}
            <details>
              <summary>Files to update</summary>
              {#each plan.changes.filter((change) => change.action !== "no_change") as change}<p
                  class="breadcrumb"
                >
                  {change.path}
                </p>{/each}
            </details>
          </section>
          <button class="primary" onclick={register} disabled={busy}
            >{registrationJob
              ? "Check registration"
              : registrationPending
                ? "Retry same registration"
                : "Add selected project"}</button
          >{#if registrationPending}<p>
              Request: {registrationPending.requestId}
            </p>{/if}{:else}<button
            class="primary"
            onclick={preview}
            disabled={busy || browsing || !directoryReady}
            >Choose this folder</button
          >{/if}{/if}{#if error}<p class="notice">{error}</p>{/if}
    </dialog>
  </div>{/if}

<style>
  .modalshade {
    position: fixed;
    inset: 0;
    z-index: 25;
    background: #152d2860;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .modal {
    border: 1px solid var(--line);
    color: var(--ink);
    background: var(--paper);
    border-radius: 16px;
    padding: 28px;
    width: min(100%, 580px);
    max-height: 90vh;
    overflow: auto;
  }
  .modal header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .modal h2 {
    font:
      28px Georgia,
      serif;
  }
  .modal label {
    display: block;
    font-size: 12px;
    margin: 16px 0;
  }
  .modal input:not([type="checkbox"]),
  .modal select {
    display: block;
    width: 100%;
    margin-top: 8px;
  }
  .modal .check {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .directories {
    max-height: 180px;
    overflow: auto;
    margin: 10px 0;
  }
  .directories button {
    display: flex;
    width: 100%;
    text-align: left;
    justify-content: space-between;
    margin: 4px 0;
  }
  .breadcrumb {
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--muted);
  }
  .modal details {
    margin: 20px 0;
  }
  .modal code {
    display: block;
    font-size: 11px;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  @media (max-width: 760px) {
    .modalshade {
      padding: 10px;
    }
    .modal {
      padding: 20px;
    }
  }
</style>
