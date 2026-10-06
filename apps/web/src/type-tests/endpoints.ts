import { getCalendar, getGantt } from "../lib/api/planning";
import { planProjectTagRename, applyProjectTagRename } from "../lib/api/tags";
import {
  cancelAgentRun,
  getAgentConversation,
  getAgentRun,
  getAgentStatus,
  startAgentRun,
} from "../lib/api/agent";
import type {
  AgentConversation,
  AgentRun,
  AgentStatus,
  CalendarPage,
  GanttPage,
} from "../lib/contracts/api.generated";

// Compile-time examples only; this file is not imported by the application.
export function endpointContracts() {
  const calendar: Promise<CalendarPage> = getCalendar(
    { project: "project", from: "2026-09-01", to: "2026-09-30" },
    null,
  );
  const gantt: Promise<GanttPage> = getGantt("project", null);
  // @ts-expect-error Calendar responses are not timeline projections.
  const wrong: Promise<GanttPage> = calendar;
  // @ts-expect-error A rename requires its destination.
  void planProjectTagRename("project", { source: "old" });
  // @ts-expect-error Applying a reviewed rename requires its plan identifier.
  applyProjectTagRename("project", { set: { title: "card" } });
  const status: Promise<AgentStatus> = getAgentStatus();
  const started: Promise<AgentRun> = startAgentRun({
    run_id: "019913e8-8000-7000-8000-0000000000a1",
    boot_id: "55555555-5555-4555-8555-555555555555",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    message: "zrobiłem 10 pompek",
    context: { view: "list" },
  });
  const polled: Promise<AgentRun> = getAgentRun("run");
  const cancelled: Promise<AgentRun> = cancelAgentRun("run");
  const conversation: Promise<AgentConversation> =
    getAgentConversation("conversation");
  // @ts-expect-error A run needs the boot ID read from the status.
  void startAgentRun({ run_id: "run", conversation_id: "c", message: "m" });
  // @ts-expect-error The status is not a run.
  const wrongRun: Promise<AgentRun> = status;
  return {
    calendar,
    gantt,
    wrong,
    status,
    started,
    polled,
    cancelled,
    conversation,
    wrongRun,
  };
}
