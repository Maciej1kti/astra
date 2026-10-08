<script lang="ts" generics="Id extends string">
  import type { Snippet } from "svelte";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    label,
    name,
    options,
    value,
    inUse = false,
    onselect,
    preview,
  }: {
    label: string;
    /** The radio group's form name, unique within its dialog. */
    name: string;
    options: readonly { id: Id; label: string }[];
    value: Id;
    /** Marks the group whose choice is on screen now. */
    inUse?: boolean;
    onselect: (id: Id) => void;
    /** A decorative miniature drawn with the option's own values. */
    preview: Snippet<[Id]>;
  } = $props();
</script>

<div class="group" role="radiogroup" aria-labelledby="{name}-label">
  <h4>
    <span id="{name}-label">{label}</span>
    {#if inUse}<span class="badge" data-state="active">W użyciu</span>{/if}
  </h4>
  <div class="tiles">
    {#each options as option (option.id)}
      <label class="tile">
        <input
          type="radio"
          {name}
          value={option.id}
          checked={option.id === value}
          onchange={() => onselect(option.id)}
        />
        {@render preview(option.id)}
        <span class="tick"><Icon name="check" small /></span>
        <span class="tile-name">{option.label}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .group {
    --tile-min: 112px;
    --tiles-wrap: 500px;
    min-width: 0;
  }
  h4 {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--space-10);
    margin: 0 0 var(--space-4);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
  }
  /* A row of every option, or two columns once the row is narrower than
     --tiles-wrap: the huge product then makes 45% the smallest tile, so four
     options never wrap as three and one. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(
      auto-fit,
      minmax(
        max(var(--tile-min), min(45%, calc((var(--tiles-wrap) - 100%) * 999))),
        1fr
      )
    );
    gap: var(--space-5);
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-4) var(--space-4) var(--space-5);
    border: var(--stroke) solid var(--line);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .tile:hover {
    border-color: var(--line-strong);
  }
  .tile:has(input:checked) {
    border-color: var(--accent-ink);
    box-shadow: inset 0 0 0 var(--stroke) var(--accent-ink);
  }
  /* The radio covers its tile, so the whole tile is the target. */
  .tile input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }
  .tile:has(input:focus-visible) {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-offset);
  }
  .tile-name {
    min-width: 0;
    padding-inline: var(--space-2);
    color: var(--ink);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
  }
  /* The selection is marked by more than the outline's colour: a badge on
     the miniature's corner, which leaves the whole row to the name. */
  .tick {
    position: absolute;
    top: var(--space-6);
    right: var(--space-6);
    display: grid;
    place-items: center;
    width: var(--icon-size);
    height: var(--icon-size);
    border-radius: var(--radius-pill);
    background: var(--accent-ink);
    color: var(--paper);
    visibility: hidden;
  }
  .tile:has(input:checked) .tick {
    visibility: visible;
  }
</style>
