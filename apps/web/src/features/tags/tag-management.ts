export function catalogNameError(
  name: string,
  existing: readonly string[] = [],
): string {
  if (!name.trim()) return "Wpisz nazwę tagu.";
  if (name !== name.trim()) return "Usuń spacje na początku i końcu nazwy.";
  if ([...name].length > 48) return "Tag może zawierać maksymalnie 48 znaków.";
  if (existing.includes(name)) return "Ta nazwa już znajduje się na liście.";
  return "";
}
