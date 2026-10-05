import {
  FocusCounterController,
  type FocusCounterDraft,
} from "./focus-counter-controller";
import type { Summary } from "../../lib/api/api";
import type { CardResource } from "../../lib/contracts/api.generated";

export function focusCounterState(allowed: () => boolean, saved: () => void) {
  let revision = $state(0);
  let acknowledged = $state<
    {
      key: string;
      bases: string[];
      resource: {
        version: string;
        counters: NonNullable<CardResource["metadata"]["counters"]>;
      };
    }[]
  >([]);
  const controller = new FocusCounterController({
    allowed,
    changed: () => {
      revision += 1;
    },
    saved: (draft: FocusCounterDraft, resource: CardResource) => {
      const key = `${draft.project}:${draft.card}`;
      const previous = acknowledged.find((entry) => entry.key === key);
      acknowledged = [
        ...acknowledged.filter((entry) => entry.key !== key).slice(-99),
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
            (_, index, versions) =>
              index === 0 || index >= versions.length - 63,
          ),
          // Keep only counter data, never full card bodies or comment history.
          resource: {
            version: resource.version,
            counters: resource.metadata.counters ?? [],
          },
        },
      ];
      saved();
    },
  });
  const snapshot = $derived.by(() => {
    void revision;
    return controller.snapshot;
  });
  return {
    controller,
    get snapshot() {
      return snapshot;
    },
    present(item: Summary, today: string): Summary {
      const ack = acknowledged.find(
        (entry) =>
          entry.key === `${item.project_id}:${item.id}` &&
          entry.bases.includes(item.version),
      );
      if (!ack) return item;
      return {
        ...item,
        version: ack.resource.version,
        daily_counters: ack.resource.counters
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
    },
  };
}
