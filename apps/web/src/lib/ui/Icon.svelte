<script lang="ts">
  import { iconPaths, type IconName } from "./icons";
  let { name, small = false }: { name: IconName; small?: boolean } = $props();
</script>

<svg
  class="ui-icon"
  class:small
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={iconPaths[name]} />
</svg>
