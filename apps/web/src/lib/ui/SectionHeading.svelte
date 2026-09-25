<script lang="ts">
  let {
    title,
    id,
    count,
  }: { title: string; id?: string; count?: string | number } = $props();
</script>

<div class="sectiontitle">
  <h2 {id}>{title}</h2>
  {#if count !== undefined}<span>{count}</span>{/if}
</div>
