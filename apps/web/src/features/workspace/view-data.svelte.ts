import { ViewData, type ViewDataState } from "./view-data";
import type { ViewQuery, Section } from "./view-queries";

export function viewData(
  query: () => ViewQuery,
  active: () => boolean,
  error: (cause: unknown) => void,
) {
  let snapshot = $state.raw<ViewDataState>();
  const owner = new ViewData({
    query,
    active,
    error,
    changed: (state) => {
      snapshot = state;
    },
  });
  snapshot = owner.state;
  return {
    get state() {
      return snapshot!;
    },
    refresh: (sections?: Section[]) => owner.refresh(sections),
    more: (kind: string, back?: boolean) => owner.more(kind, back),
    moreAttention: (first?: boolean) => owner.moreAttention(first),
    invalidate: () => owner.invalidate(),
    reset: () => owner.reset(),
  };
}
