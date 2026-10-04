<script lang="ts">
  import { Locale } from "@svar-ui/svelte-core";
  import type { Snippet } from "svelte";
  import { widgetWords } from "./widget-locale";

  let { children }: { children: Snippet } = $props();
</script>

<Locale words={widgetWords}>{@render children()}</Locale>
