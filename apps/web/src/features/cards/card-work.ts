import type { AcceptanceItem } from "../../lib/contracts/domain.generated";
export type { AcceptanceItem } from "../../lib/contracts/domain.generated";

export const ACCEPTANCE_LIMIT = 100;
export const ACCEPTANCE_TEXT_LIMIT = 500;

export function acceptanceValidation(items: AcceptanceItem[]) {
  if (items.length > ACCEPTANCE_LIMIT)
    return `Use up to ${ACCEPTANCE_LIMIT} checklist items.`;
  const ids = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        item.id,
      ) ||
      ids.has(item.id)
    )
      return `Checklist item ${index + 1} has an invalid or repeated identifier. Copy your draft before reopening this card.`;
    ids.add(item.id);
    if (!item.text.trim())
      return `Add text to checklist item ${index + 1}, or remove it.`;
    if ([...item.text].length > ACCEPTANCE_TEXT_LIMIT)
      return `Checklist item ${index + 1} must use ${ACCEPTANCE_TEXT_LIMIT} characters or fewer.`;
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
  if (
    index < 0 ||
    destination < 0 ||
    destination >= items.length ||
    destination === index
  )
    return items;
  const item = items[index];
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

export type AcceptanceRowRect = {
  id: string;
  top: number;
  bottom: number;
};

/** Find the final position indicated by a pointer's vertical position. */
export function acceptanceDropIndex(
  items: AcceptanceItem[],
  draggedId: string,
  y: number,
  rows: AcceptanceRowRect[],
) {
  if (!items.some((item) => item.id === draggedId)) return null;
  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  for (const row of rows) {
    if (row.id === draggedId) continue;
    if (y < (row.top + row.bottom) / 2) {
      const rowIndex = items.findIndex((item) => item.id === row.id);
      if (rowIndex < 0) continue;
      return rowIndex > draggedIndex ? rowIndex - 1 : rowIndex;
    }
  }
  return items.length - 1;
}

export function moveAcceptance(
  items: AcceptanceItem[],
  id: string,
  offset: -1 | 1,
) {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + offset;
  return moveAcceptanceToIndex(items, id, destination);
}
