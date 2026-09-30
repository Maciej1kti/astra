export const cardSections = {
  description: "Description",
  checklist: "Checklist",
  counters: "Counters",
  comments: "Comments",
  schedule: "Schedule",
  labels: "Labels",
} as const;
export type CardSection = keyof typeof cardSections;
export type CardLayout = { content: CardSection[]; properties: CardSection[] };
export type LayoutGroup = keyof CardLayout;
const defaults: CardLayout = {
  content: ["description", "checklist", "counters", "comments"],
  properties: ["schedule", "labels"],
};
const key = "astra-card-layout:v1";
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function normalize(value: unknown): CardLayout {
  const raw =
    value && typeof value === "object" ? (value as Partial<CardLayout>) : {};
  const order = (group: LayoutGroup) => {
    const saved = Array.isArray(raw[group]) ? raw[group] : [];
    return [...new Set([...saved, ...defaults[group]])].filter((section) =>
      defaults[group].includes(section),
    );
  };
  return { content: order("content"), properties: order("properties") };
}

/** Only section identifiers are stored; card data stays in the editor/server. */
export function readCardLayout(storage?: StorageReader): CardLayout {
  try {
    return normalize(
      JSON.parse((storage ?? localStorage).getItem(key) ?? "null"),
    );
  } catch {
    return normalize(null);
  }
}

export function writeCardLayout(
  layout: CardLayout,
  storage?: StorageWriter,
): boolean {
  try {
    (storage ?? localStorage).setItem(key, JSON.stringify(normalize(layout)));
    return true;
  } catch {
    return false;
  }
}

export function defaultCardLayout(): CardLayout {
  return normalize(null);
}

export function moveCardSection(
  layout: CardLayout,
  group: LayoutGroup,
  section: CardSection,
  direction: -1 | 1,
): CardLayout {
  const result = normalize(layout);
  const order = result[group];
  const index = order.indexOf(section);
  const next = index + direction;
  if (index >= 0 && next >= 0 && next < order.length)
    [order[index], order[next]] = [order[next], order[index]];
  return result;
}
