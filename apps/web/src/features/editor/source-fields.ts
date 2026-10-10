import {
  formatTimestamp,
  resourceLabel,
} from "../../lib/resources/resource-presentation.ts";
import { validCalendarDate } from "../../lib/ui/calendar-dates.ts";
import { counted, uiLocale } from "../../lib/ui/locale.ts";
import { cardSections } from "./card-layout.ts";

const labels = new Map<string, string>([
  ["title", "Tytuł"],
  ["name", "Nazwa"],
  ["status", "Status"],
  ["state", "Status"],
  ["priority", "Priorytet"],
  ["labels", cardSections.labels],
  ["schedule", "Plan"],
  ["event", "Wydarzenie"],
  ["due", "Termin"],
  ["archived", "Zarchiwizowane"],
  ["pinned", "Przypięcie do Focus"],
  ["acceptance", cardSections.checklist],
  ["counters", cardSections.counters],
  ["comments", cardSections.comments],
  ["hidden_sections", "Ukryte sekcje"],
  ["position", "Kolejność"],
  ["folder", "Folder"],
  ["body", cardSections.description],
  ["id", "Identyfikator"],
  ["created_at", "Utworzono"],
  ["updated_at", "Zmieniono"],
  ["schema_version", "Wersja schematu"],
  ["kind", "Rodzaj"],
  ["author", "Autor"],
  ["target", "Dotyczy"],
  ["recorded_at", "Zapisano"],
  ["observed_at", "Zaobserwowano"],
]);

/** Source fields as the editor names them; extensions keep their identifier. */
export function fieldLabel(name: string): string {
  return labels.get(name) ?? name;
}

export type SourceField = { name: string; label: string; value: string };

const empty = "—";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const civilDate = (value: unknown) =>
  typeof value === "string" && validCalendarDate(value)
    ? new Intl.DateTimeFormat(uiLocale, {
        timeZone: "UTC",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00Z`))
    : String(value);
const counts: Record<string, [string, string, string]> = {
  acceptance: ["pozycja", "pozycje", "pozycji"],
  comments: ["komentarz", "komentarze", "komentarzy"],
  counters: ["licznik", "liczniki", "liczników"],
};

function present(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "boolean") return value ? "Tak" : "Nie";
  if (typeof value === "string") {
    if (["status", "state", "priority", "kind"].includes(name))
      return resourceLabel(value);
    return name.endsWith("_at") ? formatTimestamp(value) : value;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const forms = counts[name];
    if (forms) return counted(value.length, ...forms);
    if (!value.every((item) => typeof item === "string"))
      return JSON.stringify(value);
    if (!value.length) return empty;
    return value
      .map((item) =>
        name === "hidden_sections" && item in cardSections
          ? cardSections[item as keyof typeof cardSections]
          : item,
      )
      .join(", ");
  }
  if (record(value)) {
    if (name === "schedule" && "start" in value && "end" in value)
      return `${civilDate(value.start)} – ${civilDate(value.end)}`;
    if (name === "due" && "date" in value) return civilDate(value.date);
    if (
      name === "event" &&
      typeof value.start === "string" &&
      typeof value.duration_minutes === "number"
    )
      return `${civilDate(value.start.slice(0, 10))}, ${value.start.slice(11)} · ${value.duration_minutes} min`;
    if (name === "author" && typeof value.label === "string")
      return value.label;
    if (
      name === "target" &&
      typeof value.type === "string" &&
      typeof value.id === "string"
    )
      return `${resourceLabel(value.type)} · ${value.id}`;
  }
  // An unrecognized shape stays visible rather than being silently dropped.
  return JSON.stringify(value);
}

/** A saved source as labelled text, for comparing with a retained draft. */
export function sourceFields(source: {
  metadata: object;
  body: string;
}): SourceField[] {
  return [
    ...Object.entries(source.metadata),
    ["body", source.body] as const,
  ].map(([name, value]) => ({
    name,
    label: fieldLabel(name),
    value: present(name, value),
  }));
}
