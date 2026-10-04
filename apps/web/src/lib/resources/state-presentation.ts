import { resourceLabel } from "./resource-presentation.ts";

const labels: Record<string, string> = {
  pending: "Oczekuje",
  approved: "Zatwierdzone",
  denied: "Odrzucone",
  expired: "Wygasłe",
  ready: "Gotowe",
  healthy: "Sprawny",
  degraded: "Ograniczony",
  rebuilding: "Odbudowa",
  reconciling: "Uzgadnianie",
  stale: "Nieaktualne",
  fresh: "Aktualne",
  missing: "Brak",
  recovery_required: "Wymaga odzyskania",
  queued: "W kolejce",
  running: "W toku",
  committed: "Zapisane",
  rejected: "Odrzucone",
  completed: "Zakończone",
  failed: "Niepowodzenie",
  building: "Odbudowa",
};

/** Operational state labels belong to the deferred administrative surfaces. */
export function stateLabel(value: string): string {
  return labels[value] ?? resourceLabel(value);
}
