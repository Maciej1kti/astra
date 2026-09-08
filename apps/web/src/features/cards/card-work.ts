import type { AcceptanceItem } from "../../lib/contracts/domain.generated";
export type { AcceptanceItem } from "../../lib/contracts/domain.generated";

export const ACCEPTANCE_LIMIT = 100;
export const ACCEPTANCE_TEXT_LIMIT = 500;

export function acceptanceValidation(items: AcceptanceItem[]) {
  if (items.length > ACCEPTANCE_LIMIT)
    return `Use up to ${ACCEPTANCE_LIMIT} acceptance items.`;
  const ids = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        item.id,
      ) ||
      ids.has(item.id)
    )
      return `Acceptance item ${index + 1} has an invalid or repeated identifier. Copy your draft before reopening this card.`;
    ids.add(item.id);
    if (!item.text.trim())
      return `Add text to acceptance item ${index + 1}, or remove it.`;
    if ([...item.text].length > ACCEPTANCE_TEXT_LIMIT)
      return `Acceptance item ${index + 1} must use ${ACCEPTANCE_TEXT_LIMIT} characters or fewer.`;
  }
  return "";
}

export function moveAcceptance(
  items: AcceptanceItem[],
  id: string,
  offset: -1 | 1,
) {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const result = [...items];
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}

export function acceptanceProgress(items: AcceptanceItem[]) {
  return {
    total: items.length,
    completed: items.filter((item) => item.completed).length,
  };
}

export function cardPurposeValidation(expectedResult: string, owner: string) {
  if ([...expectedResult].length > 4000)
    return "Expected result must use 4,000 characters or fewer.";
  if ([...owner].length > 120) return "Owner must use 120 characters or fewer.";
  return "";
}
