/** Native modal focus trapping, inert background and focus restoration. */
export function modal(element: HTMLDialogElement) {
  const previous = document.activeElement;
  element.showModal();
  return {
    destroy() {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    },
  };
}
