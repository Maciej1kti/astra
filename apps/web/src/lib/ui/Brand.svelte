<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<div class="brand" aria-label="Astra">
  <svg class="brandmark" viewBox="0 0 32 32" aria-hidden="true"
    ><path
      fill="currentColor"
      d="M16 2c3 0 3 5 4.6 7.4C23 13 30 12 30 16s-7 3-9.4 6.6C19 25 19 30 16 30s-3-5-4.6-7.4C9 19 2 20 2 16s7-3 9.4-6.6C13 7 13 2 16 2Z"
    /></svg
  >
  {#if !compact}<span>Astra</span>{/if}
</div>
