export const uiLocale = "pl-PL";

/** Polish count forms: one, a few (except teens), and all other counts. */
export function counted(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const integer = Math.abs(count);
  const last = integer % 10;
  const teens = integer % 100;
  const word =
    integer === 1
      ? one
      : Number.isInteger(integer) &&
          last >= 2 &&
          last <= 4 &&
          !(teens >= 12 && teens <= 14)
        ? few
        : many;
  return `${count.toLocaleString(uiLocale)} ${word}`;
}

/** Days have a single plural form: 2 dni, 5 dni, 22 dni. */
export const countedDays = (count: number) =>
  counted(count, "dzień", "dni", "dni");
export const plannedDays = (count: number) =>
  counted(count, "dzień zaplanowany", "dni zaplanowane", "dni zaplanowanych");
export const countedFiles = (count: number) =>
  counted(count, "plik", "pliki", "plików");
export const countedDatedItems = (count: number) =>
  counted(count, "element", "elementy", "elementów");

const civilParts = (value: string) => {
  const [year = 0, month = 0, day = 0] = value
    .slice(0, 10)
    .split("-")
    .map(Number);
  return { year, month, day };
};
const shortMonth = new Intl.DateTimeFormat(uiLocale, {
  month: "short",
  timeZone: "UTC",
});
const monthName = (month: number) =>
  shortMonth.format(new Date(Date.UTC(2024, month - 1, 1)));

/** A civil day as "7 wrz"; the year appears once it is not the current one. */
export function formatCivilDate(
  value: string,
  currentYear = new Date().getFullYear(),
): string {
  const { year, month, day } = civilParts(value);
  if (!year || !month || !day) return value;
  return `${day} ${monthName(month)}${year === currentYear ? "" : ` ${year}`}`;
}

/** An inclusive civil range that names a shared month and year once. */
export function formatCivilRange(
  start: string,
  end?: string,
  currentYear = new Date().getFullYear(),
): string {
  const from = civilParts(start);
  const to = civilParts(end ?? start);
  if (!end || end.slice(0, 10) === start.slice(0, 10) || !to.year)
    return formatCivilDate(start, currentYear);
  if (from.year !== to.year)
    return `${formatCivilDate(start, NaN)} – ${formatCivilDate(end, NaN)}`;
  if (from.month !== to.month)
    return `${from.day} ${monthName(from.month)} – ${formatCivilDate(end, currentYear)}`;
  return `${from.day}–${formatCivilDate(end, currentYear)}`;
}
