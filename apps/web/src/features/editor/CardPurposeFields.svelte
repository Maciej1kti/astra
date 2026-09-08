<script lang="ts">
  import type { CardFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
  }: { fields: CardFields; locked: boolean } = $props();
</script>

<label class="description-label"
  >Expected result <span>What should this card deliver?</span><textarea
    bind:value={fields.expectedResult}
    rows="3"
    disabled={locked}></textarea></label
>
<label
  >Owner <span>Optional display name</span><input
    bind:value={fields.owner}
    disabled={locked}
    placeholder="Who is responsible?"
  /></label
>
