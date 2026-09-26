<script lang="ts">
  import TagPicker from "../tags/TagPicker.svelte";
  let {
    value = $bindable(""),
    draft = $bindable(""),
    disabled,
  }: { value?: string; draft?: string; disabled: boolean } = $props();
</script>

<TagPicker
  kind="folder"
  bind:labels={
    () => (value ? [value] : []), (labels) => (value = labels[0] ?? "")
  }
  bind:draft
  {disabled}
/>
