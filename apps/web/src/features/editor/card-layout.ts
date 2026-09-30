export const cardSections = {
  description: "Description",
  checklist: "Checklist",
  counters: "Counters",
  comments: "Comments",
  schedule: "Schedule",
  labels: "Labels",
} as const;
export type CardSection = keyof typeof cardSections;
export type CardLayout = CardSection[];
const defaults: CardLayout = [
  "description",
  "checklist",
  "counters",
  "comments",
  "schedule",
  "labels",
];
const key = "astra-card-layout:v2";
const legacyKey = "astra-card-layout:v1";
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function normalize(value: unknown): CardLayout {
  const saved = Array.isArray(value) ? value : [];
  return [...new Set([...saved, ...defaults])].filter((section) =>
    defaults.includes(section),
  );
}

function readLegacy(value: unknown): CardLayout {
  const raw =
    value && typeof value === "object"
      ? (value as { content?: unknown; properties?: unknown })
      : {};
  const order = (saved: unknown, sections: CardLayout) =>
    [...new Set([...(Array.isArray(saved) ? saved : []), ...sections])].filter(
      (section) => sections.includes(section),
    );
  // Preserve the previous reading order when upgrading the browser preference.
  return [
    ...order(raw.content, defaults.slice(0, 4)),
    ...order(raw.properties, defaults.slice(4)),
  ];
}

/** Only section identifiers are stored; card data stays in the editor/server. */
export function readCardLayout(storage?: StorageReader): CardLayout {
  try {
    const source = storage ?? localStorage;
    const saved = source.getItem(key);
    return saved !== null
      ? normalize(JSON.parse(saved))
      : readLegacy(JSON.parse(source.getItem(legacyKey) ?? "null"));
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
  section: CardSection,
  direction: -1 | 1,
): CardLayout {
  const result = normalize(layout);
  const index = result.indexOf(section);
  const next = index + direction;
  if (index >= 0 && next >= 0 && next < result.length)
    [result[index], result[next]] = [result[next], result[index]];
  return result;
}
