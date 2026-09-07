import type { Summary } from "./api";
import type { MoveProposal } from "./proposals";

export const BOARD_CONTEXT = Symbol("astra-board");
export type BoardContext = {
  open: (item: Summary) => void;
  update: (item: Summary) => void;
  propose: (
    item: Summary,
    status: string,
    placement?: MoveProposal["placement"],
  ) => void;
  disabled: () => boolean;
  busy: () => boolean;
  gesture: (item: Summary) => {
    delta: (x: number, y: number) => number;
    commit: () => void;
  };
};
