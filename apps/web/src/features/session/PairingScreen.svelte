<script lang="ts">
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
  <div class="brand"><span class="brandmark">lp</span> LOCAL PROJECTS</div>
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
      ><button class="primary" onclick={checkPairing} disabled={busy}
        >I approved this browser</button
      ><button class="quiet" onclick={onrestart}>Start again</button
      >{:else}<label
        >Device name<input bind:value={device} maxlength="120" /></label
      ><button
        class="primary"
        onclick={startPairing}
        disabled={busy || !device.trim()}>Request access <span>↗</span></button
      >
      <p class="small">
        Approval is required on the host. This app does not grant access from a
        link alone.
      </p>{/if}{#if error}<p class="notice" role="alert">{error}</p>{/if}
    <button onclick={ondiagnostics}>Host diagnostics</button>
  </section>
</main>

<style>
  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    line-height: 1.5;
  }
  .brandmark {
    background: var(--green);
    color: var(--accent);
    font-family: Georgia, serif;
    font-size: 28px;
    line-height: 42px;
    width: 42px;
    text-align: center;
    border-radius: 12px;
    letter-spacing: -3px;
    padding-right: 3px;
  }
  .welcome {
    max-width: 1040px;
    margin: 8vh auto;
    padding: 32px;
    position: relative;
  }
  .welcome > .eyebrow {
    margin-top: 90px;
  }
  .welcome h1 {
    font:
      normal clamp(42px, 5vw, 64px)/1.08 Georgia,
      serif;
    letter-spacing: -2px;
  }
  .lead {
    font-size: 18px;
    color: var(--muted);
    line-height: 1.7;
  }
  .pairbox {
    position: absolute;
    width: 380px;
    right: 32px;
    top: 155px;
    background: var(--paper);
    border: 1px solid var(--line);
    padding: 30px;
    border-radius: 18px;
  }
  .pairbox h2 {
    font-size: 21px;
  }
  .pairbox label {
    display: block;
  }
  .pairbox input {
    width: 100%;
    margin: 10px 0 18px;
  }
  .pairbox > .primary {
    width: 100%;
    margin: 12px 0;
  }
  .small {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.6;
  }
  .challenge {
    font-size: 25px;
    letter-spacing: 3px;
    background: var(--bg);
    padding: 16px;
    text-align: center;
    font-family: monospace;
  }
  .pairbox code {
    display: block;
    font-size: 11px;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }

  h1 {
    font:
      650 26px/1.25 Inter,
      ui-sans-serif,
      system-ui,
      sans-serif;
    letter-spacing: -0.5px;
    margin: 10px 0;
  }

  @media (max-width: 1100px) {
    h1 {
      font-size: 26px;
    }
    .pairbox {
      position: static;
      width: auto;
      max-width: 430px;
      margin-top: 36px;
    }
    .welcome > .eyebrow {
      margin-top: 45px;
    }
  }
  @media (max-width: 700px) {
    .welcome {
      padding: 24px;
      margin: 0;
    }
    .welcome h1 {
      font-size: 44px;
    }
    .pairbox {
      padding: 22px;
    }
    .welcome > .eyebrow {
      margin-top: 40px;
    }
  }

  @media (max-width: 700px) {
  }
</style>
