import type { TimedEvent } from "../contracts/domain.generated";

/** UTC arithmetic preserves civil clock fields without browser timezone shifts. */
export function eventEnd(event: TimedEvent): string {
  const start = Date.parse(`${event.start}:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(event.start) ||
    !Number.isFinite(start) ||
    new Date(start).toISOString().slice(0, 16) !== event.start ||
    !Number.isInteger(event.duration_minutes) ||
    event.duration_minutes < 1 ||
    event.duration_minutes > 10080
  )
    throw new Error(
      "Wydarzenie wymaga prawidłowej daty, godziny i czasu trwania od 1 do 10080 minut.",
    );
  const end = new Date(start + event.duration_minutes * 60000).toISOString();
  if (end.length !== 24)
    throw new Error("Koniec wydarzenia wykracza poza obsługiwany kalendarz.");
  return end.slice(0, 16);
}

export function eventDates(event: TimedEvent) {
  const end = eventEnd(event);
  return {
    start: event.start.slice(0, 10),
    end: new Date(Date.parse(`${end}:00Z`) - 1).toISOString().slice(0, 10),
  };
}

/** Calendar callbacks expose local Date fields, not real event instants. */
export function eventFromDates(start: Date, end?: Date): TimedEvent {
  const civil = (date: Date) =>
    `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const value = civil(start);
  const event = {
    start: value,
    duration_minutes: end
      ? (Date.parse(`${civil(end)}:00Z`) - Date.parse(`${value}:00Z`)) / 60000
      : 60,
  };
  eventEnd(event);
  return event;
}
