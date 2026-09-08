import { isAbortError } from "../../lib/api/read-requests.ts";

type Request<T> = {
  key: string;
  read: (signal: AbortSignal) => Promise<T>;
  apply: (value: T) => void;
  failed: (cause: unknown) => void;
};

/** One view owns its reads; gestures defer publication, scope changes supersede it. */
export class PlanningRead {
  private controller?: AbortController;
  private generation = 0;
  private key = "";
  private busy = false;
  private paused = false;
  private disposed = false;
  private deferred?: () => Promise<void>;
  private changed: (loading: boolean) => void;

  constructor(changed: (loading: boolean) => void) {
    this.changed = changed;
  }

  pause(active: boolean) {
    this.paused = active;
    if (!active && !this.busy) this.flush();
  }

  async run<T>(request: Request<T>): Promise<void> {
    if (this.disposed) return;
    if (this.paused || (this.busy && this.key === request.key)) {
      if (this.paused && this.key !== request.key) {
        this.generation++;
        this.controller?.abort();
        this.key = request.key;
        this.busy = false;
        this.changed(false);
      }
      this.deferred = () => this.run(request);
      return;
    }
    const current = ++this.generation;
    this.controller?.abort();
    this.controller = new AbortController();
    this.key = request.key;
    this.deferred = undefined;
    this.busy = true;
    this.changed(true);
    try {
      const value = await request.read(this.controller.signal);
      if (current !== this.generation || this.disposed) return;
      if (this.paused) this.deferred ??= () => this.run(request);
      else request.apply(value);
    } catch (cause) {
      if (current === this.generation && !this.disposed && !isAbortError(cause))
        request.failed(cause);
    } finally {
      if (current === this.generation && !this.disposed) {
        this.busy = false;
        this.changed(false);
        this.flush();
      }
    }
  }

  private flush() {
    if (this.paused || this.disposed) return;
    const next = this.deferred;
    this.deferred = undefined;
    void next?.();
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.controller?.abort();
    this.deferred = undefined;
  }
}
