<script lang="ts">
  import AcceptanceChecklist from "../cards/AcceptanceChecklist.svelte";
  import TagPicker from "../tags/TagPicker.svelte";
  import type { CardFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
    acceptanceError = $bindable(),
    tagError = $bindable(),
  }: {
    fields: CardFields;
    locked: boolean;
    acceptanceError: string;
    tagError: string;
  } = $props();
</script>

<AcceptanceChecklist
  bind:items={fields.acceptance}
  bind:draft={fields.acceptanceDraft}
  bind:error={acceptanceError}
  disabled={locked}
/>
<TagPicker
  bind:labels={fields.labels}
  bind:draft={fields.tagDraft}
  bind:error={tagError}
  disabled={locked}
/>
<h3>Planning</h3>
<fieldset>
  <legend>Planned work · inclusive dates</legend>
  <div class="row">
    <label
      >Start<input
        type="date"
        bind:value={fields.start}
        disabled={locked}
      /></label
    ><label
      >End<input
        type="date"
        bind:value={fields.end}
        min={fields.start}
        disabled={locked}
      /></label
    >
  </div>
</fieldset>
