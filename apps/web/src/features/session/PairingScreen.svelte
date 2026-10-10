<script lang="ts">
  import { pairingLayers, revealLayers } from "../../lib/ui/motion-layers";
  import { stateLabel } from "../../lib/resources/state-presentation";
  import Brand from "../../lib/ui/Brand.svelte";

  import Button from "../../lib/ui/Button.svelte";

  import type { Pairing } from "../../lib/contracts/api.generated";
  import { onMount } from "svelte";
  import { subscribeSession } from "../../lib/api/session-events";
  import { modal, observeModals, retainedModals } from "../../lib/ui/dialog";

  let {
    pairing,
    loading,
    busy,
    error,
    device = $bindable(""),
    startPairing,
    checkPairing,
    onrestart,
    ondiagnostics,
    ondefaultuser,
  }: {
    pairing: Pairing | null;
    loading: boolean;
    busy: boolean;
    error: string;
    device: string;
    startPairing: () => void;
    checkPairing: () => void;
    onrestart: () => void;
    ondiagnostics: () => void;
    ondefaultuser?: () => void;
  } = $props();

  // Dialogs that outlive the session keep their drafts and commands. They are
  // modal, so pairing has to be offered in a layer above them.
  let retained = $state(retainedModals() > 0);
  let inspecting = $state(false);
  onMount(() => {
    const stop = observeModals(() => {
      retained = retainedModals() > 0;
      if (!retained) inspecting = false;
    });
    const unsubscribe = subscribeSession({
      reconnect: () => {
        inspecting = false;
      },
    });
    return () => {
      stop();
      unsubscribe();
    };
  });
  function primaryFocus(layer: HTMLDialogElement) {
    // Start on the action, not on a text field that would raise a keyboard.
    layer
      .querySelector<HTMLButtonElement>(".primary:not(:disabled)")
      ?.focus({ preventScroll: true });
    // A second Escape may close a modal natively; keep the state truthful.
    const closed = () => {
      if (!layer.open) inspecting = true;
    };
    layer.addEventListener("close", closed);
    return { destroy: () => layer.removeEventListener("close", closed) };
  }
</script>

{#snippet pairbox()}
  <section class="pairbox">
    <h2>{pairing ? "Zatwierdź tę przeglądarkę" : "Połącz przeglądarkę"}</h2>
    {#if loading}<p>Sprawdzanie połączenia…</p>{:else if pairing}<p>
        Porównaj ten kod na komputerze serwera:
      </p>
      <div class="challenge">{pairing.challenge}</div>
      <p>Status: <strong>{stateLabel(pairing.state)}</strong></p>
      <code
        >projectctl --socket /path/to/projectd.sock approve {pairing.id} --challenge
        "{pairing.challenge}"</code
      ><Button variant="primary" onclick={checkPairing} disabled={busy}
        >Przeglądarka została zatwierdzona</Button
      ><Button variant="quiet" onclick={onrestart}>Zacznij ponownie</Button
      >{:else}<label
        >Nazwa urządzenia<input bind:value={device} maxlength="120" /></label
      ><Button
        variant="primary"
        onclick={startPairing}
        disabled={busy || !device.trim()}>Poproś o dostęp</Button
      >
      <p class="small">
        Wymagane jest zatwierdzenie na serwerze. Sam link nie zapewnia dostępu
        do aplikacji.
      </p>{/if}{#if error}<p class="notice" role="alert">{error}</p>{/if}
    {#if error && ondefaultuser}<Button
        variant="quiet"
        onclick={ondefaultuser}
        disabled={loading || busy}>Użyj domyślnego użytkownika</Button
      >{/if}
    <button onclick={ondiagnostics}>Diagnostyka serwera</button>
    {#if retained}
      <p class="small">
        Otwarta praca została zachowana i wróci po połączeniu przeglądarki.
      </p>
      <Button variant="quiet" onclick={() => (inspecting = true)}
        >Pokaż zachowaną pracę</Button
      >
    {/if}
  </section>
{/snippet}

{#if !retained}
  <main class="welcome" use:revealLayers={pairingLayers}>
    <Brand />
    <h1>Jaśniejszy obraz<br />kolejnych kroków.</h1>
    <p class="lead">
      Cele, decyzje i postępy.<br />Połączone z folderami, których już używasz.
    </p>
    {@render pairbox()}
  </main>
{:else if !inspecting}
  <dialog
    class="app-dialog dialog-small pairing-layer"
    aria-label="Połącz przeglądarkę ponownie"
    use:modal={{ onclose: () => {}, foreground: true }}
    use:primaryFocus
  >
    <div class="dialog-body">{@render pairbox()}</div>
  </dialog>
{/if}

<style>
  .welcome {
    max-width: var(--reading-width);
    margin: var(--space-20) auto;
    padding: var(--space-12);
  }
  .welcome h1 {
    font-size: var(--text-display);
    letter-spacing: var(--tracking-tight);
    margin: var(--space-8) 0;
  }
  .lead {
    font-size: var(--text-lg);
    color: var(--muted);
  }
  .pairbox {
    max-width: var(--dialog-small);
    background: var(--paper);
    border: var(--stroke) solid var(--line);
    padding: var(--space-10);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-card);
    margin-top: var(--space-12);
  }
  .pairbox h2 {
    font-size: var(--text-xl);
    margin-top: 0;
  }
  .pairbox label {
    display: block;
  }
  .pairbox input {
    width: 100%;
    margin: var(--space-4) 0 var(--space-8);
  }
  .pairbox :global(> .primary) {
    width: 100%;
    margin: var(--space-6) 0;
  }
  .small {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .challenge {
    font-size: var(--text-title);
    background: var(--soft);
    padding: var(--space-8);
    text-align: center;
    font-family: var(--font-mono);
    border-radius: var(--radius-control);
  }
  .pairbox code {
    display: block;
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }
  .pairing-layer .pairbox {
    max-width: none;
    margin-top: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  @media (max-width: 700px) {
    .welcome {
      padding: var(--space-10);
      margin: 0;
    }
  }
</style>
