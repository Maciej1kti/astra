export function abortError() {
  return new DOMException("The read was cancelled.", "AbortError");
}
export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
export class ReadQueueFullError extends Error {}

type Entry = { controller: AbortController; users: number; settled: boolean; promise: Promise<unknown> };
type Waiting = { start: () => void; cancel: () => void };

/** Only GETs enter this pool. Each subscriber owns its cancellation separately. */
export class ReadRequests {
  private active = 0;
  private waiting: Waiting[] = [];
  private entries = new Map<string, Entry>();
  private concurrency: number;
  private maxQueued: number;
  private timeoutMs: number;

  constructor({ concurrency = 3, maxQueued = 32, timeoutMs = 15_000 } = {}) {
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.timeoutMs = timeoutMs;
  }

  private slot(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const start = () => {
        signal.removeEventListener("abort", cancel);
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          this.waiting.shift()?.start();
        });
      };
      const waiting = { start, cancel: () => cancel() };
      const cancel = () => {
        this.waiting = this.waiting.filter((item) => item !== waiting);
        signal.removeEventListener("abort", cancel);
        reject(signal.reason ?? abortError());
      };
      if (signal.aborted) return cancel();
      if (this.active < this.concurrency) return start();
      if (this.waiting.length >= this.maxQueued)
        return reject(new ReadQueueFullError("Waiting for previous reads to finish."));
      signal.addEventListener("abort", cancel, { once: true });
      this.waiting.push(waiting);
    });
  }

  run<T>(key: string, operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, users: 0, settled: false, promise: Promise.resolve() };
      const created = entry;
      this.entries.set(key, created);
      created.promise = (async () => {
        // The deadline includes queue time; obsolete reads cannot wait indefinitely.
        const timer = setTimeout(() => controller.abort(new DOMException("The read timed out. Try again.", "TimeoutError")), this.timeoutMs);
        let release: (() => void) | undefined;
        try {
          release = await this.slot(controller.signal);
          controller.signal.throwIfAborted();
          return await operation(controller.signal);
        } finally {
          clearTimeout(timer);
          release?.();
          created.settled = true;
          if (this.entries.get(key) === created) this.entries.delete(key);
        }
      })();
    }
    const current = entry;
    current.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", cancel);
        current.users--;
        if (!current.users && !current.settled) {
          if (this.entries.get(key) === current) this.entries.delete(key);
          current.controller.abort();
        }
        return true;
      };
      const cancel = () => { if (finish()) reject(abortError()); };
      signal?.addEventListener("abort", cancel, { once: true });
      current.promise.then(
        (value) => { if (finish()) resolve(value as T); },
        (error) => { if (finish()) reject(error); },
      );
    });
  }

  clear() {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }
}

/** Bound both active work and queued promises for collections of known IDs. */
export async function mapReads<T, R>(items: readonly T[], read: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (index < items.length) {
      signal?.throwIfAborted();
      const current = index++;
      results[current] = await read(items[current]);
    }
  }));
  return results;
}
