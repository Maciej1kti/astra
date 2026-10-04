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
  class="app-dialog"
  use:modal={{ onclose }}
  out:layerExit|global
  aria-label="Choose project for card"
>
  <DialogHeader
    title="Add card"
    {onclose}
    closeLabel="Close project selection"
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
        >Project<select aria-label="Project" bind:value={project} required
          ><option value="" disabled>Choose a project</option
          >{#each projects as item}<option value={item.id}>{item.title}</option
            >{/each}</select
        ></label
      >
    </div>
    <footer class="dialog-footer">
      <Button type="button" variant="quiet" onclick={onclose}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={!project}
        >Continue</Button
      >
    </footer>
  </form>
</dialog>
