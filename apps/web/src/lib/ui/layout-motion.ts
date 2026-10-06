import { flip } from "svelte/animate";

/** Reordering retains mounted controls and follows the current motion preference. */
export function layoutMotion(
  node: Element,
  positions: { from: DOMRect; to: DOMRect },
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration =
    parseFloat(getComputedStyle(node).getPropertyValue("--motion-base")) || 200;
  return flip(node, positions, { duration: reduced ? 0 : duration });
}
