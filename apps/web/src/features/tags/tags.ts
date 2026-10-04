export const TAG_LIMIT = 20;
const TAG_LENGTH_LIMIT = 48;

export type TagResult = { labels: string[]; error: string };

/** Labels are opaque, case-sensitive strings in the persisted contract. */
export function tagValidation(labels: readonly string[]): string {
  if (labels.length > TAG_LIMIT)
    return `Użyj maksymalnie ${TAG_LIMIT} tagów na kartę. Usuń tag przed dodaniem kolejnego.`;
  if (labels.some((label) => !label.length)) return "Wpisz nazwę tagu.";
  if (labels.some((label) => [...label].length > TAG_LENGTH_LIMIT))
    return `Tag może zawierać maksymalnie ${TAG_LENGTH_LIMIT} znaków.`;
  if (new Set(labels).size !== labels.length)
    return "Ten tag jest już na karcie.";
  return "";
}

export function addTag(
  labels: readonly string[],
  value: string,
  fromSuggestion = false,
): TagResult {
  // New input trims its outer spaces. Existing source labels retain exact bytes.
  const label = fromSuggestion ? value : value.trim();
  const next = [...labels, label];
  const error = tagValidation(next);
  return { labels: error ? [...labels] : next, error };
}

export function matchingTags(
  options: readonly string[],
  selected: readonly string[],
  query: string,
  limit = 8,
) {
  const needle = query.trim().toLocaleLowerCase();
  return [...new Set(options)]
    .filter(
      (label) =>
        !selected.includes(label) && label.toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}
