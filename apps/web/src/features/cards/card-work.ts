import { isUuidAnyCase } from "../../lib/api/uuid.ts";
import type { AcceptanceItem } from "../../lib/contracts/domain.generated";
export type { AcceptanceItem } from "../../lib/contracts/domain.generated";

export const ACCEPTANCE_LIMIT = 100;
export const ACCEPTANCE_TEXT_LIMIT = 500;

export function acceptanceValidation(items: AcceptanceItem[]) {
  if (items.length > ACCEPTANCE_LIMIT)
    return `Użyj maksymalnie ${ACCEPTANCE_LIMIT} pozycji listy kontrolnej.`;
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isUuidAnyCase(item.id) || ids.has(item.id))
      return `Pozycja listy kontrolnej ${index + 1} ma nieprawidłowy lub powtórzony identyfikator. Skopiuj wersję roboczą przed ponownym otwarciem karty.`;
    ids.add(item.id);
    if (!item.text.trim())
      return `Dodaj treść do pozycji listy kontrolnej ${index + 1} lub ją usuń.`;
    if ([...item.text].length > ACCEPTANCE_TEXT_LIMIT)
      return `Pozycja listy kontrolnej ${index + 1} może zawierać maksymalnie ${ACCEPTANCE_TEXT_LIMIT} znaków.`;
  }
  return "";
}

/** Move an item to a final zero-based position without changing the item. */
export function moveAcceptanceToIndex(
  items: AcceptanceItem[],
  id: string,
  destination: number,
) {
  const index = items.findIndex((item) => item.id === id);
  const item = items[index];
  if (
    !item ||
    destination < 0 ||
    destination >= items.length ||
    destination === index
  )
    return items;
  const result = items.filter((value) => value.id !== id);
  result.splice(destination, 0, item);
  return result;
}

/** Apply an ID order while taking the current item values from the source. */
export function reorderAcceptance(items: AcceptanceItem[], order: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: AcceptanceItem[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      result.push(item);
      seen.add(id);
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) result.push(item);
  }
  if (result.every((item, index) => item === items[index])) return items;
  return result;
}
