<script lang="ts">
  import { untrack } from "svelte";
  import type { Pending } from "../../lib/api/api";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { layerExit, modal } from "../../lib/ui/dialog";
  import type { ChartSummaryRow } from "./chart-model";
  import { defaultTileMetrics, tileMetrics } from "./chart-tiles";

  let {
    row,
    selection,
    busy,
    pending,
    conflict,
    error,
    onsave,
    onretry,
    oncheck,
    onreload,
    onopen,
    onclose,
  }: {
    row: ChartSummaryRow;
    /** The values the tile shows now. */
    selection: string[];
    busy: boolean;
    /** A save whose outcome is not known yet. */
    pending: Pending | null;
    /** The saved settings changed elsewhere; this choice cannot be saved. */
    conflict: boolean;
    error: string;
    onsave: (chosen: string[]) => void;
    onretry: () => void;
    oncheck: () => void;
    onreload: () => void;
    onopen: () => void;
    onclose: () => void;
  } = $props();

  let chosen = $state(untrack(() => [...selection]));
  const locked = $derived(busy || !!pending || conflict);
  const close = () => {
    if (!busy && !pending) onclose();
  };
</script>

<dialog
  class="app-dialog dialog-small"
  use:modal={{ onclose: close }}
  out:layerExit|global
  aria-label={`Wartości kafla: ${row.source.name}`}
>
  <DialogHeader
    title={row.source.name}
    description={row.source.card_title}
    onclose={close}
    disabled={busy || !!pending}
    closeLabel="Zamknij wybór wartości"
  />
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      if (!locked) onsave(chosen);
    }}
  >
    <div class="dialog-body">
      {#if error}<div class="notice" role="alert">{error}</div>{/if}
      {#if conflict}<div class="notice">
          <p role="alert">
            Ustawienia profilu zmieniły się w innym miejscu, więc tego wyboru
            nie można zapisać. Wczytaj aktualne ustawienia i wybierz ponownie.
          </p>
          <Button type="button" onclick={onreload} disabled={busy}
            >Wczytaj aktualne ustawienia</Button
          >
        </div>{/if}
      {#if pending && !conflict}<div class="notice">
          <p>Zapis czeka na potwierdzenie. Wybór pozostaje bez zmian.</p>
          <p>Żądanie: <code>{pending.requestId}</code></p>
          <div class="tile-actions">
            <Button type="button" onclick={oncheck} disabled={busy}
              >Sprawdź stan</Button
            >
            <Button type="button" onclick={onretry} disabled={busy}
              >Ponów to samo polecenie</Button
            >
          </div>
        </div>{/if}
      <fieldset disabled={locked}>
        <legend>Wartości na kaflu</legend>
        {#each tileMetrics as metric (metric.id)}
          <label
            ><input
              type="checkbox"
              value={metric.id}
              checked={chosen.includes(metric.id)}
              onchange={(event) => {
                chosen = event.currentTarget.checked
                  ? [...chosen, metric.id]
                  : chosen.filter((id) => id !== metric.id);
              }}
            /><span>{metric.label}<small>{metric.hint}</small></span></label
          >
        {/each}
      </fieldset>
      <div class="tile-actions">
        <Button
          type="button"
          variant="quiet"
          disabled={locked}
          onclick={() => (chosen = [...defaultTileMetrics])}
          >Przywróć domyślne</Button
        >
        <Button type="button" variant="quiet" disabled={locked} onclick={onopen}
          >Otwórz kartę licznika</Button
        >
      </div>
    </div>
    <footer class="dialog-footer">
      <Button
        type="button"
        variant="quiet"
        onclick={close}
        disabled={busy || !!pending}>Anuluj</Button
      >
      <Button type="submit" variant="primary" disabled={locked}>Zapisz</Button>
    </footer>
  </form>
</dialog>

<style>
  fieldset {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-4);
    font-weight: var(--weight-semibold);
  }
  label {
    display: flex;
    align-items: flex-start;
    gap: var(--space-5);
    min-height: var(--tap-target);
    padding-block: var(--space-2);
  }
  label small {
    display: block;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .tile-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-top: var(--space-6);
  }
</style>
