import type { navigationState } from "../features/workspace/navigation-state.svelte";

export function navigationOwnership(
  routing: ReturnType<typeof navigationState>,
) {
  routing.selectView("board");
  routing.changeFilters({ project: "", search: "title" });
  // @ts-expect-error Route mutation must go through the navigation owner.
  routing.current.view = "board";
  // @ts-expect-error Read generations are an implementation detail.
  routing.generation++;
}
