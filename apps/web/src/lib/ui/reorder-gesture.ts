import { gestureCancellation } from "./gesture-cancellation.ts";

export type ReorderPointer<Snapshot> = {
  snapshot: Snapshot;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
};

export type ReorderGestureOptions<Snapshot> = {
  disabled: () => boolean;
  capture: (event: PointerEvent) => Snapshot | null;
  valid: (snapshot: Snapshot) => boolean;
  start: (pointer: ReorderPointer<Snapshot>) => void;
  paint: (pointer: ReorderPointer<Snapshot>) => void;
  /** Prepare the proposal before cleanup; apply it only after releasing capture. */
  drop: (pointer: ReorderPointer<Snapshot>) => (() => void) | undefined;
  release: (pointer: ReorderPointer<Snapshot>) => void;
  active?: (value: boolean) => void;
  cancelled?: (pointer: ReorderPointer<Snapshot>) => void;
  keydown?: (event: KeyboardEvent) => void;
  /** Whole-card touch surfaces wait for a hold, leaving ordinary scrolling native. */
  touchHold?: number;
};

/** Shared preview lifecycle; feature adapters retain their own source/write rules. */
export function reorderGesture<Snapshot>(
  node: HTMLElement,
  initial: ReorderGestureOptions<Snapshot>,
) {
  let options = initial;
  let pointer: ReorderPointer<Snapshot> | null = null;
  let frame = 0;
  let holdTimer = 0;
  let suppressClick = false;

  const valid = () =>
    pointer && !options.disabled() && options.valid(pointer.snapshot);

  function release() {
    const previous = pointer;
    pointer = null;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    if (!previous) return;
    options.release(previous);
    if (node.hasPointerCapture(previous.pointerId))
      node.releasePointerCapture(previous.pointerId);
    options.active?.(false);
    return previous;
  }

  function cancel() {
    const previous = release();
    if (previous) options.cancelled?.(previous);
  }

  function paint() {
    frame = 0;
    if (!valid()) return cancel();
    if (!pointer?.dragging) return;
    options.paint(pointer);
    frame = requestAnimationFrame(paint);
  }

  function start() {
    if (!valid()) return cancel();
    if (!pointer || pointer.dragging) return;
    pointer.dragging = true;
    suppressClick = true;
    node.setPointerCapture(pointer.pointerId);
    options.start(pointer);
    frame = requestAnimationFrame(paint);
  }

  function down(event: PointerEvent) {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    // A fresh press owns a fresh click, including controls outside a drag grip.
    suppressClick = false;
    if (options.disabled()) return;
    const snapshot = options.capture(event);
    if (!snapshot) return;
    pointer = {
      snapshot,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    options.active?.(true);
    if (options.touchHold) {
      // Capturing a whole card before pickup would retarget its ordinary click.
      if (event.pointerType === "touch")
        holdTimer = window.setTimeout(start, options.touchHold);
    } else {
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
    }
  }

  function move(event: PointerEvent) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!valid()) return cancel();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const distance = Math.hypot(
      pointer.x - pointer.startX,
      pointer.y - pointer.startY,
    );
    if (!pointer.dragging && distance >= 5) {
      // Movement before a whole-card touch hold belongs to native scrolling.
      if (pointer.pointerType === "touch" && options.touchHold) return cancel();
      start();
    }
    if (pointer?.dragging) event.preventDefault();
  }

  function up(event: PointerEvent) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!valid()) return cancel();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const commit = pointer.dragging ? options.drop(pointer) : undefined;
    release();
    commit?.();
  }

  function keydown(event: KeyboardEvent) {
    if (!pointer) options.keydown?.(event);
  }

  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  node.addEventListener("keydown", keydown);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  const removeCancellation = gestureCancellation(node, {
    pointer: () => pointer?.pointerId ?? null,
    cancel,
  });

  return {
    update(next: ReorderGestureOptions<Snapshot>) {
      options = next;
      if (pointer && !valid()) cancel();
    },
    destroy() {
      release();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      node.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      removeCancellation();
    },
  };
}

export function sameReorderOrder<T>(
  observed: readonly T[],
  current: readonly T[],
) {
  return (
    observed.length === current.length &&
    observed.every((value, index) => value === current[index])
  );
}

export function reorderKeyIndex(key: string, current: number, length: number) {
  if (current < 0 || current >= length) return null;
  const index =
    key === "ArrowUp"
      ? current - 1
      : key === "ArrowDown"
        ? current + 1
        : key === "Home"
          ? 0
          : key === "End"
            ? length - 1
            : null;
  return index === null ? null : Math.max(0, Math.min(length - 1, index));
}

export function insideReorderBounds(
  x: number,
  y: number,
  bounds: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
) {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

/** Rows exclude the source, so the result is already the final insertion index. */
export function reorderInsertionIndex(
  y: number,
  rows: readonly Pick<DOMRect, "top" | "bottom">[],
) {
  const index = rows.findIndex((row) => y < (row.top + row.bottom) / 2);
  return index < 0 ? rows.length : index;
}

export function reorderScrollDelta(
  y: number,
  bounds: Pick<DOMRect, "top" | "bottom">,
) {
  const edge = Math.min(48, (bounds.bottom - bounds.top) / 4);
  return y < bounds.top + edge
    ? -Math.min(12, bounds.top + edge - y)
    : y > bounds.bottom - edge
      ? Math.min(12, y - (bounds.bottom - edge))
      : 0;
}

export function cloneReorderPreview(
  source: HTMLElement,
  remove: string[] = [],
) {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const element of [clone, ...clone.querySelectorAll("*")]) {
    for (const attribute of ["id", "data-dragging", ...remove])
      element.removeAttribute(attribute);
  }
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  return clone;
}

/** Keep viewport proposals aligned inside a transformed native dialog/popover. */
export function positionReorderOverlay(
  overlay: HTMLElement,
  left: number,
  top: number,
  width?: number,
) {
  // A dialog entrance creates a fixed containing block. Infer its current
  // origin/scale from the overlay instead of assuming that block is the viewport.
  if (!overlay.style.left) overlay.style.left = "0px";
  if (!overlay.style.top) overlay.style.top = "0px";
  if (width !== undefined && !overlay.style.width)
    overlay.style.width = `${width}px`;
  const rect = overlay.getBoundingClientRect();
  const scaleX = rect.width / overlay.offsetWidth || 1;
  const scaleY = rect.height / overlay.offsetHeight || 1;
  const originX = rect.left - parseFloat(overlay.style.left) * scaleX;
  const originY = rect.top - parseFloat(overlay.style.top) * scaleY;
  overlay.style.left = `${(left - originX) / scaleX}px`;
  overlay.style.top = `${(top - originY) / scaleY}px`;
  if (width !== undefined) overlay.style.width = `${width / scaleX}px`;
}
