<script lang="ts">
  import type { ReportFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
  }: { fields: ReportFields; locked: boolean } = $props();
</script>

<fieldset disabled={locked}>
  <legend>Report details</legend>
  <label
    >Target type<select bind:value={fields.targetType}
      ><option value="project">Project</option><option value="card">Card</option
      ><option value="milestone">Milestone</option></select
    ></label
  >
  {#if fields.targetType !== "project"}<label
      >Target ID<input bind:value={fields.targetId} required /></label
    >{/if}
  {#if fields.kind === "resolution"}<label
      >Resolved report IDs, separated by commas<input
        bind:value={fields.resolves}
        required
      /></label
    >{/if}
  {#if fields.kind === "correction"}<label
      >Corrected report ID<input
        bind:value={fields.supersedes}
        required
      /></label
    >{/if}
</fieldset>
