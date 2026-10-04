<script lang="ts">
  import DialogHeader from "./DialogHeader.svelte";
  import Button from "./Button.svelte";
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

<dialog class="app-dialog" use:modal={{ onclose }} aria-label={title}>
  <DialogHeader {title} {onclose} />
  <div class="dialog-body">
    {#if error}
      <p role="alert">{error}</p>
    {:else}
      <p role="status">Loading…</p>
    {/if}
  </div>
  {#if error}
    <footer class="dialog-footer">
      <Button type="button" variant="primary" onclick={retry}
        >Retry loading</Button
      >
      <Button
        type="button"
        disabled={reloading}
        onclick={async () => {
          reloading = true;
          try {
            await reloadAfterPreloadFailure();
          } finally {
            reloading = false;
          }
        }}>{reloading ? "Reloading…" : "Reload app"}</Button
      >
    </footer>
  {/if}
</dialog>
