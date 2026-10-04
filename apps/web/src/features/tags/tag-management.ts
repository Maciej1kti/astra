export function catalogNameError(
  name: string,
  existing: readonly string[] = [],
): string {
  if (!name.trim()) return "Enter a tag name.";
  if (name !== name.trim())
    return "Remove spaces at the start and end of the name.";
  if ([...name].length > 48) return "A tag can contain up to 48 characters.";
  if (existing.includes(name))
    return "This exact name is already in the catalog.";
  return "";
}
