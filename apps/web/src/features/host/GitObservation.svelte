<script lang="ts">
  import { serverMessage } from "../../lib/api/messages";
  import { errorMessage } from "../../lib/api/messages.ts";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { onMount } from "svelte";
  import { api, apiCode } from "../../lib/api/api";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import {
    publishRepository,
    readRepository,
    repositoryLink,
    repositoryStatus,
  } from "../../lib/api/repository.ts";
  import type { ProjectRepository } from "../../lib/contracts/api.generated";

  let { project, onclose }: { project: string; onclose: () => void } = $props();
  type Observation = {
    branch: string | null;
    commit: string | null;
    observed_at: string;
    stale: boolean;
    error: string | null;
    staged_paths: number | null;
    conflicted_paths: number | null;
  };
  let data = $state<Observation | null>(null);
  let busy = $state(false);
  let error = $state("");
  let generation = 0;
  async function load() {
    const current = ++generation;
    busy = true;
    error = "";
    try {
      const result = await api<Observation>(`/api/v1/projects/${project}/git`);
      if (current === generation) data = result;
    } catch (e) {
      if (current === generation) {
        data = null;
        error = errorMessage(e);
      }
    } finally {
      if (current === generation) busy = false;
    }
  }
  // False once the host answers that it does not publish repositories.
  let github = $state(true);
  let repository = $state<ProjectRepository | null>(null);
  let publishing = $state(false);
  let repositoryError = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Read the repository, or start a publication, and follow it to its end. */
  async function follow(start: boolean) {
    const current = generation;
    publishing = true;
    repositoryError = "";
    try {
      let state = start
        ? await publishRepository(project)
        : await readRepository(project, { fresh: true });
      while (current === generation) {
        repository = state;
        if (state.state !== "publishing") break;
        await new Promise((resolve) => (timer = setTimeout(resolve, 700)));
        state = await readRepository(project, { fresh: true });
      }
    } catch (e) {
      if (current !== generation) return;
      if (apiCode(e) === "GITHUB_DISABLED") github = false;
      else repositoryError = errorMessage(e);
    } finally {
      if (current === generation) publishing = false;
    }
  }
  const link = $derived(repositoryLink(repository));
  onMount(() => {
    void load();
    void follow(false);
    const ended = () => {
      generation++;
      data = null;
      busy = false;
      publishing = false;
      error = "Sesja wygasła. Połącz się ponownie, aby sprawdzić Git.";
    };
    const unsubscribeSession = subscribeSession({ ended: ended });
    return () => {
      generation++;
      clearTimeout(timer);
      unsubscribeSession();
    };
  });
</script>

<dialog
  class="app-dialog"
  use:modal={{ onclose }}
  out:layerExit|global
  aria-label="Stan repozytorium Git"
>
  <DialogHeader
    title="Stan repozytorium Git"
    {onclose}
    closeLabel="Zamknij stan Git"
  />
  <div class="dialog-body">
    <p>
      Tylko HEAD i pliki przygotowane do commita. Zmiany w katalogu roboczym i
      nieśledzone pliki nie są sprawdzane.
    </p>
    <button onclick={load} disabled={busy}
      >{busy ? "Sprawdzanie…" : "Sprawdź ponownie"}</button
    >
    {#if error}<p role="alert">{error}</p>{/if}
    {#if data}
      {#if data.stale}<p role="status">
          Stan niedostępny: {serverMessage(data.error ?? "GIT_UNAVAILABLE")}
        </p>
      {:else}<dl>
          <dt>Gałąź</dt>
          <dd>{data.branch ?? "Odłączony HEAD"}</dd>
          <dt>Commit</dt>
          <dd><code>{data.commit ?? "Brak commitów"}</code></dd>
          <dt>Przygotowane ścieżki</dt>
          <dd>{data.staged_paths}</dd>
          <dt>Ścieżki z konfliktami</dt>
          <dd>{data.conflicted_paths}</dd>
        </dl>{/if}
      <small
        >Sprawdzono {formatTimestamp(data.observed_at)}. Liczby nie obejmują
        plików .project.</small
      >
    {/if}
    {#if github}<section class="repository" aria-labelledby="github-title">
        <h3 id="github-title">GitHub</h3>
        {#if repository}<p role="status">
            {repositoryStatus(repository)}
            {#if repository.state === "failed"}{serverMessage(
                repository.error ?? "GITHUB_UNAVAILABLE",
              )}{/if}
          </p>
          {#if link}<p>
              <a href={link} target="_blank" rel="noopener noreferrer">{link}</a
              >
            </p>{:else if repository.url}<p>
              <code>{repository.url}</code>
            </p>{/if}
          {#if repository.state !== "published"}<button
              onclick={() => follow(true)}
              disabled={publishing}
              >{publishing
                ? "Publikowanie…"
                : repository.state === "failed"
                  ? "Ponów publikację"
                  : "Opublikuj jako prywatne repozytorium"}</button
            >{/if}
        {:else if publishing}<p role="status">Sprawdzanie GitHuba…</p>{/if}
        {#if repositoryError}<p role="alert">{repositoryError}</p>{/if}
      </section>{/if}
  </div>
</dialog>

<style>
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-6);
    padding: var(--space-8);
    background: var(--soft);
    border-radius: var(--radius-control);
  }
  .repository {
    margin-top: var(--space-9);
  }
  .repository a,
  .repository code {
    overflow-wrap: anywhere;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  dt,
  small {
    color: var(--muted);
    font-size: var(--text-base);
  }
</style>
