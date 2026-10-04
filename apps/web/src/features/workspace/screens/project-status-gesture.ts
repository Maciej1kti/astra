import type { Summary } from "../../../lib/api/api";
import { gestureCancellation } from "../../../lib/ui/gesture-cancellation.ts";
import {
  canMoveProject,
  currentProjectSnapshot,
  projectState,
  projectStateLabels,
  type ProjectState,
} from "./projects-board.ts";

type Options = {
  projects: () => Summary[];
  scope: () => string;
  disabled: () => boolean;
  commit: (project: Summary, state: ProjectState) => void;
  announce: (message: string) => void;
};
type Pointer = {
  project: Summary;
  scope: string;
  source: HTMLElement;
  handle: HTMLButtonElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
};

function inside(x: number, y: number, bounds: DOMRect) {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

function scrollDelta(position: number, start: number, end: number) {
  const edge = Math.min(48, (end - start) / 4);
  return position < start + edge
    ? -Math.min(12, start + edge - position)
    : position > end - edge
      ? Math.min(12, position - (end - edge))
      : 0;
}

/** Explicit handle gestures retain the observed project until a conditional proposal. */
export function projectStatusGesture(node: HTMLElement, initial: Options) {
  let options = initial;
  let pointer: Pointer | null = null;
  let preview: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  let frame = 0;
  let suppressClick = false;

  function valid() {
    return (
      pointer &&
      !options.disabled() &&
      pointer.scope === options.scope() &&
      currentProjectSnapshot(pointer.project, options.projects())
    );
  }

  function clearTarget() {
    target?.removeAttribute("data-project-board-drop-target");
    target = null;
  }

  function destination(current: Pointer) {
    clearTarget();
    if (!inside(current.x, current.y, node.getBoundingClientRect()))
      return null;
    const column = [
      ...node.querySelectorAll<HTMLElement>("[data-project-state]"),
    ].find((item) =>
      inside(current.x, current.y, item.getBoundingClientRect()),
    );
    const state =
      column && projectState({ status: column.dataset.projectState });
    if (!state || state === current.project.status) return null;
    target = column;
    target?.setAttribute("data-project-board-drop-target", "true");
    return state;
  }

  function release() {
    const previous = pointer;
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    preview?.remove();
    preview = null;
    clearTarget();
    if (!previous) return null;
    previous.source.removeAttribute("data-dragging");
    previous.handle.setAttribute("aria-pressed", "false");
    if (node.hasPointerCapture(previous.pointerId))
      node.releasePointerCapture(previous.pointerId);
    return previous;
  }

  function cancel() {
    const previous = release();
    suppressClick = false;
    if (!previous) return;
    if (previous.handle.isConnected && !previous.handle.disabled)
      previous.handle.focus({ preventScroll: true });
    if (previous.dragging) options.announce("Status projektu bez zmian.");
  }

  function paint() {
    frame = 0;
    if (!valid()) return cancel();
    if (!pointer?.dragging || !preview) return;
    preview.style.left = `${pointer.x - pointer.offsetX}px`;
    preview.style.top = `${pointer.y - pointer.offsetY}px`;
    const bounds = node.getBoundingClientRect();
    if (inside(pointer.x, pointer.y, bounds)) {
      node.scrollLeft += scrollDelta(pointer.x, bounds.left, bounds.right);
      window.scrollBy(0, scrollDelta(pointer.y, 0, window.innerHeight));
    }
    destination(pointer);
    frame = requestAnimationFrame(paint);
  }

  function start(current: Pointer) {
    current.dragging = true;
    suppressClick = true;
    const bounds = current.source.getBoundingClientRect();
    current.source.setAttribute("data-dragging", "true");
    current.handle.setAttribute("aria-pressed", "true");
    preview = current.source.cloneNode(true) as HTMLElement;
    for (const element of [preview, ...preview.querySelectorAll("*")]) {
      for (const attribute of [
        "id",
        "data-dragging",
        "data-project-board-item",
        "data-project-board-handle",
        "data-project-board-open",
      ])
        element.removeAttribute(attribute);
    }
    preview.inert = true;
    preview.setAttribute("aria-hidden", "true");
    preview.setAttribute("data-project-board-drag-preview", "");
    Object.assign(preview.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "var(--layer-drag-preview)",
      margin: "0",
      width: `${bounds.width}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      boxSizing: "border-box",
      opacity: "1",
      boxShadow: "var(--shadow-floating)",
    });
    (node.closest(".app") ?? document.body).append(preview);
    options.announce(
      `${current.project.title} podniesiony. Przenieś do innej kolumny statusu.`,
    );
    frame = requestAnimationFrame(paint);
  }

  function down(event: PointerEvent) {
    if (!pointer) suppressClick = false;
    if (pointer || !event.isPrimary || event.button !== 0 || options.disabled())
      return;
    const handle = (event.target as Element).closest<HTMLButtonElement>(
      "[data-project-board-handle]",
    );
    const source = handle?.closest<HTMLElement>("[data-project-board-item]");
    const project = options
      .projects()
      .find((item) => item.id === source?.dataset.projectBoardItem);
    if (!handle || !source || !project || !canMoveProject(project)) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    const bounds = source.getBoundingClientRect();
    suppressClick = false;
    pointer = {
      project,
      scope: options.scope(),
      source,
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      dragging: false,
    };
    node.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!valid()) return cancel();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (
      !pointer.dragging &&
      Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) >= 5
    )
      start(pointer);
    if (pointer?.dragging) event.preventDefault();
  }

  function up(event: PointerEvent) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!valid()) return cancel();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const state = pointer.dragging ? destination(pointer) : null;
    const observed = release();
    if (!state || !observed) {
      if (observed?.dragging) options.announce("Status projektu bez zmian.");
      return;
    }
    options.announce(
      `Przenoszenie ${observed.project.title} do ${projectStateLabels[state]}.`,
    );
    options.commit(observed.project, state);
  }

  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    if (!event.detail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("click", click, true);
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  const removeCancellation = gestureCancellation(node, {
    pointer: () => pointer?.pointerId ?? null,
    cancel,
  });

  return {
    update(next: Options) {
      options = next;
      if (pointer && !valid()) cancel();
    },
    destroy() {
      release();
      removeCancellation();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    },
  };
}
