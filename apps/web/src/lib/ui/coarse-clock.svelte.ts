import { onMount } from "svelte";

const interval = 30_000;
const readers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const publish = () => {
  for (const refresh of [...readers]) refresh();
};

/**
 * Wall-clock time for relative labels and day rollover. Every mounted reader
 * shares one timer; a change is noticed within half a minute, or as soon as
 * the tab is shown again.
 */
export function coarseClock() {
  let now = $state(Date.now());
  onMount(() => {
    const refresh = () => {
      now = Date.now();
    };
    readers.add(refresh);
    if (readers.size === 1) {
      timer = setInterval(publish, interval);
      document.addEventListener("visibilitychange", publish);
    }
    return () => {
      readers.delete(refresh);
      if (readers.size) return;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", publish);
    };
  });
  return {
    get now() {
      return now;
    },
  };
}
