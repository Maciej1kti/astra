import type { BoardGestureOptions } from "./board-gesture";
import type { Summary } from "./api";

export const BOARD_CONTEXT = Symbol("astra-board");
export type BoardContext = {
  open: (item: Summary) => void;
  reorder: (item: Summary, direction: -1 | 1) => void;
  busy: () => boolean;
  gesture: (item: Summary) => BoardGestureOptions;
};
