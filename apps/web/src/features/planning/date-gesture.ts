import { gestureCancellation } from "../../lib/ui/gesture-cancellation.ts";

export type DateOperation = "move" | "start" | "end";
type Options = {
  /** Pixels one day takes on the axis. */
  unit: () => number;
  /** Whole days the bar spans; a resize never takes it below one. */
  span: () => number;
  disabled: () => boolean;
  /** True while a bar is held, so the view defers publishing fresh reads. */
  active: (value: boolean) => void;
  /** The snapped change while the bar moves; null once the gesture has ended. */
  preview: (operation: DateOperation, days: number | null) => void;
  commit: (operation: DateOperation, days: number) => void;
};
type Press = {
  pointerId: number;
  touch: boolean;
  operation: DateOperation;
  startX: number;
  startY: number;
  x: number;
  unit: number;
  span: number;
  left: number;
  width: number;
  inlineLeft: string;
  inlineWidth: string;
  scroll: HTMLElement | null;
  scrollStart: number;
  dragging: boolean;
  days: number;
};

/** Mouse movement before a press becomes a drag; a shorter one stays a click. */
const slop = 4;
/** A finger that travels this far before the hold ends is scrolling instead. */
const touchSlop = 8;
const holdDelay = 250;
const edgeZone = 40;

/**
 * A timeline bar follows the pointer by the pixel and reports whole days.
 * Previews never write data: only a release proposes one versioned edit. The
 * element's `[data-edge]` children resize; the rest of it moves the plan.
 */
export function dateGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let press: Press | null = null;
  let frame = 0;
  let hold = 0;
  let suppressClick = false;
  let settling: Animation | null = null;

  const position = (state: Press, dx: number) =>
    state.operation === "move"
      ? { left: state.left + dx, width: state.width }
      : state.operation === "start"
        ? { left: state.left + dx, width: state.width - dx }
        : { left: state.left, width: state.width + dx };

  function travel(state: Press, x: number) {
    const dx =
      x - state.startX + (state.scroll?.scrollLeft ?? 0) - state.scrollStart;
    const limit = (state.span - 1) * state.unit;
    if (state.operation === "start") return Math.min(dx, limit);
    if (state.operation === "end") return Math.max(dx, -limit);
    return dx;
  }

  /** Ease from where the bar was let go to where the saved dates put it. */
  function settle(from: { left: number; width: number }) {
    if (
      typeof node.animate !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    // The view repositions the bar in a microtask; measure it after that.
    requestAnimationFrame(() => {
      const to = { left: node.offsetLeft, width: node.offsetWidth };
      if (
        !node.isConnected ||
        (Math.abs(to.left - from.left) < 0.5 &&
          Math.abs(to.width - from.width) < 0.5)
      )
        return;
      settling = node.animate(
        [
          { left: `${from.left}px`, width: `${from.width}px` },
          { left: `${to.left}px`, width: `${to.width}px` },
        ],
        { duration: 240, easing: "cubic-bezier(0.28, 0.75, 0.32, 1.04)" },
      );
    });
  }

  function release() {
    const state = press;
    press = null;
    window.clearTimeout(hold);
    hold = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    if (!state?.dragging) return state;
    node.style.left = state.inlineLeft;
    node.style.width = state.inlineWidth;
    node.removeAttribute("data-dragging");
    if (node.hasPointerCapture(state.pointerId))
      node.releasePointerCapture(state.pointerId);
    options.preview(state.operation, null);
    options.active(false);
    return state;
  }

  function cancel() {
    const state = press;
    if (!state) return;
    const from = state.dragging
      ? position(state, travel(state, state.x))
      : null;
    release();
    if (from) settle(from);
  }

  function start() {
    hold = 0;
    if (!press || press.dragging) return;
    if (options.disabled()) return cancel();
    press.dragging = true;
    suppressClick = true;
    node.setPointerCapture(press.pointerId);
    node.setAttribute("data-dragging", press.operation);
    options.active(true);
    options.preview(press.operation, 0);
  }

  function paint() {
    frame = 0;
    const state = press;
    if (!state?.dragging) return;
    if (options.disabled()) return cancel();
    const dx = travel(state, state.x);
    const { left, width } = position(state, dx);
    node.style.left = `${left}px`;
    node.style.width = `${width}px`;
    const days = Math.round(dx / state.unit);
    if (days !== state.days) {
      state.days = days;
      options.preview(state.operation, days);
    }
    if (!state.scroll) return;
    // Near an edge of the visible days the axis scrolls under the held bar.
    const bounds = state.scroll.getBoundingClientRect();
    const lead = bounds.left + (Number(state.scroll.dataset.timelineLead) || 0);
    const depth =
      state.x < lead + edgeZone
        ? state.x - (lead + edgeZone)
        : state.x > bounds.right - edgeZone
          ? state.x - (bounds.right - edgeZone)
          : 0;
    if (!depth) return;
    const before = state.scroll.scrollLeft;
    state.scroll.scrollLeft +=
      Math.sign(depth) *
      Math.ceil(Math.min(1, Math.abs(depth) / edgeZone) * 14);
    if (state.scroll.scrollLeft !== before)
      frame = requestAnimationFrame(paint);
  }

  function down(event: PointerEvent) {
    if (press || !event.isPrimary || event.button !== 0) return;
    // A fresh press owns a fresh click.
    suppressClick = false;
    if (options.disabled()) return;
    const edge = (event.target as Element | null)
      ?.closest("[data-edge]")
      ?.getAttribute("data-edge");
    const scroll = node.closest<HTMLElement>("[data-timeline-scroll]");
    settling?.finish();
    settling = null;
    press = {
      pointerId: event.pointerId,
      touch: event.pointerType === "touch",
      operation: edge === "start" || edge === "end" ? edge : "move",
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      unit: options.unit(),
      span: options.span(),
      left: node.offsetLeft,
      width: node.offsetWidth,
      inlineLeft: node.style.left,
      inlineWidth: node.style.width,
      scroll,
      scrollStart: scroll?.scrollLeft ?? 0,
      dragging: false,
      days: 0,
    };
    // A finger on the bar may be scrolling the axis: only a hold picks it up,
    // so a swipe never changes a date that is saved without confirmation.
    if (press.touch) hold = window.setTimeout(start, holdDelay);
  }

  function move(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    press.x = event.clientX;
    if (!press.dragging) {
      const distance = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY,
      );
      if (press.touch) {
        if (distance > touchSlop) release();
        return;
      }
      if (distance < slop) return;
      start();
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- starting may have cancelled the gesture
    if (!press?.dragging) return;
    event.preventDefault();
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function up(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return;
    const state = press;
    if (!state.dragging) {
      release();
      return;
    }
    if (options.disabled()) return cancel();
    const dx = travel(state, event.clientX);
    const days = Math.round(dx / state.unit);
    release();
    if (days) options.commit(state.operation, days);
    settle(position(state, dx));
  }

  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  const touchmove = (event: TouchEvent) => {
    if (press?.dragging && event.cancelable) event.preventDefault();
  };
  const contextmenu = (event: MouseEvent) => {
    if (press?.touch) event.preventDefault();
  };

  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("touchmove", touchmove, { passive: false });
  node.addEventListener("contextmenu", contextmenu);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  const cancelGestures = gestureCancellation(node, {
    pointer: () => press?.pointerId ?? null,
    cancel,
  });
  return {
    update(value: Options) {
      options = value;
      if (press && options.disabled()) cancel();
    },
    destroy() {
      release();
      settling?.cancel();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("touchmove", touchmove);
      node.removeEventListener("contextmenu", contextmenu);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cancelGestures();
    },
  };
}
