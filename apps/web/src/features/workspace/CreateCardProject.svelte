<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import Button from "../../lib/ui/Button.svelte";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  let {
    projects,
    onselect,
    onclose,
  }: {
    projects: Summary[];
    onselect: (project: string) => void;
    onclose: () => void;
  } = $props();
  let project = $state("");
</script>

<dialog
  class="app-dialog dialog-small"
  use:modal={{ onclose }}
  out:layerExit|global
  aria-label="Wybierz projekt dla karty"
>
  <DialogHeader
    title="Dodaj kartę"
    {onclose}
    closeLabel="Zamknij wybór projektu"
  />
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      if (project) onselect(project);
    }}
  >
    <div class="dialog-body">
      <label
        >Projekt<select aria-label="Projekt" bind:value={project} required
          ><option value="" disabled>Wybierz projekt</option
          >{#each projects as item}<option value={item.id}>{item.title}</option
            >{/each}</select
        ></label
      >
    </div>
    <footer class="dialog-footer">
      <Button type="button" variant="quiet" onclick={onclose}>Anuluj</Button>
      <Button type="submit" variant="primary" disabled={!project}
        >Kontynuuj</Button
      >
    </footer>
  </form>
</dialog>

<style>
  label {
    display: grid;
    gap: var(--space-4);
  }
  select {
    width: 100%;
  }
</style>
