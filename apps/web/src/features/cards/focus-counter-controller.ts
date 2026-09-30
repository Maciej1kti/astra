import { CommandController } from "../../lib/api/command-controller.ts";
import { patchCard } from "../../lib/api/resources.ts";
import type { Summary, Pending } from "../../lib/api/api.ts";
import type {
  CardResource,
  DailyCounterSummary,
} from "../../lib/contracts/api.generated";

export type FocusCounterDraft = {
  project: string;
  card: string;
  title: string;
  version: string;
  counter: DailyCounterSummary;
  value: number;
};
export type FocusCounterSnapshot = {
  draft: FocusCounterDraft | null;
  pending: Pending | null;
  busy: boolean;
  rejected: boolean;
  error: string;
  notice: string;
};
export const counterLimit = 1_000_000_000;
export const counterValueValid = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= counterLimit;
export const clampCounter = (value: number) =>
  Math.max(0, Math.min(counterLimit, value));
export function matchesCounter(
  draft: FocusCounterDraft | null,
  item: Summary,
  counter: DailyCounterSummary,
) {
  return (
    draft?.project === item.project_id &&
    draft.card === item.id &&
    draft.counter.id === counter.id
  );
}

type Dependencies = {
  allowed: () => boolean;
  changed: () => void;
  saved: (draft: FocusCounterDraft, resource: CardResource) => void;
  command?: CommandController;
  prepare?: typeof patchCard;
};

/** Lives above the route: navigation, refresh and session loss cannot discard a command. */
export class FocusCounterController {
  private draft: FocusCounterDraft | null = null;
  private error = "";
  private notice = "";
  private rejected = false;
  private command: CommandController;
  private dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
    this.command =
      dependencies.command ??
      new CommandController({
        allowed: dependencies.allowed,
        changed: () => dependencies.changed(),
      });
  }
  get snapshot(): FocusCounterSnapshot {
    return {
      draft: this.draft,
      error: this.error,
      notice: this.notice,
      rejected: this.rejected,
      pending: this.command.pending,
      busy: this.command.busy,
    };
  }
  edit(item: Summary, counter: DailyCounterSummary, value: number) {
    if (this.command.pending || this.rejected || !counterValueValid(value))
      return;
    if (this.draft && !matchesCounter(this.draft, item, counter)) return;
    if (!this.draft && (item.availability !== "ready" || !item.version)) return;
    this.draft = this.draft
      ? { ...this.draft, value }
      : {
          project: item.project_id,
          card: item.id,
          title: item.title,
          version: item.version,
          counter: { ...counter },
          value,
        };
    this.error = "";
    this.notice = "";
    this.dependencies.changed();
  }
  setValue(value: number) {
    if (
      !this.draft ||
      this.command.pending ||
      this.rejected ||
      !counterValueValid(value)
    )
      return;
    this.draft = { ...this.draft, value };
    this.dependencies.changed();
  }
  dismiss() {
    if (this.command.pending || this.command.busy) return;
    this.draft = null;
    this.error = "";
    this.notice = "";
    this.rejected = false;
    this.dependencies.changed();
  }
  async save() {
    if (
      !this.draft ||
      this.rejected ||
      this.command.pending ||
      !this.dependencies.allowed()
    )
      return;
    const draft = this.draft;
    if (draft.value === draft.counter.value || !counterValueValid(draft.value))
      return;
    this.command.prepare(
      (this.dependencies.prepare ?? patchCard)(
        draft.project,
        draft.card,
        {
          record_counter: {
            id: draft.counter.id,
            date: draft.counter.date,
            value: draft.value,
          },
        },
        draft.version,
      ),
    );
    await this.resolve(false);
  }
  async resolve(check: boolean) {
    if (
      !this.draft ||
      !this.command.pending ||
      this.command.busy ||
      !this.dependencies.allowed()
    )
      return;
    this.error = "";
    this.dependencies.changed();
    try {
      const reply = check
        ? await this.command.confirm()
        : await this.command.commit();
      const draft = this.draft;
      const resource = reply.result.resource;
      this.draft = null;
      this.notice = `${draft.counter.name} saved · ${draft.value} ${draft.counter.unit}`;
      if (resource?.type === "card") this.dependencies.saved(draft, resource);
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
      this.rejected = !this.command.pending;
    }
    this.dependencies.changed();
  }
}
