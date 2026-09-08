import type { Pending } from "./api";

export type TagIssue = {
  project_id?: string;
  card_id?: string;
  message: string;
};
export type CatalogTag = {
  name: string;
  managed: boolean;
  usage: number;
  projects: { project_id: string; project_name: string; count: number }[];
};
export type TagCatalog = {
  version: string;
  tags: CatalogTag[];
  complete: boolean;
  issues: TagIssue[];
};
export type TagChange = {
  project_id: string;
  project_name: string;
  card_id: string;
  title: string;
  version: string;
  labels: string[];
};
export type TagPreview = {
  version: string;
  source: string;
  target: string;
  complete: boolean;
  issues: TagIssue[];
  changes: TagChange[];
};
export type TagChangeResult = {
  change: TagChange;
  state: "ready" | "saved" | "conflict" | "failed" | "uncertain";
  message: string;
  pending?: Pending;
};
export function catalogNames(catalog: TagCatalog): string[] {
  return catalog.tags.filter((tag) => tag.managed).map((tag) => tag.name);
}
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
export function destinationTag(value: string, catalog: TagCatalog): string {
  return catalog.tags.some((tag) => tag.name === value) ? value : value.trim();
}
export function canFinishTagChange(
  catalog: TagCatalog | null,
  preview: TagPreview | null,
  results: TagChangeResult[],
): boolean {
  return (
    !!catalog &&
    !!preview &&
    catalog.complete &&
    preview.complete &&
    !results.some((row) => row.state !== "saved") &&
    !catalog.tags.some((tag) => tag.name === preview.source && tag.usage > 0)
  );
}
