<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import { modal } from "../../lib/ui/dialog";
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
  use:modal
  aria-label="Choose project for card"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
>
  <DialogHeader title="Add card" {onclose} />
  <form
    class="dialog-body"
    onsubmit={(event) => {
      event.preventDefault();
      if (project) onselect(project);
    }}
  >
    <label
      >Project<select aria-label="Project" bind:value={project} required
        ><option value="" disabled>Choose a project</option
        >{#each projects as item}<option value={item.id}>{item.title}</option
          >{/each}</select
      ></label
    >
    <button class="primary" disabled={!project}>Continue</button>
  </form>
</dialog>
