<script lang="ts">
  import Icon from "../../lib/ui/Icon.svelte";

  import { tick } from "svelte";
  import { workspaceViews as views, viewLabel, type View } from "./navigation";

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
  $effect(() => {
    const selectedView = view,
      navigation = navElement;
    if (!navigation) return;
    const sidebar = navigation.parentElement;
    const reveal = () => {
      const active = navigation.querySelector<HTMLElement>(
        `button[data-view="${selectedView}"]`,
      );
      if (!active) return;
      if (navigation.scrollWidth > navigation.clientWidth) {
        navigation.scrollTo({
          left: Math.max(
            0,
            active.offsetLeft -
              navigation.offsetLeft -
              (navigation.clientWidth - active.offsetWidth) / 2,
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
  <nav bind:this={navElement} aria-label="Workspace views">
    {#each views as item}<button
        aria-label={viewLabel(item)}
        data-view={item}
        aria-current={view === item ? "page" : undefined}
        class:chosen={view === item}
        onclick={() => onchange(item)}
        ><Icon name={item} /><span>{viewLabel(item)}</span></button
      >{/each}
  </nav>
  <div class="asidebottom">
    <span class:live={connected} class="dot"></span>{connected
      ? "Connected to host"
      : "Reconnecting…"}<button class="quiet" onclick={logout}>Sign out</button>
  </div>
</aside>
