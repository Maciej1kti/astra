<script lang="ts">
  import DialogHeader from "./DialogHeader.svelte";
  import { modal } from "./dialog";
  import { reloadAfterPreloadFailure } from "./preload-recovery";

  let reloading = $state(false);

  let {
    title,
    error,
    retry,
    onclose,
  }: {
    title: string;
    error: string;
    retry: () => void;
    onclose: () => void;
  } = $props();
</script>

<dialog
  class="app-dialog"
  use:modal
  aria-label={title}
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
>
  <DialogHeader {title} {onclose} />
  <div class="dialog-body">
    {#if error}
      <p role="alert">{error}</p>
      <button onclick={retry}>Retry loading</button>
      <button
        disabled={reloading}
        onclick={async () => {
          reloading = true;
          try {
            await reloadAfterPreloadFailure();
          } finally {
            reloading = false;
          }
        }}>{reloading ? "Reloading…" : "Reload app"}</button
      >
    {:else}
      <p role="status">Loading…</p>
    {/if}
  </div>
</dialog>
