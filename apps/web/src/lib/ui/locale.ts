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
