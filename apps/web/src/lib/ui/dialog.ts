import { motionDuration } from "./motion";
import { dialogLayers, revealLayers } from "./motion-layers";

/** Exiting controls leave the accessibility tree as soon as Svelte makes them inert. */
export function layerPresence(element: HTMLElement) {
  const update = () => {
    if (element.inert) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  };
  const observer = new MutationObserver(update);
  observer.observe(element, { attributes: true, attributeFilter: ["inert"] });
  update();
  return { destroy: () => observer.disconnect() };
}

/** Native modal focus trapping, inert background and focus restoration. */
export function modal(element: HTMLDialogElement) {
  const previous = document.activeElement;
  const presence = layerPresence(element);
  element.showModal();
  const entrance = revealLayers(element, dialogLayers);
  return {
    destroy() {
      entrance.destroy();
      presence.destroy();
      element.close();
      const remaining = Array.from(
        document.querySelectorAll("dialog[open]"),
      ).at(-1);
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (!remaining || remaining.contains(previous))
      )
        previous.focus({ preventScroll: true });
    },
  };
}

/** Outgoing layers remain native/inert until Svelte finishes their short exit. */
export function layerExit(node: HTMLElement) {
  // Read preferences again when a quickly reopened layer starts another exit.
  return () => ({
    duration: motionDuration(node, "--motion-exit", 220),
    css: (t: number) =>
      `opacity: ${t}; transform: translateY(${(1 - t) * 6}px) scale(${0.985 + t * 0.015});`,
  });
}
