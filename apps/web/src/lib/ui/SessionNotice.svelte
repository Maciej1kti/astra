<script lang="ts">
  import { publishSession } from "../api/session-events";

  /** Shown by owners of retained work while the session is lost. */
  let { lost, message }: { lost: boolean; message: string } = $props();
</script>

{#if lost}<div class="notice session-notice">
    <p role="alert">{message}</p>
    <button type="button" onclick={() => publishSession("reconnect")}
      >Połącz ponownie</button
    >
  </div>{/if}

<style>
  .session-notice {
    margin: var(--space-6) 0;
  }
  .session-notice p {
    margin: 0 0 var(--space-4);
  }
</style>
