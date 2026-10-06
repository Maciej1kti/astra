import type { Summary } from "../api/api";

const labels: Record<string, string> = {
  planned: "Zaplanowane",
  active: "Aktywne",
  review: "Do sprawdzenia",
  done: "Gotowe",
  achieved: "Osiągnięte",
  cancelled: "Anulowane",
  normal: "Normalny",
  high: "Wysoki",
  decision_needed: "Potrzebna decyzja",
  paused: "Wstrzymane",
  archived: "Zarchiwizowane",
  overdue: "Po terminie",
  due_soon: "Zbliżający się termin",
  unread_report: "Nieprzeczytany raport",
  review_card: "Karta do sprawdzenia",
  project: "Projekt",
  card: "Karta",
  milestone: "Kamień milowy",
  update: "Aktualizacja",
  result: "Wynik",
  blocker: "Przeszkoda",
  decision: "Decyzja",
  note: "Notatka",
  correction: "Poprawka",
  human: "Człowiek",
  agent: "Bot",
  bot: "Bot",
  unavailable: "Niedostępne",
  stale: "Nieaktualne",
  prepared: "Przygotowane",
  blocked: "Zablokowane",
  needs_review: "Wymaga sprawdzenia",
};

export function resourceLabel(value: string): string {
  return labels[value] ?? "Nieznane";
}

export type ResourceDateBadge = {
  kind: "due" | "plan" | "event";
  duration?: number;
  label: string;
  start: string;
  end?: string;
};

/** Keep milestone due dates and planned work separate on every surface. */
export function resourceDates(item: Summary): ResourceDateBadge[] {
  const dates: ResourceDateBadge[] = [];
  if (item.type === "milestone" && item.due) {
    dates.push({
      kind: "due",
      label: "Termin",
      start: item.due.date,
    });
  }
  if (item.schedule) {
    dates.push({
      kind: "plan",
      label: "Plan",
      start: item.schedule.start,
      ...(item.schedule.end !== item.schedule.start
        ? { end: item.schedule.end }
        : {}),
    });
  }
  if (item.event)
    dates.push({
      kind: "event",
      label: "Wydarzenie",
      start: item.event.start,
      duration: item.event.duration_minutes,
    });
  return dates;
}

/** Human-readable instants retain an explicit zone in resource details. */
export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}
