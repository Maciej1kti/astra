/**
 * Built-in plugins. A plugin is a module shipped with the application that a
 * profile switches on; nothing is loaded from project data or the network.
 */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

export const plugins: readonly PluginInfo[] = [
  {
    id: "chart-totals",
    name: "Razem na Wykresie",
    description:
      "Kafel Razem pod podsumowaniem okresu: suma liczników o tej samej jednostce i łączna wartość ze stawek.",
  },
  {
    id: "chart-settlement",
    name: "Rozliczenie na Wykresie",
    description:
      "Panel nad wykresami: kto komu ile wisi. Osobą jest ostatnie słowo nazwy licznika, a mniejsza wartość z całej historii płaci różnicę.",
  },
];

/** One stable spelling of an enabled set, for comparing and storing drafts. */
export function pluginList(ids: readonly string[] | undefined): string {
  return [...new Set(ids ?? [])].sort().join(",");
}

export function pluginIds(list: string): string[] {
  return list ? list.split(",") : [];
}

/** Switching a plugin keeps identifiers this build does not know. */
export function togglePlugin(list: string, id: string, on: boolean): string {
  const ids = pluginIds(list).filter((item) => item !== id);
  return pluginList(on ? [...ids, id] : ids);
}
