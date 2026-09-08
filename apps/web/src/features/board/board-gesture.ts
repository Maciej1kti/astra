export type BoardDrop = {
  left: number;
  top: number;
  width: number;
  label: string;
};
export type BoardGestureOptions = {
  disabled: () => boolean;
  target: (x: number, y: number) => BoardDrop | null;
  commit: () => void;
};

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

  function cancel() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    const id = pointer;
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    ghost?.remove();
    indicator?.remove();
    ghost = indicator = null;
    node.removeAttribute("data-dragging");
    if (id !== null && node.hasPointerCapture(id))
      node.releasePointerCapture(id);
    if (id !== null) window.dispatchEvent(new Event("planning-gesture-ended"));
    active = false;
    captured = null;
  }
  function start() {
    if (pointer === null) return;
    node.setPointerCapture(pointer);
    active = true;
    suppressClick = true;
    node.setAttribute("data-dragging", "true");
    const rect = node.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;
    ghost = node.cloneNode(true) as HTMLElement;
    for (const element of [ghost, ...ghost.querySelectorAll("*")]) {
      for (const name of [
        "id",
        "data-board-card",
        "data-dragging",
        "aria-label",
      ])
        element.removeAttribute(name);
    }
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-board-drag-preview", "");
    Object.assign(ghost.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "10000",
      margin: "0",
      width: `${rect.width}px`,
      boxSizing: "border-box",
      opacity: "1",
      background: "var(--paper)",
      color: "var(--ink)",
      border: "1px solid var(--line)",
      borderRadius: "8px",
      boxShadow: "0 12px 28px #0003",
    });
    indicator = document.createElement("div");
    indicator.setAttribute("data-board-drop-indicator", "");
    indicator.setAttribute("aria-hidden", "true");
    Object.assign(indicator.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "10001",
      height: "4px",
      borderRadius: "2px",
      background: "var(--ink)",
      display: "none",
    });
    document.body.append(ghost, indicator);
  }
  function paint(time: number) {
    frame = 0;
    if (!active || !captured || !ghost || !indicator) return;
    const step = Math.min(previousTime ? time - previousTime : 16, 32) * 0.45;
    previousTime = time;
    ghost.style.left = `${x - offsetX}px`;
    ghost.style.top = `${y - offsetY}px`;
    const board = node.closest<HTMLElement>(".date-scroll");
    if (board) {
      const rect = board.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        const direction =
          x >= rect.left - 24 && x < rect.left + 36
            ? -1
            : x <= rect.right + 24 && x > rect.right - 36
              ? 1
              : 0;
        board.scrollLeft += direction * step;
      }
    }
    const column = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-kanban-column-cards]");
    if (column) {
      const rect = column.getBoundingClientRect();
      const direction = y < rect.top + 36 ? -1 : y > rect.bottom - 36 ? 1 : 0;
      column.scrollTop += direction * step;
    }
    const target = captured.target(x, y);
    indicator.style.display = target ? "block" : "none";
    if (target) {
      indicator.style.left = `${target.left}px`;
      indicator.style.top = `${target.top - 2}px`;
      indicator.style.width = `${target.width}px`;
    }
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
    if (touch)
      holdTimer = window.setTimeout(() => {
        start();
        frame = requestAnimationFrame(paint);
      }, 250);
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
    const target = active ? intent?.target(event.clientX, event.clientY) : null;
    cancel();
    if (target) intent?.commit();
  }
  function click(event: MouseEvent) {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }
  function second(event: PointerEvent) {
    if (pointer !== null && event.pointerId !== pointer) cancel();
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") cancel();
  }
  const touchmove = (event: TouchEvent) => {
    if (active && event.cancelable) event.preventDefault();
  };
  const contextmenu = (event: MouseEvent) => {
    if (active) event.preventDefault();
  };
  const dragstart = (event: DragEvent) => event.preventDefault();
  node.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("lostpointercapture", cancel);
  node.addEventListener("click", click, true);
  node.addEventListener("dragstart", dragstart);
  node.addEventListener("contextmenu", contextmenu);
  node.addEventListener("touchmove", touchmove, { passive: false });
  window.addEventListener("pointerdown", second, true);
  window.addEventListener("keydown", key);
  for (const name of ["blur", "orientationchange", "session-ended"])
    window.addEventListener(name, cancel);
  return {
    update(next: BoardGestureOptions) {
      options = next;
    },
    destroy() {
      cancel();
      node.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("lostpointercapture", cancel);
      node.removeEventListener("click", click, true);
      node.removeEventListener("dragstart", dragstart);
      node.removeEventListener("contextmenu", contextmenu);
      node.removeEventListener("touchmove", touchmove);
      window.removeEventListener("pointerdown", second, true);
      window.removeEventListener("keydown", key);
      for (const name of ["blur", "orientationchange", "session-ended"])
        window.removeEventListener(name, cancel);
    },
  };
}
