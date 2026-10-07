import type { BoardRect } from "./board-gesture";

/** The first place whose middle lies below the pointer; past the last one otherwise. */
export function insertionIndex(middles: readonly number[], y: number) {
  const index = middles.findIndex((middle) => y < middle);
  return index < 0 ? middles.length : index;
}

/**
 * How far each remaining card moves while one is held: those after the source
 * close its place, those from the slot onwards open a new one.
 */
export function partedOffsets(
  count: number,
  size: number,
  sourceIndex: number | null,
  slotIndex: number | null,
) {
  return Array.from(
    { length: count },
    (_, index) =>
      (sourceIndex !== null && index >= sourceIndex ? -size : 0) +
      (slotIndex !== null && index >= slotIndex ? size : 0),
  );
}

const CARDS = "[data-kanban-column-cards]";
/** A glide back that a new drag on the same board must not cut short. */
const gliding = new WeakMap<HTMLElement, number>();
const pixels = (value: string) => Number.parseFloat(value) || 0;

/**
 * Parts the rendered cards around the place a held card would take. Rows keep
 * their layout and move by transform only, so every measurement here comes from
 * layout offsets, which transforms and their transitions do not disturb.
 */
export class BoardReflow {
  readonly #root: HTMLElement;
  readonly #source: HTMLElement;
  readonly #home: HTMLElement | null;
  readonly #height: number;
  readonly #size: number;
  #slot: { column: HTMLElement; index: number } | null = null;
  #roomy: HTMLElement | null = null;

  constructor(root: HTMLElement, card: HTMLElement) {
    this.#root = root;
    this.#source = card.closest<HTMLElement>(".wx-card-row") ?? card;
    this.#home = this.#source.closest<HTMLElement>(CARDS);
    this.#height = this.#source.offsetHeight;
    this.#size =
      this.#height +
      (this.#home ? pixels(getComputedStyle(this.#home).rowGap) : 0);
    window.clearTimeout(gliding.get(root));
    root.setAttribute("data-board-reflow", "");
    this.apply(null);
  }

  /** The other rows of a column, in order. */
  #rows(column: HTMLElement) {
    return [...column.children].filter(
      (row): row is HTMLElement =>
        row instanceof HTMLElement &&
        row !== this.#source &&
        row.classList.contains("wx-card-row"),
    );
  }
  /** The source's place among the other rows of its own column. */
  #sourceIndex(column: HTMLElement, rows: HTMLElement[]) {
    if (column !== this.#home) return null;
    const index = rows.findIndex(
      (row) =>
        this.#source.compareDocumentPosition(row) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    return index < 0 ? rows.length : index;
  }
  /** Viewport tops of the other rows as if the source had already left. */
  #tops(column: HTMLElement, rows: HTMLElement[]) {
    const bounds = column.getBoundingClientRect();
    const origin = bounds.top + column.clientTop - column.scrollTop;
    const closed = partedOffsets(
      rows.length,
      this.#size,
      this.#sourceIndex(column, rows),
      null,
    );
    return rows.map(
      (row, index) =>
        origin +
        row.offsetTop -
        (row.offsetParent === column ? 0 : column.offsetTop) +
        (closed[index] ?? 0),
    );
  }

  /** Where the pointer would insert among the column's other rows. */
  index(column: HTMLElement, y: number) {
    const rows = this.#rows(column);
    const tops = this.#tops(column, rows);
    return insertionIndex(
      rows.map((row, index) => (tops[index] ?? 0) + row.offsetHeight / 2),
      y,
    );
  }
  count(column: HTMLElement) {
    return this.#rows(column).length;
  }

  /** Opens the slot, closes the source's place and returns the slot's box. */
  apply(slot: { column: HTMLElement; index: number } | null) {
    const changed =
      slot?.column !== this.#slot?.column || slot?.index !== this.#slot?.index;
    this.#slot = slot;
    if (changed || !slot) {
      for (const column of this.#root.querySelectorAll<HTMLElement>(CARDS)) {
        const rows = this.#rows(column);
        const offsets = partedOffsets(
          rows.length,
          this.#size,
          this.#sourceIndex(column, rows),
          slot?.column === column ? slot.index : null,
        );
        rows.forEach((row, index) => {
          const offset = offsets[index] ?? 0;
          row.style.transform = offset ? `translateY(${offset}px)` : "";
        });
      }
      // A slot past the last card of another column needs room to scroll into.
      const roomy = slot && slot.column !== this.#home ? slot.column : null;
      if (roomy !== this.#roomy) {
        if (this.#roomy) this.#roomy.style.paddingBottom = "";
        if (roomy)
          roomy.style.paddingBottom = `${pixels(getComputedStyle(roomy).paddingBottom) + this.#size}px`;
        this.#roomy = roomy;
      }
    }
    return slot ? this.#box(slot) : null;
  }
  #box(slot: { column: HTMLElement; index: number }): BoardRect {
    const rows = this.#rows(slot.column);
    const tops = this.#tops(slot.column, rows);
    const bounds = slot.column.getBoundingClientRect();
    const style = getComputedStyle(slot.column);
    const last = rows.at(-1);
    const left =
      bounds.left + slot.column.clientLeft + pixels(style.paddingLeft);
    return {
      left,
      top:
        tops[slot.index] ??
        (last
          ? (tops.at(-1) ?? 0) + last.offsetHeight + (this.#size - this.#height)
          : bounds.top +
            slot.column.clientTop -
            slot.column.scrollTop +
            pixels(style.paddingTop)),
      width:
        slot.column.clientWidth -
        pixels(style.paddingLeft) -
        pixels(style.paddingRight),
      height: this.#height,
    };
  }

  /** Returns every row to its layout, gliding unless the layout itself changes now. */
  clear(glide: boolean) {
    if (!glide) this.#root.removeAttribute("data-board-reflow");
    for (const row of this.#root.querySelectorAll<HTMLElement>(".wx-card-row"))
      row.style.transform = "";
    if (this.#roomy) this.#roomy.style.paddingBottom = "";
    this.#roomy = null;
    this.#slot = null;
    if (glide) {
      const root = this.#root;
      gliding.set(
        root,
        window.setTimeout(() => root.removeAttribute("data-board-reflow"), 220),
      );
    }
  }
}
