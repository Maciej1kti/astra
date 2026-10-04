/** Notify mounted catalog readers; each reader owns its fresh project data. */
export function invalidateTagSuggestions() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("tag-suggestions-changed"));
}
