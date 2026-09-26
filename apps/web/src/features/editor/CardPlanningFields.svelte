<script lang="ts">
  import AcceptanceChecklist from "../cards/AcceptanceChecklist.svelte";
  import TagPicker from "../tags/TagPicker.svelte";
  import type { CardFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
    acceptanceError = $bindable(),
    tagError = $bindable(),
    tagCatalogError = $bindable(),
    project,
  }: {
    fields: CardFields;
    locked: boolean;
    acceptanceError: string;
    tagError: string;
    tagCatalogError: string;
    project: string;
  } = $props();
</script>

<AcceptanceChecklist
  bind:items={fields.acceptance}
  bind:draft={fields.acceptanceDraft}
  bind:error={acceptanceError}
  messagesInHeader
  disabled={locked}
/>
<TagPicker
  {project}
  bind:labels={fields.labels}
  bind:draft={fields.tagDraft}
  bind:error={tagError}
  bind:catalogError={tagCatalogError}
  messagesInHeader
  disabled={locked}
/>
