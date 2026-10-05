<script lang="ts">
  import type { HistoryEntry } from "../../lib/contracts/api.generated";
  import {
    formatTimestamp,
    resourceLabel,
  } from "../../lib/resources/resource-presentation";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import type { EditorDraft } from "./editor-draft";
  import ReportFields from "./ReportFields.svelte";
  import { fieldLabel } from "./source-fields";

  /**
   * Explicitly submitted records: a milestone or a new report. Cards and
   * projects autosave through their own fields; a saved report is read-only.
   */
  let {
    draft = $bindable(),
    locked,
    saved,
    busy,
    accessLost,
    dirty,
    history,
    historyCursor,
    undoBlocked,
    onhistory,
    onundo,
  }: {
    draft: Extract<EditorDraft, { type: "milestone" | "update" }>;
    locked: boolean;
    saved: boolean;
    busy: boolean;
    accessLost: boolean;
    dirty: boolean;
    history: HistoryEntry[];
    historyCursor: string | null;
    /** The editor's own state prevents undoing any entry right now. */
    undoBlocked: boolean;
    onhistory: (more?: boolean) => void;
    onundo: (id: string) => void;
  } = $props();

  let preview = $state(false);
  const milestoneStatuses = ["planned", "active", "achieved", "cancelled"];
  const reportKinds = [
    "result",
    "blocker",
    "decision_needed",
    "note",
    "correction",
    "resolution",
  ];
</script>

{#if draft.type === "milestone"}<div class="editor-properties">
    <label
      >Status<select
        aria-label="Status"
        bind:value={draft.fields.status}
        disabled={locked}
        >{#each milestoneStatuses as item}<option value={item}
            >{resourceLabel(item)}</option
          >{/each}</select
      ></label
    >
  </div>{:else}<label
    >Rodzaj<select
      aria-label="Rodzaj"
      bind:value={draft.fields.kind}
      disabled={locked}
      >{#each reportKinds as item}<option value={item}
          >{resourceLabel(item)}</option
        >{/each}</select
    ></label
  >{/if}
<label class="description-label"
  >Opis <span>Źródło Markdown</span><textarea
    bind:value={draft.common.body}
    rows="8"
    disabled={locked}></textarea></label
>
<button type="button" onclick={() => (preview = !preview)}
  >{preview ? "Ukryj podgląd" : "Podgląd Markdown"}</button
>
{#if preview}<Markdown source={draft.common.body} />{/if}
{#if draft.type === "milestone"}<div class="row">
    <label
      >Termin<input
        type="date"
        bind:value={draft.fields.due}
        disabled={locked}
      /></label
    >
  </div>{:else}<label
    >Autor<input
      bind:value={draft.fields.author}
      required
      maxlength="120"
      disabled={locked}
    /></label
  ><ReportFields bind:fields={draft.fields} {locked} />{/if}
<details>
  <summary>Dodatkowe pola</summary>
  <p>
    Rozszerzenia techniczne i dowody raportu. Do zwykłych zmian używaj nazwanych
    pól powyżej. Serwer sprawdza każde pole.
  </p>
  <textarea
    aria-label="Dodatkowe pola JSON"
    bind:value={draft.common.advanced}
    rows="5"
    spellcheck="false"
    disabled={locked}></textarea>
</details>
{#if saved}<details>
    <summary>Historia zmian</summary><button
      type="button"
      onclick={() => onhistory()}
      disabled={busy || accessLost}>Pierwsza strona historii</button
    >{#if dirty}<p class="empty-context">
        Poczekaj na zapis zmian lub rozstrzygnij wersję roboczą przed cofnięciem
        zapisanej zmiany.
      </p>{/if}{#each history as entry}<div class="historyentry">
        <small
          ><time datetime={entry.recorded_at} title={entry.recorded_at}
            >{formatTimestamp(entry.recorded_at)}</time
          ></small
        >
        <p>{entry.changed_fields.map(fieldLabel).join(", ")}</p>
        <button
          type="button"
          disabled={undoBlocked || !entry.can_undo}
          onclick={() => onundo(entry.id)}>Cofnij tę zmianę</button
        >
      </div>{/each}{#if historyCursor}<button
        type="button"
        disabled={busy || accessLost}
        onclick={() => onhistory(true)}>Starsze zmiany</button
      >{/if}
  </details>{/if}
