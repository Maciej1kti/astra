<script lang="ts">
  // The miniatures below draw from every palette and character.
  import "../../styles/appearance-sets.css";
  import ChoiceTiles from "./ChoiceTiles.svelte";
  import {
    applyHand,
    applyTheme,
    character,
    darkPalette,
    lightPalette,
    readHand,
    readTheme,
    type Hand,
    type Theme,
  } from "./appearance-choices";

  const themes: { id: Theme; label: string }[] = [
    { id: "system", label: "Systemowy" },
    { id: "light", label: "Jasny" },
    { id: "dark", label: "Ciemny" },
  ];
  let theme = $state<Theme>(readTheme());
  let hand = $state<Hand>(readHand());
  let light = $state(lightPalette.read());
  let dark = $state(darkPalette.read());
  let shape = $state(character.read());

  // Only one palette is on screen at a time; the other waits for its scheme.
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  let prefersDark = $state(systemDark.matches);
  $effect(() => {
    const update = () => (prefersDark = systemDark.matches);
    systemDark.addEventListener("change", update);
    return () => systemDark.removeEventListener("change", update);
  });
  const scheme = $derived(
    theme === "system" ? (prefersDark ? "dark" : "light") : theme,
  );
</script>

<!-- A small picture of the workspace. data-scheme resolves every colour for
     that scheme; a palette's attribute beside it replaces the chosen one. -->
{#snippet scene(side: "light" | "dark", palette?: string)}
  <span
    class="scene"
    data-scheme={side}
    data-light={side === "light" ? palette : undefined}
    data-dark={side === "dark" ? palette : undefined}
  >
    <span class="scene-side"><span class="scene-mark"></span></span>
    <span class="scene-page">
      <span class="scene-title"></span>
      <span class="scene-card"></span>
      <span class="scene-card short"></span>
    </span>
  </span>
{/snippet}
{#snippet themePreview(id: Theme)}
  <span class="preview" aria-hidden="true">
    {#if id !== "dark"}{@render scene("light")}{/if}
    {#if id !== "light"}{@render scene("dark")}{/if}
  </span>
{/snippet}
{#snippet lightPreview(id: string)}
  <span class="preview" aria-hidden="true">{@render scene("light", id)}</span>
{/snippet}
{#snippet darkPreview(id: string)}
  <span class="preview" aria-hidden="true">{@render scene("dark", id)}</span>
{/snippet}
<!-- data-character redeclares corners, shadows and typefaces for the miniature. -->
{#snippet shapePreview(id: string)}
  <span class="preview shape" data-character={id} aria-hidden="true">
    <span class="shape-card">
      <span class="shape-title">Aa</span>
      <span class="shape-button"></span>
    </span>
  </span>
{/snippet}

<div class="appearance-settings">
  <ChoiceTiles
    label="Motyw"
    name="appearance-theme"
    options={themes}
    value={theme}
    onselect={(id) => applyTheme((theme = id))}
    preview={themePreview}
  />
  <ChoiceTiles
    label="Kolory jasne"
    name="appearance-light"
    options={lightPalette.options}
    value={light}
    inUse={scheme === "light"}
    onselect={(id) => lightPalette.apply((light = id))}
    preview={lightPreview}
  />
  <ChoiceTiles
    label="Kolory ciemne"
    name="appearance-dark"
    options={darkPalette.options}
    value={dark}
    inUse={scheme === "dark"}
    onselect={(id) => darkPalette.apply((dark = id))}
    preview={darkPreview}
  />
  <ChoiceTiles
    label="Charakter"
    name="appearance-character"
    options={character.options}
    value={shape}
    onselect={(id) => character.apply((shape = id))}
    preview={shapePreview}
  />
  <label
    >Przycisk dodawania na telefonie<select
      aria-label="Przycisk dodawania na telefonie"
      bind:value={hand}
      onchange={() => applyHand(hand)}
      ><option value="right">Po prawej (dla praworęcznych)</option><option
        value="left">Po lewej (dla leworęcznych)</option
      ></select
    ></label
  >
</div>

<style>
  .appearance-settings {
    display: grid;
    gap: var(--space-9);
    min-width: 0;
  }
  .preview {
    display: flex;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-sm);
  }
  .scene {
    flex: 1;
    display: flex;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3);
    background: var(--bg);
  }
  .scene-side {
    flex: none;
    width: 22%;
    padding: var(--space-2);
    border-radius: var(--space-2);
    background: var(--paper);
  }
  /* The accent, where the sidebar marks the selected view. */
  .scene-mark {
    display: block;
    height: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent-ink);
  }
  .scene-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--space-2);
    background: var(--paper);
  }
  .scene-title {
    width: 45%;
    height: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--ink);
  }
  .scene-card {
    flex: 1;
    border-radius: var(--space-1);
    background: var(--accent);
  }
  .scene-card.short {
    width: 70%;
    background: var(--soft);
  }
  /* Half of each: the system decides which is shown. */
  .scene + .scene .scene-side {
    display: none;
  }

  .shape {
    align-items: center;
    padding: var(--space-5);
    background: var(--bg);
  }
  .shape-card {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--paper);
    box-shadow: var(--shadow-card);
  }
  .shape-title {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  }
  .shape-button {
    width: var(--space-11);
    height: var(--space-9);
    border-radius: var(--radius-sm);
    background: var(--primary);
  }

  label {
    display: block;
    min-width: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }
  select {
    width: 100%;
    margin-top: var(--space-3);
    color: var(--ink);
    font-size: var(--text-base);
  }
</style>
