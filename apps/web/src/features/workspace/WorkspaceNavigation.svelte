<script lang="ts">
  import { navigationMotion } from "../../lib/ui/motion";
  import Icon from "../../lib/ui/Icon.svelte";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";

  import { onMount, tick } from "svelte";
  import { viewLabel, type View } from "./navigation";
  import {
    defaultNavigationLayout,
    moveNavigationItem,
    readNavigationLayout,
    writeNavigationLayout,
    type NavigationLayout,
  } from "./navigation-layout";

  let {
    view,
    connected,
    logout,
    onchange,
  }: {
    view: View;
    connected: boolean;
    logout: () => void;
    onchange: (view: View) => void;
  } = $props();
  let navElement = $state<HTMLElement>();
  let layout = $state(readNavigationLayout());
  let mobile = $state(false);
  let stored = $state(true);
  let announcement = $state("");
  let orderList: HTMLOListElement | undefined;
  const overflow = $derived(
    layout.order.filter((item) => !layout.visible.includes(item)),
  );
  const views = $derived(mobile ? layout.visible : layout.order);
  const overflowActive = $derived(mobile && !layout.visible.includes(view));
  const selected = $derived(overflowActive ? "more" : view);
  onMount(() => {
    const query = matchMedia("(max-width: 700px)");
    const update = () => (mobile = query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });
  function save(next: NavigationLayout) {
    layout = next;
    stored = writeNavigationLayout(next);
  }
  async function move(item: View, direction: -1 | 1) {
    save(moveNavigationItem(layout, item, direction));
    announcement = `${viewLabel(item)} moved to position ${layout.order.indexOf(item) + 1} of ${layout.order.length}.`;
    await tick();
    // A boundary move disables its arrow; keep keyboard focus on the same row.
    const row = orderList?.querySelector<HTMLElement>(
      `[data-navigation-item="${item}"]`,
    );
    const arrow = row?.querySelector<HTMLButtonElement>(
      `[data-direction="${direction}"]`,
    );
    (arrow && !arrow.disabled
      ? arrow
      : row?.querySelector<HTMLButtonElement>("[aria-pressed]")
    )?.focus({ preventScroll: true });
  }
  function toggle(item: View) {
    const showing = !layout.visible.includes(item);
    save({
      order: layout.order,
      visible: layout.order.filter((value) =>
        value === item ? showing : layout.visible.includes(value),
      ),
    });
    announcement = `${viewLabel(item)} ${showing ? "shown on" : "removed from"} the navigation bar.`;
  }
  $effect(() => {
    const selectedView = selected,
      navigation = navElement;
    if (!navigation) return;
    const sidebar = navigation.parentElement;
    const reveal = () => {
      const active = navigation.querySelector<HTMLElement>(
        `button[data-view="${selectedView}"]`,
      );
      if (!active) return;
      if (navigation.scrollWidth > navigation.clientWidth) {
        const item = active.getBoundingClientRect();
        const bounds = navigation.getBoundingClientRect();
        navigation.scrollTo({
          left: Math.max(
            0,
            item.left -
              bounds.left +
              navigation.scrollLeft -
              (navigation.clientWidth - item.width) / 2,
          ),
          behavior: "instant",
        });
      } else if (sidebar && sidebar.scrollHeight > sidebar.clientHeight) {
        const item = active.getBoundingClientRect();
        const bounds = sidebar.getBoundingClientRect();
        const style = getComputedStyle(sidebar);
        const top =
          bounds.top + sidebar.clientTop + parseFloat(style.paddingTop);
        const bottom =
          bounds.top +
          sidebar.clientTop +
          sidebar.clientHeight -
          parseFloat(style.paddingBottom);
        const offset =
          item.top < top
            ? item.top - top
            : item.bottom > bottom
              ? item.bottom - bottom
              : 0;
        if (offset) sidebar.scrollBy({ top: offset, behavior: "instant" });
      }
    };
    void tick().then(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(navigation);
    if (sidebar) observer.observe(sidebar);
    return () => observer.disconnect();
  });
</script>

<aside>
  <nav
    use:navigationMotion={{ selected, layout: views.join(",") }}
    bind:this={navElement}
    aria-label="Workspace views"
  >
    {#each views as item (item)}<button
        aria-label={viewLabel(item)}
        data-view={item}
        aria-current={view === item ? "page" : undefined}
        class:chosen={view === item}
        onclick={() => onchange(item)}
        ><Icon name={item} /><span>{viewLabel(item)}</span></button
      >{/each}
    <ActionMenu
      label="More views"
      text="More"
      current={overflowActive}
      navigationKey="more"
      panelClass="navigation-menu-panel"
      placement="auto"
      floating
    >
      {#snippet children(close)}
        <div class="navigation-panel">
          <strong>More views</strong>
          {#each overflow as item (item)}
            <button
              type="button"
              class="quiet navigation-menu-link"
              aria-label={viewLabel(item)}
              aria-current={view === item ? "page" : undefined}
              class:chosen={view === item}
              onclick={() => {
                close();
                onchange(item);
              }}><Icon name={item} /><span>{viewLabel(item)}</span></button
            >
          {/each}
          {#if !overflow.length}<p class="navigation-hint">
              All views are on the navigation bar.
            </p>{/if}
          <details class="navigation-customization">
            <summary>Customize navigation</summary>
            <p class="navigation-hint">Choose shortcuts for the bottom bar.</p>
            <ol aria-label="Navigation order" bind:this={orderList}>
              {#each layout.order as item, index (item)}
                <li data-navigation-item={item}>
                  <span class="navigation-item-name">{viewLabel(item)}</span>
                  <Button
                    type="button"
                    variant="quiet"
                    class="icon-button"
                    data-direction="-1"
                    aria-label={`Move ${viewLabel(item)} earlier`}
                    disabled={index === 0}
                    onclick={() => void move(item, -1)}
                    ><Icon name="chevronUp" /></Button
                  >
                  <Button
                    type="button"
                    variant="quiet"
                    class="icon-button"
                    data-direction="1"
                    aria-label={`Move ${viewLabel(item)} later`}
                    disabled={index === layout.order.length - 1}
                    onclick={() => void move(item, 1)}
                    ><Icon name="chevronDown" /></Button
                  >
                  <Button
                    type="button"
                    variant="quiet"
                    class="icon-button"
                    aria-label={`Show ${viewLabel(item)} on navigation bar`}
                    title={`${layout.visible.includes(item) ? "Hide" : "Show"} ${viewLabel(item)} on navigation bar`}
                    aria-pressed={layout.visible.includes(item)}
                    onclick={() => toggle(item)}
                    ><Icon
                      name={layout.visible.includes(item) ? "eye" : "eyeOff"}
                    /></Button
                  >
                </li>
              {/each}
            </ol>
            <p class="navigation-hint">
              {stored
                ? "Saved in this browser."
                : "Browser storage is unavailable. These settings last until reload."}
            </p>
            <Button
              type="button"
              variant="quiet"
              onclick={() => {
                save(defaultNavigationLayout());
                announcement =
                  "Default navigation restored: Focus and Projects.";
              }}>Reset navigation</Button
            >
          </details>
          <span class="sr" role="status">{announcement}</span>
        </div>
      {/snippet}
    </ActionMenu>
  </nav>
  <div class="asidebottom">
    <span class:live={connected} class="dot"></span>{connected
      ? "Connected to host"
      : "Reconnecting…"}<button class="quiet" onclick={logout}>Sign out</button>
  </div>
</aside>
