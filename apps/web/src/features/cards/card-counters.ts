import type {
  CardCounter,
  CounterConfiguration,
  CounterRecord,
} from "../../lib/contracts/api.generated";

export const counterMaximum = 1_000_000_000;
export type CounterInputDraft = { date: string; text: string; base: number };
export type CounterDrafts = {
  configuration: CounterConfiguration | null;
  values: Record<string, CounterRecord>;
  inputs: Record<string, CounterInputDraft>;
};
export function emptyCounterDrafts(): CounterDrafts {
  return { configuration: null, values: {}, inputs: {} };
}
export function countersDirty(draft: CounterDrafts): boolean {
  return (
    draft.configuration !== null ||
    Object.keys(draft.values).length > 0 ||
    Object.values(draft.inputs).some(counterInputDirty)
  );
}
export function parseCounterInput(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= counterMaximum ? value : null;
}
export function counterInputDirty(input: CounterInputDraft): boolean {
  return parseCounterInput(input.text) !== input.base;
}
export function counterDay(timezone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
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
  const date = drafts.inputs[counter.id]?.date ?? today;
  return (
    drafts.values[counter.id] ?? {
      id: counter.id,
      date,
      value: counter.values[date] ?? 0,
    }
  );
}
export function setCounterValue(
  counter: CardCounter,
  drafts: CounterDrafts,
  day: string,
  value: number,
): CounterDrafts {
  if (!Number.isSafeInteger(value) || value < 0 || value > counterMaximum)
    return drafts;
  const record = counterRecord(counter, drafts, day);
  const values = { ...drafts.values };
  if (value === (counter.values[record.date] ?? 0)) delete values[counter.id];
  else values[counter.id] = { ...record, value };
  return { ...drafts, values };
}
/** Raw numeric input also belongs to the editor, including incomplete edits. */
export function setCounterInput(
  counter: CardCounter,
  drafts: CounterDrafts,
  today: string,
  text: string,
): CounterDrafts {
  const record = counterRecord(counter, drafts, today);
  const next = {
    ...drafts,
    inputs: {
      ...drafts.inputs,
      [counter.id]: {
        date: record.date,
        text,
        base: counter.values[record.date] ?? 0,
      },
    },
  };
  const value = parseCounterInput(text);
  return value === null
    ? next
    : setCounterValue(counter, next, record.date, value);
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
