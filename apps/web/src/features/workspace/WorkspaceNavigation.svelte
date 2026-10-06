<script lang="ts">
  import { navigationMotion } from "../../lib/ui/motion";
  import Icon from "../../lib/ui/Icon.svelte";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import { deferredComponent } from "../../lib/ui/deferred-component.svelte";

  import { onMount, tick } from "svelte";
  import { viewLabel, type View } from "./navigation";
  import {
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
  const customization = deferredComponent(
    () => import("./NavigationCustomization.svelte"),
  );
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
  $effect(() => {
    const selectedView = selected,
      compact = mobile,
      navigation = navElement;
    if (!navigation) return;
    const sidebar = navigation.parentElement;
    const reveal = () => {
      const active = navigation.querySelector<HTMLElement>(
        `button[data-view="${selectedView}"]`,
      );
      if (!active) return;
      if (compact && navigation.scrollWidth > navigation.clientWidth) {
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
      } else if (
        !compact &&
        sidebar &&
        sidebar.scrollHeight > sidebar.clientHeight
      ) {
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
    // The dock fades only the edge that still hides views.
    const edges = () => {
      const hidden = navigation.scrollWidth - navigation.clientWidth;
      navigation.toggleAttribute("data-fade-start", navigation.scrollLeft > 1);
      navigation.toggleAttribute(
        "data-fade-end",
        navigation.scrollLeft < hidden - 1,
      );
    };
    const update = () => {
      reveal();
      edges();
    };
    void tick().then(update);
    const observer = new ResizeObserver(update);
    observer.observe(navigation);
    if (sidebar) observer.observe(sidebar);
    navigation.addEventListener("scroll", edges, { passive: true });
    return () => {
      observer.disconnect();
      navigation.removeEventListener("scroll", edges);
    };
  });
</script>

<aside>
  <nav
    use:navigationMotion={{ selected, layout: views.join(",") }}
    bind:this={navElement}
    aria-label="Widoki przestrzeni roboczej"
  >
    {#each views as item (item)}<button
        aria-label={viewLabel(item)}
        data-view={item}
        aria-current={view === item ? "page" : undefined}
        class:chosen={view === item}
        onclick={() => onchange(item)}
        ><Icon name={item} /><span data-label={viewLabel(item)}
          >{viewLabel(item)}</span
        ></button
      >{/each}
    <ActionMenu
      label="Więcej widoków"
      text="Więcej"
      icon="views"
      current={overflowActive}
      navigationKey="more"
      panelClass="navigation-menu-panel"
      onopen={() => void customization.load()}
    >
      {#snippet children(close)}
        <div class="navigation-panel">
          <strong>Więcej widoków</strong>
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
              Wszystkie widoki są na pasku nawigacji.
            </p>{/if}
          {#if customization.component}
            {@const Customization = customization.component}
            <Customization {layout} {stored} onsave={save} />
          {:else if customization.error}
            <p class="navigation-hint" role="alert">{customization.error}</p>
            <Button
              type="button"
              variant="quiet"
              onclick={() => void customization.load()}
              >Ponów ładowanie opcji nawigacji</Button
            >
          {:else}
            <p class="navigation-hint" role="status">
              Ładowanie opcji nawigacji…
            </p>
          {/if}
        </div>
      {/snippet}
    </ActionMenu>
  </nav>
  <div class="asidebottom">
    <span class:live={connected} class="dot"></span>{connected
      ? "Połączono z serwerem"
      : "Ponowne łączenie…"}<button class="quiet" onclick={logout}
      >Wyloguj</button
    >
  </div>
</aside>
