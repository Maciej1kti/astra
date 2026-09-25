<script lang="ts">
  import Brand from "../../lib/ui/Brand.svelte";

  import Button from "../../lib/ui/Button.svelte";

  import type { Pairing } from "../../lib/contracts/api.generated";

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
  } = $props();
</script>

<main class="welcome">
  <Brand />
  <p class="eyebrow">Your work, on your own machine</p>
  <h1>A clearer view<br />of what’s next.</h1>
  <p class="lead">
    Projects, decisions and progress.<br />Connected to the folders you already
    use.
  </p>
  <section class="pairbox">
    <h2>{pairing ? "Approve this browser" : "Connect your browser"}</h2>
    {#if loading}<p>Checking connection…</p>{:else if pairing}<p>
        Compare this challenge on the host machine:
      </p>
      <div class="challenge">{pairing.challenge}</div>
      <p>Status: <strong>{pairing.state}</strong></p>
      <code
        >projectctl --socket /path/to/projectd.sock approve {pairing.id} --challenge
        "{pairing.challenge}"</code
      ><Button variant="primary" onclick={checkPairing} disabled={busy}
        >I approved this browser</Button
      ><Button variant="quiet" onclick={onrestart}>Start again</Button
      >{:else}<label
        >Device name<input bind:value={device} maxlength="120" /></label
      ><Button
        variant="primary"
        onclick={startPairing}
        disabled={busy || !device.trim()}>Request access <span>↗</span></Button
      >
      <p class="small">
        Approval is required on the host. This app does not grant access from a
        link alone.
      </p>{/if}{#if error}<p class="notice" role="alert">{error}</p>{/if}
    <button onclick={ondiagnostics}>Host diagnostics</button>
  </section>
</main>

<style>
  .welcome {
    max-width: var(--reading-width);
    margin: var(--space-20) auto;
    padding: var(--space-12);
  }
  .welcome > .eyebrow {
    margin-top: var(--space-16);
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
    font-size: var(--text-section);
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
  @media (max-width: 700px) {
    .welcome {
      padding: var(--space-10);
      margin: 0;
    }
  }
</style>
