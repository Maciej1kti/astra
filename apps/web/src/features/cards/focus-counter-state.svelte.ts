import {
  FocusCounterController,
  type FocusCounterDraft,
} from "./focus-counter-controller";
import {
  acknowledgeCounters,
  presentAcknowledged,
  type AcknowledgedCounters,
} from "./focus-counter-overlay";
import type { Summary } from "../../lib/api/api";
import type { CardResource } from "../../lib/contracts/api.generated";

export function focusCounterState(allowed: () => boolean, saved: () => void) {
  let revision = $state(0);
  let acknowledged = $state<AcknowledgedCounters[]>([]);
  const controller = new FocusCounterController({
    allowed,
    changed: () => {
      revision += 1;
    },
    saved: (draft: FocusCounterDraft, resource: CardResource) => {
      acknowledged = acknowledgeCounters(acknowledged, draft, resource);
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
    present: (item: Summary, today: string): Summary =>
      presentAcknowledged(acknowledged, item, today),
  };
}
