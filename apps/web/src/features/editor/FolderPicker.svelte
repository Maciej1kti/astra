<script lang="ts">
  import { onMount } from "svelte";
  import { all } from "../../lib/api/api";
  let { value = $bindable(), disabled }: { value: string; disabled: boolean } =
    $props();
  let folders = $state<string[]>([]);
  const id = $props.id();
  onMount(() => {
    const controller = new AbortController();
    void all<string>("/api/v1/views/folders?limit=200", {
      signal: controller.signal,
    })
      .then((items) => (folders = items))
      .catch(() => {});
    return () => controller.abort();
  });
</script>

<label
  >Folder<input
    aria-label="Folder"
    list={id}
    bind:value
    maxlength="48"
    placeholder="e.g. Work, Home, Hobby"
    {disabled}
  /></label
>
<datalist {id}
  >{#each folders as folder}<option value={folder}></option>{/each}</datalist
>
