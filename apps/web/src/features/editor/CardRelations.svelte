<script lang="ts">
  import { onMount } from "svelte";
  import type { CardFields } from "./editor-draft";
  import {
    api,
    resourcePath,
    type Resource,
    type Summary,
  } from "../../lib/api/api";
  import { detailSummary } from "../../lib/resources/resource-summary";
  import { mapReads, isAbortError } from "../../lib/api/read-requests";
  import { searchRelations } from "./relation-search";
  import { subscribeSession } from "../../lib/api/session-events";

  let {
    fields = $bindable(),
    project,
    cardId,
    locked,
  }: {
    fields: CardFields;
    project: string;
    cardId?: string;
    locked: boolean;
  } = $props();
  let error = $state("");
  let choicesLoading = $state(false);
  let discoveryError = $state("");
  let relationRead: AbortController | undefined;
  let relationGeneration = 0;
  let relationIndex = $state<Record<string, Summary>>({});
  let choices = $state<Summary[]>([]);
  let choiceSearch = $state("");
  let choiceKind = $state("card");
  let searchRead: AbortController | undefined;
  let searchGeneration = 0;
  async function searchChoices() {
    searchRead?.abort();
    const controller = new AbortController();
    searchRead = controller;
    const generation = ++searchGeneration;
    const selectedKind = choiceKind,
      text = choiceSearch;
    try {
      const found = await searchRelations(
        project,
        selectedKind,
        text,
        cardId,
        controller.signal,
      );
      if (
        generation === searchGeneration &&
        selectedKind === choiceKind &&
        text === choiceSearch
      )
        choices = found;
    } catch (e) {
      if (generation === searchGeneration && !isAbortError(e))
        error = e instanceof Error ? e.message : String(e);
    }
  }
  async function loadProjectChoices() {
    relationRead?.abort();
    const controller = new AbortController();
    relationRead = controller;
    const current = ++relationGeneration;
    choicesLoading = true;
    discoveryError = "";
    const references: {
      type: Summary["type"];
      id: string;
      project_id: string;
    }[] = [...new Set(fields.dependencies)].map((id) => ({
      type: "card",
      id,
      project_id: project,
    }));
    if (fields.milestoneId)
      references.push({
        type: "milestone",
        id: fields.milestoneId,
        project_id: project,
      });
    try {
      const available = await mapReads(
        references,
        async (ref) => {
          try {
            const detail = await api<Resource>(
              resourcePath(ref),
              "GET",
              undefined,
              {},
              { signal: controller.signal },
            );
            return detailSummary(detail, project, ref.type);
          } catch (error) {
            if (isAbortError(error)) throw error;
            return null;
          }
        },
        controller.signal,
      );
      if (current !== relationGeneration) return;
      relationIndex = Object.fromEntries(
        available
          .filter((item): item is Summary => item !== null)
          .map((item) => [item.id, item]),
      );
      if (available.some((item) => !item))
        discoveryError = "Some related cards or milestones are unavailable.";
    } catch (error) {
      if (current === relationGeneration && !isAbortError(error))
        discoveryError = "Related card names could not be loaded.";
    } finally {
      if (current === relationGeneration) choicesLoading = false;
    }
  }
  onMount(() => {
    void loadProjectChoices();
    const stop = () => {
      relationGeneration++;
      relationRead?.abort();
      searchGeneration++;
      searchRead?.abort();
      relationIndex = {};
      choices = [];
    };
    const unsubscribe = subscribeSession({
      ended: stop,
      restored: () => void loadProjectChoices(),
    });
    return () => {
      stop();
      unsubscribe();
    };
  });
</script>

<fieldset>
  <legend>Connections and blockers</legend>
  <p class="field-title">Milestone</p>
  {#if discoveryError}<p class="hint">
      {discoveryError}
      <button
        type="button"
        disabled={locked || choicesLoading}
        onclick={loadProjectChoices}>Retry related names</button
      >
    </p>{/if}
  {#if fields.milestoneId}<div class="relation-row">
      <span
        >{relationIndex[fields.milestoneId]?.title ??
          (choicesLoading
            ? "Loading milestone…"
            : "Unavailable milestone")}</span
      ><button
        type="button"
        disabled={locked}
        onclick={() => (fields.milestoneId = "")}>Remove milestone</button
      >
    </div>
  {:else}<p class="empty-context">
      No milestone assigned. Find one by its title below.
    </p>{/if}
  <label
    >Blocked reason<textarea bind:value={fields.blockedReason} disabled={locked}
    ></textarea></label
  >
  <p class="field-title">Dependencies · must finish first</p>
  {#if !fields.dependencies.length}<p class="empty-context">
      No predecessor cards.
    </p>{/if}
  {#each fields.dependencies as id}<div class="relation-row">
      <span
        >{relationIndex[id]?.title ??
          (choicesLoading ? "Loading card…" : "Unavailable card")}</span
      ><button
        type="button"
        onclick={() =>
          (fields.dependencies = fields.dependencies.filter(
            (value) => value !== id,
          ))}
        aria-label={`Remove dependency ${relationIndex[id]?.title ?? id}`}
        disabled={locked}>Remove dependency</button
      >
    </div>{/each}
  <label
    >Search for<select bind:value={choiceKind} disabled={locked}
      ><option value="card">Dependency card</option><option value="milestone"
        >Milestone</option
      ></select
    ></label
  >
  <label
    >Find by title<input bind:value={choiceSearch} disabled={locked} /></label
  ><button
    type="button"
    onclick={searchChoices}
    disabled={!choiceSearch.trim() || locked}>Find resources</button
  >
  {#each choices as item}<button
      type="button"
      disabled={locked ||
        (item.type === "milestone"
          ? fields.milestoneId === item.id
          : fields.dependencies.includes(item.id))}
      onclick={() => {
        relationIndex = { ...relationIndex, [item.id]: item };
        if (item.type === "milestone") fields.milestoneId = item.id;
        else if (!fields.dependencies.includes(item.id))
          fields.dependencies = [...fields.dependencies, item.id];
      }}>{item.title}</button
    >{/each}
  <details>
    <summary>Connection identifiers</summary>
    <p class="empty-context">
      Technical identifiers for source-file inspection.
    </p>
    <p>Milestone: <code>{fields.milestoneId || "None"}</code></p>
    {#each fields.dependencies as id}<p>
        Dependency: <code>{id}</code>
      </p>{/each}
  </details>
</fieldset>
<details>
  <summary>Card lifecycle</summary><label
    ><input type="checkbox" bind:checked={fields.archived} disabled={locked} /> Archived</label
  >
  <p class="empty-context">
    Archived cards remain in the project and can be restored from the archive
    filter.
  </p>
</details>

{#if error}<p class="notice" role="alert">{error}</p>{/if}
