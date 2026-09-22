import type { FocusRef } from "../../lib/contracts/api.generated";
import type { Summary } from "../../lib/api/api";

type Options = {
  cards: () => Summary[];
  fullOrder: () => FocusRef[];
  version: () => string;
  scope: () => string;
  disabled: () => boolean;
  active: (value: boolean) => void;
  commit: (visible: Summary[], fullOrder: FocusRef[], version: string) => void;
};

const keyOf = (item: Pick<Summary, "project_id" | "id">) =>
  `${item.project_id}:${item.id}`;

/** Pointer previews are temporary; only pointerup proposes a conditional write. */
export function focusOrderGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let pointer: number | null = null;
  let active = false;
  let startX = 0;
  let startY = 0;
  let x = 0;
  let y = 0;
  let frame = 0;
  let holdTimer = 0;
  let suppressClick = false;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let source: HTMLElement | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let captured:
    | {
        card: Summary;
        cards: Summary[];
        fullOrder: FocusRef[];
        version: string;
        scope: string;
      }
    | undefined;

  function release() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    ghost?.remove();
    indicator?.remove();
    ghost = indicator = null;
    source?.removeAttribute("data-dragging");
    const id = pointer;
    const hadPointer = id !== null;
    pointer = null;
    active = false;
    captured = undefined;
    source = null;
    if (id !== null && node.hasPointerCapture(id))
      node.releasePointerCapture(id);
    if (hadPointer) options.active(false);
  }

  function cancel() {
    if (pointer !== null) suppressClick = true;
    release();
  }

  function orderAt(clientY: number) {
    if (!captured) return null;
    const bounds = node.getBoundingClientRect();
    if (
      x < bounds.left ||
      x > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      if (indicator) indicator.style.display = "none";
      return null;
    }
    const key = keyOf(captured.card);
    const others = captured.cards.filter((item) => keyOf(item) !== key);
    const cards = Array.from(
      node.querySelectorAll<HTMLElement>(
        "[data-focus-card][data-focus-reorderable]",
      ),
    ).filter((item) => item.dataset.focusKey !== key);

    let insertion = others.length;
    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        insertion = index;
        break;
      }
    }
    const order = [...others];
    order.splice(insertion, 0, captured.card);

    if (indicator) {
      const anchor = cards[Math.min(insertion, cards.length - 1)];
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        indicator.style.top = `${insertion >= cards.length ? rect.bottom : rect.top}px`;
        indicator.style.left = `${rect.left}px`;
        indicator.style.width = `${rect.width}px`;
        indicator.style.display = "block";
      } else if (source) {
        const rect = source.getBoundingClientRect();
        indicator.style.top = `${rect.top}px`;
        indicator.style.left = `${rect.left}px`;
        indicator.style.width = `${rect.width}px`;
        indicator.style.display = "block";
      }
    }
    return order;
  }

  function start() {
    if (!captured || !source || pointer === null || active) return;
    active = true;
    suppressClick = true;
    node.setPointerCapture(pointer!);
    source.setAttribute("data-dragging", "true");
    const rect = source.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;
    ghost = source.cloneNode(true) as HTMLElement;
    for (const element of [ghost, ...ghost.querySelectorAll("*")]) {
      element.removeAttribute("id");
      element.removeAttribute("data-focus-card");
      element.removeAttribute("data-focus-key");
      element.removeAttribute("data-focus-project");
      element.removeAttribute("data-focus-reorderable");
      element.removeAttribute("data-dragging");
    }
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-focus-drag-preview", "");
    Object.assign(ghost.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "10000",
      margin: "0",
      width: `${rect.width}px`,
      boxSizing: "border-box",
      opacity: "1",
      background: "var(--paper)",
      boxShadow: "0 12px 28px #0003",
    });
    indicator = document.createElement("div");
    indicator.setAttribute("data-focus-drop-indicator", "");
    indicator.setAttribute("aria-hidden", "true");
    Object.assign(indicator.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "10001",
      height: "3px",
      borderRadius: "2px",
      background: "var(--green)",
    });
    document.body.append(ghost, indicator);
  }

  function paint() {
    frame = 0;
    if (!active || !ghost) return;
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${y - offsetY}px`;
    orderAt(y);
    const edge = 48;
    if (y < edge) window.scrollBy(0, -8);
    else if (y > window.innerHeight - edge) window.scrollBy(0, 8);
    frame = requestAnimationFrame(paint);
  }

  function down(event: PointerEvent) {
    if (
      pointer !== null ||
      !event.isPrimary ||
      event.button !== 0 ||
      options.disabled()
    )
      return;
    suppressClick = false;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-focus-card][data-focus-reorderable]",
    );
    if (!target) return;
    const cardKey = target.dataset.focusCard;
    const projectId = target.dataset.focusProject;
    const cards = options.cards();
    const card = cards.find(
      (item) => item.id === cardKey && item.project_id === projectId,
    );
    if (!card || !cards.length) return;

    pointer = event.pointerId;
    source = target;
    captured = {
      card,
      cards: [...cards],
      fullOrder: options.fullOrder().map((item) => ({ ...item })),
      version: options.version(),
      scope: options.scope(),
    };
    startX = x = event.clientX;
    startY = y = event.clientY;
    options.active(true);
    if (event.pointerType === "touch") {
      holdTimer = window.setTimeout(() => {
        start();
        frame = requestAnimationFrame(paint);
      }, 250);
    }
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    x = event.clientX;
    y = event.clientY;
    if (
      !active &&
      event.pointerType !== "touch" &&
      Math.hypot(x - startX, y - startY) >= 5
    ) {
      start();
      frame = requestAnimationFrame(paint);
    }
    if (active) {
      event.preventDefault();
      if (!frame) frame = requestAnimationFrame(paint);
    }
  }

  function up(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    x = event.clientX;
    y = event.clientY;
    const result = active ? orderAt(event.clientY) : null;
    const snapshot = captured;
    const didDrag = active;
    release();
    if (!didDrag || !snapshot || !result) return;
    const before = snapshot.cards.map(keyOf);
    const after = result.map(keyOf);
    if (before.every((key, index) => key === after[index])) return;
    const cards = new Map(snapshot.cards.map((item) => [keyOf(item), item]));
    options.commit(
      result.map((item) => cards.get(keyOf(item))!),
      snapshot.fullOrder,
      snapshot.version,
    );
  }

  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function keydown(event: KeyboardEvent) {
    if (
      pointer !== null ||
      !event.altKey ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
      options.disabled()
    )
      return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-focus-card][data-focus-reorderable]",
    );
    const cards = options.cards();
    const index = cards.findIndex(
      (item) =>
        item.id === target?.dataset.focusCard &&
        item.project_id === target?.dataset.focusProject,
    );
    const nextIndex = index + (event.key === "ArrowUp" ? -1 : 1);
    if (!target || index < 0 || nextIndex < 0 || nextIndex >= cards.length)
      return;
    event.preventDefault();
    event.stopPropagation();
    const reordered = [...cards];
    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[index],
    ];
    options.commit(reordered, options.fullOrder(), options.version());
  }

  function secondPointer(event: PointerEvent) {
    if (pointer !== null && event.pointerId !== pointer) cancel();
  }

  function key(event: KeyboardEvent) {
    if (event.key === "Escape") cancel();
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("keydown", keydown);
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("lostpointercapture", cancel);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointerdown", secondPointer, true);
  window.addEventListener("keydown", key);
  window.addEventListener("blur", cancel);
  window.addEventListener("session-ended", cancel);

  return {
    update(next: Options) {
      options = next;
      if (captured && captured.scope !== options.scope()) cancel();
    },
    destroy() {
      cancel();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("keydown", keydown);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointerdown", secondPointer, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("session-ended", cancel);
    },
  };
}
