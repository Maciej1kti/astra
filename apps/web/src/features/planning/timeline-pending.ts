/**
 * Dates a timeline bar shows before the saved row arrives. A change is always
 * proposed against a version this browser has observed: the one the row showed
 * when the gesture began, or the one its own preceding save produced. A version
 * that merely arrived with a later read is never used, so a card changed
 * elsewhere still ends in a conflict instead of being overwritten.
 */
export type PlanDates = { start: string; end: string };
export type PendingDates = PlanDates & {
  /** The version these dates were proposed against. */
  base: string;
  /** Versions this chain of changes has already replaced. */
  earlier: string[];
  /** Absent while the save is on its way; null when it gave no version. */
  saved?: string | null;
  /** Dates a later gesture chose while this save was still on its way. */
  next?: PlanDates;
};
export type DateProposalStep = { version: string; dates: PlanDates };
type Step = { entry?: PendingDates; propose?: DateProposalStep };

const follow = (
  entry: PendingDates,
  version: string,
  dates: PlanDates,
): Step => ({
  entry: {
    ...dates,
    base: version,
    earlier: [...entry.earlier, entry.base],
  },
  propose: { version, dates },
});

/** The dates a row shows: the latest a gesture chose, saved or not. */
export function shownDates(entry: PendingDates | undefined): PlanDates | null {
  if (!entry) return null;
  const { start, end } = entry.next ?? entry;
  return { start, end };
}

/** A gesture ended on these dates for a row showing this version. */
export function chooseDates(
  entry: PendingDates | undefined,
  version: string,
  dates: PlanDates,
): Step {
  if (!entry)
    return {
      entry: { ...dates, base: version, earlier: [] },
      propose: { version, dates },
    };
  // Its save is on its way: these dates follow once its version is known.
  if (entry.saved === undefined) return { entry: { ...entry, next: dates } };
  // Saved without a version to build on: the fresh row has to arrive first.
  if (entry.saved === null) return { entry };
  return follow(entry, entry.saved, dates);
}

/** The save ended. `version` is what it produced, when it was saved. */
export function settleDates(
  entry: PendingDates | undefined,
  saved: boolean,
  version?: string,
): Step {
  // A refused or abandoned change takes the dates that waited on it with it.
  if (!entry || !saved) return {};
  const { next, ...rest } = entry;
  if (next && version) return follow(entry, version, next);
  return { entry: { ...rest, saved: version ?? null } };
}

/** A read delivered the row with this version. */
export function arrivedDates(
  entry: PendingDates | undefined,
  version: string | undefined,
): PendingDates | undefined {
  if (!entry || version === undefined) return undefined;
  // A read from before the change, or the save has not been answered yet.
  if (
    version === entry.base ||
    entry.earlier.includes(version) ||
    entry.saved === undefined
  )
    return entry;
  // The saved row is here, or the card has moved on: show what was read.
  return undefined;
}
