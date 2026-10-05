import type { Summary } from "../../lib/api/api.ts";
import type { CardResource } from "../../lib/contracts/api.generated";

export type AcknowledgedCounters = {
  key: string;
  /** Source versions whose projections these acknowledged totals replace. */
  bases: string[];
  resource: {
    version: string;
    counters: NonNullable<CardResource["metadata"]["counters"]>;
  };
};

const cardKey = (project: string, card: string) => `${project}:${card}`;

/**
 * Record a confirmed counter write. A projection read from the version the
 * write was based on, or from an earlier base of the same chain, is older than
 * the acknowledgement and must not be shown in its place.
 */
export function acknowledgeCounters(
  entries: AcknowledgedCounters[],
  draft: { project: string; card: string; version: string },
  resource: CardResource,
): AcknowledgedCounters[] {
  const key = cardKey(draft.project, draft.card);
  const previous = entries.find((entry) => entry.key === key);
  return [
    ...entries.filter((entry) => entry.key !== key).slice(-99),
    {
      key,
      bases: [
        ...new Set([
          ...(previous?.resource.version === draft.version
            ? previous.bases
            : []),
          draft.version,
        ]),
      ].filter(
        (_, index, versions) => index === 0 || index >= versions.length - 63,
      ),
      // Keep only counter data, never full card bodies or comment history.
      resource: {
        version: resource.version,
        counters: resource.metadata.counters ?? [],
      },
    },
  ];
}

/** Show acknowledged totals over a summary that still carries a replaced version. */
export function presentAcknowledged(
  entries: AcknowledgedCounters[],
  item: Summary,
  today: string,
): Summary {
  const acknowledged = entries.find(
    (entry) =>
      entry.key === cardKey(item.project_id, item.id) &&
      entry.bases.includes(item.version),
  );
  if (!acknowledged) return item;
  return {
    ...item,
    version: acknowledged.resource.version,
    daily_counters: acknowledged.resource.counters
      .filter((counter) => !counter.archived)
      .map((counter) => ({
        id: counter.id,
        name: counter.name,
        unit: counter.unit,
        step: counter.step,
        date: today,
        value: counter.values[today] ?? 0,
      })),
  };
}
