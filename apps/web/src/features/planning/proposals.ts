import type { Summary } from "../../lib/api/api";
export type DateProposal = {
  path: string;
  version: string;
  schedule?: { start: string; end: string };
  event?: import("../../lib/contracts/domain.generated").TimedEvent;
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
