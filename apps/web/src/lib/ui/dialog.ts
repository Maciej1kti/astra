import { motionDuration } from "./motion";
import { dialogLayers, revealLayers } from "./motion-layers";

type ModalOptions = { onclose: () => void };
type ModalOwner = {
  element: HTMLDialogElement;
  returnFocus: HTMLElement[];
};
const modalOwners: ModalOwner[] = [];

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
export function modal(element: HTMLDialogElement, options: ModalOptions) {
  const previous = document.activeElement;
  const ancestors = [...modalOwners].reverse();
  // A deferred replacement can clear focus while its predecessor is still open
  // during exit. Its native owner retains the originating workspace trigger.
  const parent =
    ancestors.find(
      (owner) => previous instanceof Node && owner.element.contains(previous),
    ) ??
    ancestors.find(({ element: dialog }) => dialog.isConnected && dialog.open);
  const owner: ModalOwner = {
    element,
    returnFocus: Array.from(
      new Set([
        ...(previous instanceof HTMLElement &&
        previous !== document.body &&
        previous !== document.documentElement
          ? [previous]
          : []),
        ...(parent?.returnFocus ?? []),
      ]),
    ),
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    options.onclose();
  };
  const pointerFocus = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail < 1) return;
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button")
        : null;
    // WebKit does not focus clicked buttons. Do this at click time so pointerdown
    // guards can keep an editing field's layout stable until dispatch completes.
    if (
      button &&
      !button.matches(":disabled") &&
      button.closest("dialog") === element
    )
      button.focus({ preventScroll: true });
  };
  element.addEventListener("cancel", cancel);
  element.addEventListener("click", pointerFocus, true);
  const presence = layerPresence(element);
  element.showModal();
  modalOwners.push(owner);
  const entrance = revealLayers(element, dialogLayers);
  return {
    update(next: ModalOptions) {
      options = next;
    },
    destroy() {
      entrance.destroy();
      presence.destroy();
      element.removeEventListener("cancel", cancel);
      element.removeEventListener("click", pointerFocus, true);
      modalOwners.splice(modalOwners.indexOf(owner), 1);
      element.close();
      const remaining = [...modalOwners]
        .reverse()
        .find(
          ({ element: dialog }) =>
            dialog.isConnected && dialog.open && !dialog.inert,
        )?.element;
      // Replacing a modal removes its immediate trigger. Keep its originating
      // trigger as a fallback while nested dialogs still return to their parent.
      const target = owner.returnFocus.find(
        (candidate) =>
          candidate.isConnected &&
          !candidate.closest("[inert]") &&
          !candidate.matches(":disabled") &&
          (remaining
            ? remaining.contains(candidate)
            : !candidate.closest("dialog")),
      );
      if (target) target.focus({ preventScroll: true });
      else if (remaining && !remaining.contains(document.activeElement))
        remaining.focus({ preventScroll: true });
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
