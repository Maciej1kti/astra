<script lang="ts">
  import { revealLayers } from "../../lib/ui/motion-layers";
  import Button from "../../lib/ui/Button.svelte";
  import OrderVisibilityList from "../../lib/ui/OrderVisibilityList.svelte";
  import { viewLabel } from "./navigation";
  import {
    defaultNavigationLayout,
    type NavigationLayout,
  } from "./navigation-layout";

  let {
    layout,
    stored,
    onsave,
  }: {
    layout: NavigationLayout;
    stored: boolean;
    onsave: (next: NavigationLayout) => void;
  } = $props();
  let open = $state(false);
  let announcement = $state("");
  function toggle(item: NavigationLayout["order"][number]) {
    const showing = !layout.visible.includes(item);
    onsave({
      order: layout.order,
      visible: layout.order.filter((value) =>
        value === item ? showing : layout.visible.includes(value),
      ),
    });
    announcement = `${viewLabel(item)} ${showing ? "na pasku" : "poza paskiem"} nawigacji.`;
  }
  // Each opening lets the rows enter in turn. The panel is repositioned for
  // its new height first, so the rows are measured where they will be shown;
  // the disclosure's own soft reveal covers that one frame.
  let opened = $state(0);
  const rows = [
    { selector: ".layout-order > li", role: "detail", delay: 60, stagger: 36 },
  ] as const;
</script>

<details
  class="navigation-customization"
  use:revealLayers={{
    key: String(opened),
    ready: open && opened > 0,
    layers: rows,
  }}
  ontoggle={(event) => {
    open = event.currentTarget.open;
    if (open) requestAnimationFrame(() => (opened += 1));
  }}
>
  <summary>Dostosuj nawigację</summary>
  {#if open}
    <p class="navigation-hint">
      Przeciągnij uchwyt, aby ułożyć skróty na dolnym pasku.
    </p>
    <OrderVisibilityList
      order={layout.order}
      label={viewLabel}
      shown={(item) => layout.visible.includes(item)}
      onmove={(order) =>
        onsave({
          order,
          visible: order.filter((item) => layout.visible.includes(item)),
        })}
      ontoggle={toggle}
      ariaLabel="Kolejność nawigacji"
      visibilityLabel={(item) => `Pokaż ${viewLabel(item)} na pasku nawigacji`}
      visibilityTitle={(item) =>
        `${layout.visible.includes(item) ? "Ukryj" : "Pokaż"} ${viewLabel(item)} na pasku nawigacji`}
      rowAttribute="data-navigation-item"
      handleAttribute="data-navigation-handle"
      bind:announcement
    />
    <p class="navigation-hint">
      {stored
        ? "Zapisano w tej przeglądarce."
        : "Pamięć przeglądarki jest niedostępna. Te ustawienia pozostaną do odświeżenia strony."}
    </p>
    <Button
      type="button"
      variant="quiet"
      onclick={() => {
        onsave(defaultNavigationLayout());
        announcement = "Przywrócono domyślną nawigację: Focus i Projekty.";
      }}>Przywróć nawigację</Button
    >
  {/if}
</details>
