import { serverMessage } from "../../lib/api/messages.ts";
import { errorMessage } from "../../lib/api/messages.ts";
import { getCounterSeries, type CounterQuery } from "../../lib/api/counters.ts";
import { cursorPage } from "../../lib/api/pagination.ts";
import { projectionNotice } from "../../lib/api/projection-state.ts";
import { isAbortError } from "../../lib/api/read-requests.ts";
import type { CounterSeries } from "../../lib/contracts/api.generated";

export type ChartDataState = {
  series: CounterSeries[];
  cursor: string | null;
  loading: boolean;
  error: string;
  notice: string;
};
const initialState = (): ChartDataState => ({
  series: [],
  cursor: null,
  loading: false,
  error: "",
  notice: "",
});
const chartCatalogLimit = 500;

/** Owns bounded series pages, obsolete reads and invalidations received during reads. */
export class ChartData {
  private snapshot = initialState();
  private generation = 0;
  private controller: AbortController | null = null;
  private query: CounterQuery | null = null;
  private job: Promise<void> | null = null;
  private queued = false;
  private disposed = false;
  private changed: (state: ChartDataState) => void;
  private read: typeof getCounterSeries;
  constructor(
    changed: (state: ChartDataState) => void,
    read = getCounterSeries,
  ) {
    this.changed = changed;
    this.read = read;
  }
  get state() {
    return this.snapshot;
  }
  private publish(patch: Partial<ChartDataState>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.changed(this.snapshot);
  }
  refresh(query: CounterQuery): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const same = JSON.stringify(query) === JSON.stringify(this.query);
    if (same && this.job) {
      this.queued = true;
      return this.job;
    }
    this.controller?.abort();
    this.queued = false;
    this.query = { ...query };
    if (!same) this.publish(initialState());
    return this.load(
      null,
      same ? Math.max(1, Math.ceil(this.snapshot.series.length / 100)) : 1,
    );
  }
  more(): Promise<void> {
    if (!this.snapshot.cursor || this.job || this.disposed)
      return Promise.resolve();
    return this.load(this.snapshot.cursor);
  }
  private load(cursor: string | null, refreshPages = 1): Promise<void> {
    const query = this.query!;
    const controller = (this.controller = new AbortController());
    const generation = ++this.generation;
    this.publish({ loading: true, error: "" });
    const job = (async () => {
      try {
        const readPage = (next: string | null) =>
          this.read(query, next, { signal: controller.signal, fresh: true });
        const result = await cursorPage(readPage, cursor);
        controller.signal.throwIfAborted();
        // Refresh all already loaded pages before publication, preserving selected
        // later-page histories without mixing snapshots or growing the catalog.
        if (!cursor) {
          for (
            let index = 1;
            index < refreshPages && result.value.page.next_cursor;
            index++
          ) {
            const next = await cursorPage(
              readPage,
              result.value.page.next_cursor,
            );
            controller.signal.throwIfAborted();
            if (next.reset) {
              result.value = next.value;
              result.reset = true;
              break;
            }
            result.value = {
              ...next.value,
              items: [...result.value.items, ...next.value.items],
              warnings: [...result.value.warnings, ...next.value.warnings],
            };
          }
        }
        if (generation !== this.generation || this.disposed) return;
        const page = result.value;
        const series =
          cursor && !result.reset
            ? [...this.snapshot.series, ...page.items]
            : page.items;
        const capped =
          series.length >= chartCatalogLimit && !!page.page.next_cursor;
        const notices = [
          result.reset
            ? "Dane liczników się zmieniły. Wyświetlono pierwszą stronę aktualnych wyników."
            : "",
          projectionNotice(page),
          ...page.warnings.map((warning) => serverMessage(warning.code)),
          capped
            ? "Lista jest ograniczona do 500 liczników. Wybierz projekt, aby zawęzić wyniki."
            : "",
        ].filter(Boolean);
        this.publish({
          series: series.slice(0, chartCatalogLimit),
          cursor: capped ? null : page.page.next_cursor,
          notice: [...new Set(notices)].join(" "),
        });
      } catch (cause) {
        if (
          generation === this.generation &&
          !isAbortError(cause) &&
          !this.disposed
        )
          this.publish({
            error: errorMessage(cause),
          });
      } finally {
        if (generation === this.generation && !this.disposed) {
          this.job = null;
          this.publish({ loading: false });
          if (this.queued) {
            this.queued = false;
            void this.refresh(this.query!);
          }
        }
      }
    })();
    this.job = job;
    return job;
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.controller?.abort();
    this.job = null;
    this.queued = false;
  }
}
