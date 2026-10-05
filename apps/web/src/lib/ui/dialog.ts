import { motionDuration } from "./motion";
import { dialogLayers, revealLayers } from "./motion-layers";

type ModalOptions = {
  onclose: () => void;
  /** The session layer: it stays above workspace modals however late they open. */
  foreground?: boolean;
};
type ModalOwner = {
  element: HTMLDialogElement;
  returnFocus: HTMLElement[];
  foreground: boolean;
};
const modalOwners: ModalOwner[] = [];
const modalObservers = new Set<() => void>();
const isOpen = ({ element }: ModalOwner) =>
  element.isConnected && element.open && !element.inert;

/** Open workspace modals: work that stays mounted below the session layer. */
export function retainedModals() {
  return modalOwners.filter((owner) => !owner.foreground && isOpen(owner))
    .length;
}
export function observeModals(changed: () => void) {
  modalObservers.add(changed);
  return () => {
    modalObservers.delete(changed);
  };
}

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
  const foreground = options.foreground ?? false;
  // A workspace modal opened under the session layer is not its descendant.
  const ancestors = [...modalOwners]
    .reverse()
    .filter((owner) => foreground || !owner.foreground);
  const previous = modalOwners.some(
    (owner) =>
      !ancestors.includes(owner) &&
      owner.element.contains(document.activeElement),
  )
    ? null
    : document.activeElement;
  // A deferred replacement can clear focus while its predecessor is still open
  // during exit. Its native owner retains the originating workspace trigger.
  const parent =
    ancestors.find(
      (owner) => previous instanceof Node && owner.element.contains(previous),
    ) ??
    ancestors.find(({ element: dialog }) => dialog.isConnected && dialog.open);
  const owner: ModalOwner = {
    element,
    foreground,
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
  // The top layer orders modals by opening time, so a workspace modal opened
  // under the session layer would cover it. Reopening moves that layer back in
  // front and returns the focus it held.
  const above = foreground
    ? []
    : modalOwners.filter((other) => other.foreground && other.element.open);
  const focused = document.activeElement;
  element.showModal();
  modalOwners.push(owner);
  for (const { element: layer } of above) {
    layer.close();
    layer.showModal();
    if (focused instanceof HTMLElement && layer.contains(focused))
      focused.focus({ preventScroll: true });
  }
  for (const changed of [...modalObservers]) changed();
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
      for (const changed of [...modalObservers]) changed();
      const open = modalOwners.filter(isOpen).reverse();
      const remaining = (
        open.find((candidate) => candidate.foreground) ?? open[0]
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
