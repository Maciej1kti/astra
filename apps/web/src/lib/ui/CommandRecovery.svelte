<script lang="ts">
  import type { Pending } from "../api/api";

  /**
   * The original request ID with its two safe continuations. Checking reads the
   * recorded outcome; retrying resends the same identity and payload.
   */
  let {
    pending,
    busy = false,
    accessLost = false,
    label = "Żądanie",
    checkLabel = "Sprawdź stan",
    retryLabel = "Ponów to samo polecenie",
    oncheck,
    onretry,
  }: {
    pending: Pending | null;
    busy?: boolean;
    accessLost?: boolean;
    label?: string;
    checkLabel?: string;
    retryLabel?: string;
    oncheck?: () => void;
    onretry?: () => void;
  } = $props();
</script>

{#if pending}
  <p>{label}: <code>{pending.requestId}</code></p>
  <div class="row command-recovery">
    {#if oncheck}<button
        type="button"
        onclick={oncheck}
        disabled={busy || accessLost}>{checkLabel}</button
      >{/if}
    {#if onretry}<button
        type="button"
        onclick={onretry}
        disabled={busy || accessLost}>{retryLabel}</button
      >{/if}
  </div>
{/if}

<style>
  .command-recovery {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
</style>
