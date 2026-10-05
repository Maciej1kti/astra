import type { FocusRef } from "../../lib/contracts/api.generated";
import type { Summary } from "../../lib/api/api";
import {
  cloneReorderPreview,
  insideReorderBounds,
  positionReorderOverlay,
  reorderGesture,
  reorderInsertionIndex,
  reorderKeyIndex,
  reorderScrollDelta,
  sameReorderOrder,
  type ReorderGestureOptions,
  type ReorderPointer,
} from "../../lib/ui/reorder-gesture.ts";

type Options = {
  cards: () => Summary[];
  fullOrder: () => FocusRef[];
  version: () => string;
  scope: () => string;
  disabled: () => boolean;
  active: (value: boolean) => void;
  commit: (visible: Summary[], fullOrder: FocusRef[], version: string) => void;
};
type Snapshot = {
  card: Summary;
  cards: Summary[];
  fullOrder: FocusRef[];
  version: string;
  scope: string;
  source: HTMLElement;
  offsetX: number;
  offsetY: number;
};

const keyOf = (item: Pick<Summary, "project_id" | "id">) =>
  `${item.project_id}:${item.id}`;

/** Focus retains the observed full membership/version for its conditional write. */
export function focusOrderGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;

  function orderAt(pointer: ReorderPointer<Snapshot>) {
    const bounds = node.getBoundingClientRect();
    if (!insideReorderBounds(pointer.x, pointer.y, bounds)) {
      if (indicator) indicator.hidden = true;
      return null;
    }
    const { card, cards, source } = pointer.snapshot;
    const key = keyOf(card);
    const others = cards.filter((item) => keyOf(item) !== key);
    const rows = [
      ...node.querySelectorAll<HTMLElement>(
        "[data-focus-card][data-focus-reorderable]",
      ),
    ].filter((item) => item.dataset.focusKey !== key);
    const rects = rows.map((item) => item.getBoundingClientRect());
    const insertion = reorderInsertionIndex(pointer.y, rects);
    const order = [...others];
    order.splice(insertion, 0, card);
    if (indicator) {
      const rect =
        rects[Math.min(insertion, rects.length - 1)] ??
        source.getBoundingClientRect();
      indicator.hidden = false;
      positionReorderOverlay(
        indicator,
        rect.left,
        insertion >= rows.length ? rect.bottom : rect.top,
        rect.width,
      );
    }
    return order;
  }

  function gestureOptions(): ReorderGestureOptions<Snapshot> {
    return {
      disabled: () => options.disabled(),
      active: (value) => options.active(value),
      touchHold: 250,
      capture(event) {
        if ((event.target as HTMLElement).closest("[data-focus-interactive]"))
          return null;
        const source = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-focus-card][data-focus-reorderable]",
        );
        if (!source) return null;
        const cards = options.cards();
        const card = cards.find(
          (item) =>
            item.id === source.dataset.focusCard &&
            item.project_id === source.dataset.focusProject,
        );
        if (!card) return null;
        const rect = source.getBoundingClientRect();
        return {
          card,
          cards: [...cards],
          fullOrder: options.fullOrder().map((item) => ({ ...item })),
          version: options.version(),
          scope: options.scope(),
          source,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
      },
      // Canonical reads may refresh behind the frozen preview. The captured
      // full membership/version still proposes a conditional write on release.
      valid: (snapshot) => snapshot.scope === options.scope(),
      start({ snapshot }) {
        const rect = snapshot.source.getBoundingClientRect();
        snapshot.source.setAttribute("data-dragging", "true");
        ghost = cloneReorderPreview(snapshot.source, [
          "data-focus-card",
          "data-focus-key",
          "data-focus-project",
          "data-focus-reorderable",
        ]);
        ghost.setAttribute("data-focus-drag-preview", "");
        Object.assign(ghost.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: "var(--layer-drag-preview)",
          margin: "0",
          width: `${rect.width}px`,
          boxSizing: "border-box",
          opacity: "1",
          background: "var(--paper)",
          boxShadow: "var(--shadow-floating)",
        });
        indicator = document.createElement("div");
        indicator.setAttribute("data-focus-drop-indicator", "");
        indicator.setAttribute("aria-hidden", "true");
        Object.assign(indicator.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: "var(--layer-drag-indicator)",
          height: "var(--space-2)",
          borderRadius: "var(--radius-sm)",
          background: "var(--accent-ink)",
        });
        document.body.append(ghost, indicator);
      },
      paint(pointer) {
        if (!ghost) return;
        positionReorderOverlay(
          ghost,
          pointer.x - pointer.snapshot.offsetX,
          pointer.y - pointer.snapshot.offsetY,
          pointer.snapshot.source.getBoundingClientRect().width,
        );
        orderAt(pointer);
        window.scrollBy(
          0,
          reorderScrollDelta(pointer.y, { top: 0, bottom: window.innerHeight }),
        );
      },
      drop(pointer) {
        const order = orderAt(pointer);
        const snapshot = pointer.snapshot;
        if (
          !order ||
          sameReorderOrder(snapshot.cards.map(keyOf), order.map(keyOf))
        )
          return;
        return () =>
          options.commit(order, snapshot.fullOrder, snapshot.version);
      },
      release({ snapshot }) {
        ghost?.remove();
        indicator?.remove();
        ghost = indicator = null;
        snapshot.source.removeAttribute("data-dragging");
      },
      keydown(event) {
        if (
          !event.altKey ||
          options.disabled() ||
          (event.target as HTMLElement).closest("[data-focus-interactive]")
        )
          return;
        const target = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-focus-card][data-focus-reorderable]",
        );
        const cards = options.cards();
        const current = cards.findIndex(
          (item) =>
            item.id === target?.dataset.focusCard &&
            item.project_id === target?.dataset.focusProject,
        );
        const index = reorderKeyIndex(event.key, current, cards.length);
        if (index === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (index === current) return;
        const reordered = [...cards];
        const [card] = reordered.splice(current, 1);
        if (!card) return;
        reordered.splice(index, 0, card);
        options.commit(reordered, options.fullOrder(), options.version());
      },
    };
  }
  const gesture = reorderGesture(node, gestureOptions());
  return {
    update(next: Options) {
      options = next;
      gesture.update(gestureOptions());
    },
    destroy: gesture.destroy,
  };
}
