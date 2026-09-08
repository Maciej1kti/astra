import { api } from "./api.ts";
import type { TagCatalog } from "./tag-management";
import type { TagSuggestions as TagSuggestionResponse } from "./api.generated";
export type TagSuggestionPage = Pick<
  TagSuggestionResponse,
  "names" | "complete"
>;

/** A short-lived suggestion cache. Management previews always bypass it. */
export class TagSuggestions {
  private value: TagSuggestionPage | null = null;
  private expires = 0;
  private pending: Promise<TagSuggestionPage> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private read: (signal: AbortSignal) => Promise<TagSuggestionPage>;
  private now: () => number;
  constructor(
    read: (signal: AbortSignal) => Promise<TagSuggestionPage>,
    now = Date.now,
  ) {
    this.read = read;
    this.now = now;
  }
  load(): Promise<TagSuggestionPage> {
    if (this.value && this.now() < this.expires)
      return Promise.resolve(this.value);
    if (this.pending) return this.pending;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.pending = this.read(controller.signal)
      .then((value) => {
        if (generation === this.generation) {
          this.value = value;
          this.expires = this.now() + 30_000;
        }
        return value;
      })
      .finally(() => {
        if (generation === this.generation) {
          this.pending = null;
          this.controller = null;
        }
      });
    return this.pending;
  }
  clear() {
    this.generation++;
    this.value = null;
    this.expires = 0;
    this.controller?.abort();
    this.controller = null;
    this.pending = null;
  }
  remember(value: TagSuggestionPage) {
    this.clear();
    this.value = value;
    this.expires = this.now() + 30_000;
  }
}

const suggestions = new TagSuggestions((signal) =>
  api<TagSuggestionPage>(
    "/api/v1/workspace/tag-suggestions",
    "GET",
    undefined,
    {},
    { signal, fresh: true },
  ),
);
export const loadTagSuggestions = () => suggestions.load();
export function invalidateTagSuggestions(notify = true) {
  suggestions.clear();
  if (notify && typeof window !== "undefined")
    window.dispatchEvent(new Event("tag-suggestions-changed"));
}
export function rememberTagSuggestions(value: TagCatalog) {
  suggestions.remember({
    names: value.tags.map((tag) => tag.name),
    complete: value.complete,
  });
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("tag-suggestions-changed"));
}
