<script lang="ts">
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
    announcement = `${viewLabel(item)} ${showing ? "shown on" : "removed from"} the navigation bar.`;
  }
</script>

<details
  class="navigation-customization"
  ontoggle={(event) => {
    open = event.currentTarget.open;
  }}
>
  <summary>Customize navigation</summary>
  {#if open}
    <p class="navigation-hint">
      Drag a handle to arrange shortcuts for the bottom bar.
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
      ariaLabel="Navigation order"
      visibilityLabel={(item) => `Show ${viewLabel(item)} on navigation bar`}
      visibilityTitle={(item) =>
        `${layout.visible.includes(item) ? "Hide" : "Show"} ${viewLabel(item)} on navigation bar`}
      rowAttribute="data-navigation-item"
      handleAttribute="data-navigation-handle"
      bind:announcement
    />
    <p class="navigation-hint">
      {stored
        ? "Saved in this browser."
        : "Browser storage is unavailable. These settings last until reload."}
    </p>
    <Button
      type="button"
      variant="quiet"
      onclick={() => {
        onsave(defaultNavigationLayout());
        announcement = "Default navigation restored: Focus and Projects.";
      }}>Reset navigation</Button
    >
  {/if}
</details>
