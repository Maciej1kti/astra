import { canonicalView, workspaceViews, type View } from "./navigation.ts";

export type NavigationLayout = { order: View[]; visible: View[] };
const key = "astra-navigation-layout:v1";

function normalize(value: unknown): NavigationLayout {
  const saved =
    value && typeof value === "object"
      ? (value as { order?: unknown; visible?: unknown })
      : {};
  const known = (items: unknown): View[] =>
    Array.isArray(items)
      ? [...new Set(items.map(canonicalView))].filter(
          (item): item is View => item !== undefined,
        )
      : [];
  const order = [...new Set([...known(saved.order), ...workspaceViews])];
  const visible = Array.isArray(saved.visible)
    ? known(saved.visible)
    : ["focus", "projects"];
  return { order, visible: order.filter((item) => visible.includes(item)) };
}

/** Browser presentation only; routes and project content stay authoritative. */
export function readNavigationLayout(
  storage?: Pick<Storage, "getItem">,
): NavigationLayout {
  try {
    return normalize(
      JSON.parse((storage ?? localStorage).getItem(key) ?? "null"),
    );
  } catch {
    return defaultNavigationLayout();
  }
}

export function writeNavigationLayout(
  layout: NavigationLayout,
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    (storage ?? localStorage).setItem(key, JSON.stringify(normalize(layout)));
    return true;
  } catch {
    return false;
  }
}

export function defaultNavigationLayout(): NavigationLayout {
  return normalize(null);
}
