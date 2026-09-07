import type { Summary } from "./api";
export type DateProposal = {
  path: string;
  version: string;
  schedule?: { start: string; end: string };
  dependencies?: string[];
  title?: string;
};
export type MoveProposal = {
  item: Summary;
  status: string;
  placement?: { after_id: string | null; before_id: string | null };
  neighbors: Summary[];
  firstPage: boolean;
  lastPage: boolean;
  autoCommit?: boolean;
};
