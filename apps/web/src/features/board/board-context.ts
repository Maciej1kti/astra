import type { Snippet } from "svelte";
import type { BoardGestureOptions } from "./board-gesture";
import type { Summary } from "../../lib/api/api";

/** One column of any board; the host decides what its identifier means. */
export type KanbanColumn = {
  id: string;
  label: string;
  total: number;
  items: Summary[];
  /** Whether the loaded items start and end the column; an edge of a partial page has no known neighbour. */
  firstPage: boolean;
  lastPage: boolean;
  /** Cards neither leave nor enter a locked column. */
  locked?: boolean;
};
export type KanbanPlacement = {
  after_id: string | null;
  before_id: string | null;
};

export const BOARD_CONTEXT = Symbol("astra-board");
export type BoardContext = {
  /** The loaded summary of a card; the view may still hold the one it first rendered. */
  current: (id: string) => Summary | undefined;
  open: (item: Summary) => void;
  reorder: (item: Summary, direction: -1 | 1) => void;
  /** Moves the card to the neighbouring column. */
  shift: (item: Summary, direction: -1 | 1) => void;
  /** The card a drag preview stands in for, until the preview has landed. */
  held: () => string | null;
  busy: () => boolean;
  ordered: () => boolean;
  gesture: (item: Summary) => BoardGestureOptions;
  details: () => Snippet<[Summary]> | undefined;
  actions: () => Snippet<[Summary]> | undefined;
};
