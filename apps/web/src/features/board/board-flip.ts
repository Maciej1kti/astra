/** Where every rendered card was, so a re-render can be played as movement. */
export type BoardSnapshot = Map<
  string,
  { left: number; top: number; column: Element | null }
>;

const CARD = "[data-board-card]";
const row = (card: HTMLElement) =>
  card.closest<HTMLElement>(".wx-card-row") ?? card;

export function boardSnapshot(root: HTMLElement): BoardSnapshot {
  const result: BoardSnapshot = new Map();
  for (const card of root.querySelectorAll<HTMLElement>(CARD)) {
    const bounds = row(card).getBoundingClientRect();
    result.set(card.dataset.boardCard ?? "", {
      left: bounds.left,
      top: bounds.top,
      column: card.closest("[data-kanban-column-cards]"),
    });
  }
  return result;
}

/**
 * First-last-invert-play: cards that kept their column glide from where they
 * were; a card that arrived in a column rises into it. `still` names a card
 * something else is already carrying to its place.
 */
export function playBoardMoves(
  root: HTMLElement,
  before: BoardSnapshot,
  still?: string,
) {
  if (!before.size || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  const style = getComputedStyle(root);
  const duration =
    Number.parseFloat(style.getPropertyValue("--motion-quick")) || 200;
  const easing = style.getPropertyValue("--motion-ease").trim() || "ease-out";
  const view = root.getBoundingClientRect();
  for (const card of root.querySelectorAll<HTMLElement>(CARD)) {
    const id = card.dataset.boardCard ?? "";
    if (id === still) continue;
    const element = row(card);
    const now = element.getBoundingClientRect();
    if (now.bottom < view.top || now.top > view.bottom) continue;
    const was = before.get(id);
    if (!was || was.column !== card.closest("[data-kanban-column-cards]")) {
      element.animate(
        [
          { opacity: 0, transform: "translateY(6px) scale(0.98)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: duration * 1.3, easing },
      );
      continue;
    }
    const dx = was.left - now.left,
      dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    element.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: duration * 1.3, easing },
    );
  }
}
