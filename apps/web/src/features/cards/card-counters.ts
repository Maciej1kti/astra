import type {
  CardCounter,
  CounterConfiguration,
  CounterRecord,
} from "../../lib/contracts/api.generated";

export const counterMaximum = 1_000_000_000;
export type CounterDrafts = {
  configuration: CounterConfiguration | null;
  values: Record<string, CounterRecord>;
};
export function emptyCounterDrafts(): CounterDrafts {
  return { configuration: null, values: {} };
}
export function countersDirty(draft: CounterDrafts): boolean {
  return draft.configuration !== null || Object.keys(draft.values).length > 0;
}
export function counterDay(timezone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function counterRecord(
  counter: CardCounter,
  drafts: CounterDrafts,
  today: string,
): CounterRecord {
  return (
    drafts.values[counter.id] ?? {
      id: counter.id,
      date: today,
      value: counter.values[today] ?? 0,
    }
  );
}
/** A draft retains its original date through midnight and ordinary card autosaves. */
export function adjustCounter(
  counter: CardCounter,
  drafts: CounterDrafts,
  today: string,
  direction: 1 | -1,
): CounterDrafts {
  const record = counterRecord(counter, drafts, today);
  const value = Math.max(
    0,
    Math.min(counterMaximum, record.value + direction * counter.step),
  );
  const values = { ...drafts.values };
  if (value === (counter.values[record.date] ?? 0)) delete values[counter.id];
  else values[counter.id] = { ...record, value };
  return { ...drafts, values };
}
export function validCounterConfiguration(
  config: CounterConfiguration,
): boolean {
  return (
    !!config.name.trim() &&
    config.name.length <= 80 &&
    !!config.unit.trim() &&
    [...config.unit].length <= 5 &&
    Number.isInteger(config.step) &&
    config.step > 0 &&
    config.step <= counterMaximum
  );
}
