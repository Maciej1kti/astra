<script lang="ts">
  import type { ReportFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
  }: { fields: ReportFields; locked: boolean } = $props();
</script>

<fieldset disabled={locked}>
  <legend>Szczegóły raportu</legend>
  <label
    >Typ obiektu<select bind:value={fields.targetType}
      ><option value="project">Cel</option><option value="milestone"
        >Kamień milowy</option
      ></select
    ></label
  >
  {#if fields.targetType !== "project"}<label
      >Identyfikator obiektu<input
        bind:value={fields.targetId}
        required
      /></label
    >{/if}
  {#if fields.kind === "resolution"}<label
      >Identyfikatory rozstrzygniętych raportów, rozdzielone przecinkami<input
        bind:value={fields.resolves}
        required
      /></label
    >{/if}
  {#if fields.kind === "correction"}<label
      >Identyfikator poprawianego raportu<input
        bind:value={fields.supersedes}
        required
      /></label
    >{/if}
</fieldset>
