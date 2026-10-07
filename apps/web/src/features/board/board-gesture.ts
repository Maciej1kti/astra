import { gestureCancellation } from "../../lib/ui/gesture-cancellation.ts";

export type BoardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type BoardDrop = BoardRect & {
  /** Names the destination; the marker glides only when it changes. */
  key: string;
  /** A whole destination without an order, instead of a slot between cards. */
  area?: boolean;
};
/** Where a released preview comes to rest; nothing removes it at once. */
export type BoardLanding =
  BoardRect | null | undefined | Promise<BoardRect | null | undefined>;
export type BoardGestureOptions = {
  disabled: () => boolean;
  /** Called every frame of a drag; the host may part its cards here. */
  target: (x: number, y: number) => BoardDrop | null;
  commit: () => BoardLanding | void;
  lift?: () => void;
  /** A drag released without a destination, or cancelled. */
  abort?: () => BoardLanding | void;
  /** The preview has come to rest and is gone. */
  landed?: () => void;
  /** Whether columns are pages: an edge then turns one page after a pause. */
  paged?: () => boolean;
  page?: (direction: -1 | 1) => void;
};

const HOLD = 250;
const EDGE = 56;
const PAGE_EDGE = 32;
const PAGE_DWELL = 380;
const PAGE_REST = 650;
const LIFT = 140;
const LAND = 240;
const SCALE = 0.03;
const TILT = 4;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
/** Pixels per millisecond: nothing at the zone's start, quickest at the edge. */
const pace = (depth: number, zone: number) =>
  clamp(depth / zone, 0, 1) ** 2 * 1.1;
