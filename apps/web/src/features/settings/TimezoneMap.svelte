<script lang="ts">
  import {
    cities,
    landDots,
    mapNorth,
    mapPoint,
    mapSouth,
    mapStep,
    nearestCity,
    zoneOffset,
  } from "./timezone-map";

  /**
   * The world with the chosen zone's hours marked. Choosing a place on it is a
   * shortcut for pointer users; the field beside it remains the control.
   */
  let {
    zone,
    now,
    available,
    disabled = false,
    onpick,
  }: {
    zone: string;
    now: Date;
    available: (zone: string) => boolean;
    disabled?: boolean;
    onpick: (zone: string) => void;
  } = $props();

  const width = 360;
  const height = mapNorth - mapSouth;
  const dots = landDots();
  const places = $derived(
    cities
      .filter(([name]) => available(name))
      .map(([name, latitude, longitude]) => ({
        name,
        ...mapPoint(latitude, longitude),
      })),
  );
  const offset = $derived(zoneOffset(zone, now));
  // The band of hours the zone keeps now: fifteen degrees to the hour.
  const band = $derived(
    offset === null ? null : width / 2 + offset / 4 - mapStep * 1.5,
  );
  const inBand = (x: number) =>
    band !== null && (((x - band) % width) + width) % width < mapStep * 3;
  const chosen = $derived(places.find((place) => place.name === zone));

  function pick(event: MouseEvent & { currentTarget: SVGSVGElement }) {
    if (disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const found = nearestCity(
      {
        x: ((event.clientX - bounds.left) / bounds.width) * width,
        y: ((event.clientY - bounds.top) / bounds.height) * height,
      },
      available,
    );
    if (found) onpick(found);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg
  class="timezone-map"
  class:disabled
  viewBox={`0 0 ${width} ${height}`}
  role="img"
  aria-label="Mapa świata z zaznaczoną strefą czasową"
  onclick={pick}
>
  {#if band !== null}
    <rect class="band" x={band} y="0" width={mapStep * 3} {height} />
    {#if band < 0}<rect
        class="band"
        x={band + width}
        y="0"
        width={mapStep * 3}
        {height}
      />{/if}
    {#if band + mapStep * 3 > width}<rect
        class="band"
        x={band - width}
        y="0"
        width={mapStep * 3}
        {height}
      />{/if}
  {/if}
  {#each dots as dot}<circle
      class="land"
      class:lit={inBand(dot.x)}
      cx={dot.x}
      cy={dot.y}
      r="1.7"
    />{/each}
  {#each places as place}<circle class="place" cx={place.x} cy={place.y} r="1.1"
      ><title>{place.name}</title></circle
    >{/each}
  {#if chosen}
    <circle class="halo" cx={chosen.x} cy={chosen.y} r="6" />
    <circle class="chosen" cx={chosen.x} cy={chosen.y} r="2.6" />
  {/if}
</svg>

<style>
  .timezone-map {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius-control);
    background: var(--soft);
    cursor: crosshair;
  }
  .timezone-map.disabled {
    cursor: default;
    opacity: var(--pending-opacity);
  }
  .band {
    fill: var(--accent);
  }
  .land {
    fill: var(--line-strong);
  }
  .land.lit {
    fill: var(--accent-ink);
  }
  .place {
    fill: var(--ink);
  }
  .halo {
    fill: none;
    stroke: var(--accent-ink);
    stroke-width: 1;
  }
  .chosen {
    fill: var(--accent-ink);
    stroke: var(--paper);
    stroke-width: 1;
  }
  @media (prefers-reduced-motion: no-preference) {
    .band {
      transition: x var(--motion-enter) var(--motion-ease);
    }
  }
</style>
