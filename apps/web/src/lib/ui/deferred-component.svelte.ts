/** Load a component once without tying an already mounted command to visibility. */
export function deferredComponent<T>(
  loadModule: () => Promise<{ default: T }>,
) {
  let component = $state.raw<T | null>(null);
  let error = $state("");
  let pending: Promise<void> | undefined;

  function load(): Promise<void> {
    if (component) return Promise.resolve();
    if (pending) return pending;
    error = "";
    pending = loadModule()
      .then((module) => {
        component = module.default;
      })
      .catch(() => {
        error =
          "Nie udało się wczytać tej części aplikacji. Spróbuj ponownie lub odśwież stronę po zachowaniu otwartej wersji roboczej.";
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  return {
    get component() {
      return component;
    },
    get error() {
      return error;
    },
    load,
  };
}
