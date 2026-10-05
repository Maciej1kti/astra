type Timer = ReturnType<typeof setTimeout>;
type Dependencies<Handle> = {
  /** Resolves while the session is valid. A 401 here publishes its loss. */
  probe: () => Promise<unknown>;
  ended: (cause: unknown) => boolean;
  reconnect: () => void;
  schedule?: (run: () => void, delay: number) => Handle;
  cancel?: (timer: Handle) => void;
};

export function streamRetryDelay(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
}

/**
 * Recovery for a failed event stream. A browser retries a dropped connection
 * by itself, but a refused one (any non-200 reply) stays closed for good.
 */
export function streamRecovery<Handle = Timer>(
  dependencies: Dependencies<Handle>,
) {
  const schedule =
    dependencies.schedule ??
    ((run, delay) => setTimeout(run, delay) as unknown as Handle);
  const cancelTimer =
    dependencies.cancel ?? ((timer) => clearTimeout(timer as unknown as Timer));
  let attempt = 0;
  let generation = 0;
  let timer: Handle | undefined;

  function supersede() {
    generation++;
    if (timer !== undefined) cancelTimer(timer);
    timer = undefined;
  }
  function wait(current: number, run: () => void) {
    timer = schedule(() => {
      timer = undefined;
      if (current === generation) run();
    }, streamRetryDelay(attempt++));
  }
  function confirm(current: number, waited: boolean) {
    dependencies.probe().then(
      () => {
        if (current !== generation) return;
        if (waited) dependencies.reconnect();
        else wait(current, dependencies.reconnect);
      },
      (cause) => {
        // An unreachable host says nothing about the session; drafts stay open.
        if (current === generation && !dependencies.ended(cause))
          wait(current, () => confirm(current, true));
      },
    );
  }
  return {
    failed(closed: boolean) {
      if (!closed) {
        void dependencies.probe().catch(() => {});
        return;
      }
      supersede();
      confirm(generation, false);
    },
    opened() {
      attempt = 0;
    },
    cancel() {
      supersede();
      attempt = 0;
    },
  };
}