const still = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A visual gesture only. Persistence remains in the versioned confirmation. */
export function boardGesture(node: HTMLElement, initial: BoardGestureOptions) {
  let options = initial,
    captured: BoardGestureOptions | null = null;
  let pointer: number | null = null,
    startX = 0,
    startY = 0,
    x = 0,
    y = 0;
  let active = false,
    frame = 0,
    previousTime = 0,
    suppressClick = false;
  let ghost: HTMLElement | null = null,
    indicator: HTMLElement | null = null;
  let offsetX = 0,
    offsetY = 0,
    holdTimer = 0,
    touch = false;
  let liftTime = 0,
    previousX = 0,
    tilt = 0,
    dropKey = "",
    edgeSince = 0,
    edgeRest = 0,
    edgeSide = 0,
    calm = false;
  const landing = new Set<HTMLElement>();

  const place = (left: number, top: number, turn = 0, scale = 1) =>
    `translate3d(${left}px, ${top}px, 0) rotate(${turn.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

  /** Ends the pointer's part; a lifted preview is handed back to be landed. */
  function release() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    const id = pointer;
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    indicator?.remove();
    const lifted = ghost;
    ghost = indicator = null;
    node.removeAttribute("data-dragging");
    node.removeAttribute("data-pressing");
    if (active) document.documentElement.removeAttribute("data-board-dragging");
    if (id !== null && node.hasPointerCapture(id))
      node.releasePointerCapture(id);
    if (id !== null) window.dispatchEvent(new Event("planning-gesture-ended"));
    active = false;
    captured = null;
    return lifted;
  }
  function land(
    lifted: HTMLElement | null,
    intent: BoardGestureOptions | null,
    destination: BoardLanding | void,
  ) {
    if (!lifted) return;
    const finish = () => {
      if (!landing.delete(lifted)) return;
      lifted.remove();
      intent?.landed?.();
    };
    const settle = (rect: BoardRect | null | undefined) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- an element without animations lands at once
      if (!rect || calm || !lifted.animate) return finish();
      lifted
        .animate(
          [
            { transform: lifted.style.transform },
            {
              transform: place(rect.left, rect.top),
              boxShadow: "var(--shadow-card)",
            },
          ],
          {
            duration: LAND,
            easing: "cubic-bezier(0.2, 0.85, 0.3, 1.04)",
            fill: "forwards",
          },
        )
        .finished.then(finish, finish);
    };
    landing.add(lifted);
    if (destination instanceof Promise)
      destination.then(settle, () => settle(null));
    else settle(destination ?? null);
  }
  function cancel() {
    const intent = captured,
      lifted = release();
    land(lifted, intent, lifted ? intent?.abort?.() : undefined);
  }
  function start() {
    if (pointer === null) return;
    node.setPointerCapture(pointer);
    active = true;
    suppressClick = true;
    calm = still();
    node.removeAttribute("data-pressing");
    node.setAttribute("data-dragging", "true");
    document.documentElement.setAttribute("data-board-dragging", "");
    const rect = node.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;
    ghost = node.cloneNode(true) as HTMLElement;
    for (const element of [ghost, ...ghost.querySelectorAll("*")]) {
      for (const name of [
        "id",
        "data-board-card",
        "data-dragging",
        "data-pressing",
        "aria-label",
      ])
        element.removeAttribute(name);
    }
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-board-drag-preview", "");
    Object.assign(ghost.style, {
      position: "fixed",
      left: "0",
      top: "0",
      pointerEvents: "none",
      zIndex: "var(--layer-drag-preview)",
      margin: "0",
      width: `${rect.width}px`,
      boxSizing: "border-box",
      opacity: "1",
      background: "var(--paper)",
      color: "var(--ink)",
      border: "var(--stroke) solid var(--line-strong)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-floating)",
      transformOrigin: `${offsetX}px ${offsetY}px`,
      transform: place(rect.left, rect.top),
      willChange: "transform",
    });
    indicator = document.createElement("div");
    indicator.setAttribute("data-board-drop-indicator", "");
    indicator.setAttribute("aria-hidden", "true");
    Object.assign(indicator.style, {
      position: "fixed",
      pointerEvents: "none",
      // The place is marked on the board, under the preview that hovers over it.
      zIndex: "calc(var(--layer-drag-preview) - 1)",
      boxSizing: "border-box",
      display: "none",
    });
    document.body.append(ghost, indicator);
    liftTime = 0;
    previousX = x;
    tilt = 0;
    dropKey = "";
    edgeSince = edgeRest = edgeSide = 0;
    if (touch) {
      try {
        navigator.vibrate(8);
      } catch {
        /* A lift without haptics is still a lift. */
      }
    }
    captured?.lift?.();
  }
  function scroll(time: number, elapsed: number) {
    const board = node.closest<HTMLElement>(".date-scroll");
    if (board) {
      const rect = board.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        if (captured?.paged?.()) {
          const side =
            x < rect.left + PAGE_EDGE ? -1 : x > rect.right - PAGE_EDGE ? 1 : 0;
          if (side !== edgeSide) {
            edgeSide = side;
            edgeSince = time;
          }
          if (side && time - edgeSince >= PAGE_DWELL && time >= edgeRest) {
            edgeRest = time + PAGE_REST;
            edgeSince = time;
            captured.page?.(side);
          }
        } else {
          const speed =
            x < rect.left + EDGE
              ? -pace(rect.left + EDGE - x, EDGE)
              : x > rect.right - EDGE
                ? pace(x - (rect.right - EDGE), EDGE)
                : 0;
          board.scrollLeft += speed * elapsed;
        }
      }
    }
    // Columns are as long as their cards, so the page follows a held card.
    const speed =
      y < EDGE
        ? -pace(EDGE - y, EDGE)
        : y > window.innerHeight - EDGE
          ? pace(y - (window.innerHeight - EDGE), EDGE)
          : 0;
    if (speed) window.scrollBy(0, speed * elapsed);
  }
  function mark(target: BoardDrop | null) {
    if (!indicator) return;
    indicator.style.display = target ? "block" : "none";
    if (!target) {
      dropKey = "";
      return;
    }
    // The marker glides to a new place and otherwise follows scrolling exactly.
    const moved = !!dropKey && dropKey !== target.key && !calm;
    dropKey = target.key;
    Object.assign(indicator.style, {
      transition: moved
        ? "left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease"
        : "none",
      left: `${target.left}px`,
      top: `${target.top}px`,
      width: `${target.width}px`,
      height: `${target.height}px`,
      background: target.area ? "transparent" : "var(--hover)",
      border: target.area
        ? "var(--focus-width) solid var(--line-strong)"
        : "var(--stroke) dashed var(--line-strong)",
      borderRadius: target.area ? "var(--radius-panel)" : "var(--radius-card)",
    });
  }
  function paint(time: number) {
    frame = 0;
    if (!active || !captured || !ghost || !indicator) return;
    if (options.disabled()) return cancel();
    const elapsed = Math.min(previousTime ? time - previousTime : 16, 32);
    previousTime = time;
    liftTime ||= time;
    const lift = calm ? 0 : clamp((time - liftTime) / LIFT, 0, 1);
    // The preview leans into its travel and straightens when it rests.
    const lean = calm ? 0 : clamp(((x - previousX) / elapsed) * 3, -TILT, TILT);
    previousX = x;
    tilt += (lean - tilt) * 0.18;
    ghost.style.transform = place(
      x - offsetX,
      y - offsetY,
      tilt,
      1 + SCALE * (1 - (1 - lift) ** 3),
    );
    scroll(time, elapsed);
    const target = captured.target(x, y);
    mark(target);
    ghost.style.cursor = target ? "grabbing" : "no-drop";
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
    const target = event.target as HTMLElement;
    if (target.closest("select,input,textarea,details,a")) return;
    if (target.closest("button") && !target.closest(".title,.handle")) return;
    touch = event.pointerType !== "mouse";
    pointer = event.pointerId;
    captured = options;
    startX = x = event.clientX;
    startY = y = event.clientY;
    previousTime = 0;
    suppressClick = false;
    window.dispatchEvent(new Event("planning-gesture-started"));
    if (touch) {
      // The card sinks while it is held, so the lift is expected.
      node.setAttribute("data-pressing", "true");
      holdTimer = window.setTimeout(() => {
        start();
        frame = requestAnimationFrame(paint);
      }, HOLD);
    }
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    x = event.clientX;
    y = event.clientY;
    const distance = Math.hypot(x - startX, y - startY);
    if (!active && touch && distance > 8) {
      cancel();
      return;
    }
    if (!active && !touch && distance >= 5) start();
    if (active) {
      event.preventDefault();
      if (!frame) frame = requestAnimationFrame(paint);
    }
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    const intent = captured;
    const target =
      active && !options.disabled()
        ? intent?.target(event.clientX, event.clientY)
        : null;
    const lifted = release();
    land(
      lifted,
      intent,
      target ? intent?.commit() : lifted ? intent?.abort?.() : undefined,
    );
  }
  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }
  const touchmove = (event: TouchEvent) => {
    if (active && event.cancelable) event.preventDefault();
  };
  const contextmenu = (event: MouseEvent) => {
    if (active || node.hasAttribute("data-pressing")) event.preventDefault();
  };
  const dragstart = (event: DragEvent) => event.preventDefault();
  node.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  node.addEventListener("click", click, true);
  node.addEventListener("dragstart", dragstart);
  node.addEventListener("contextmenu", contextmenu);
  node.addEventListener("touchmove", touchmove, { passive: false });
  const cancelGestures = gestureCancellation(node, {
    pointer: () => pointer,
    cancel,
  });
  return {
    update(next: BoardGestureOptions) {
      options = next;
      if (options.disabled()) cancel();
    },
    destroy() {
      const intent = captured,
        lifted = release();
      if (lifted) {
        lifted.remove();
        void intent?.abort?.();
        intent?.landed?.();
      }
      node.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      node.removeEventListener("click", click, true);
      node.removeEventListener("dragstart", dragstart);
      node.removeEventListener("contextmenu", contextmenu);
      node.removeEventListener("touchmove", touchmove);
      cancelGestures();
    },
  };
}
