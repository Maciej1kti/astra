const commonMessages: Record<string, string> = {
  CARD_IN_FOCUS:
    "Ta karta jest przypięta do Focus. Usuń ją z Focus przed usunięciem.",
  VERSION_CONFLICT:
    "Ten element zmienił się od otwarcia. Wersja robocza została zachowana.",
  UNDO_TARGET_CHANGED:
    "Późniejsza zmiana uniemożliwia cofnięcie. Zapisany element nie został zmieniony.",
  EPOCH_CHANGED:
    "Stan serwera się zmienił. Sprawdź aktualny element przed rozpoczęciem nowego polecenia.",
  SESSION_REQUIRED: "Sesja wygasła. Połącz tę przeglądarkę ponownie.",
  FOCUS_TARGET_ARCHIVED:
    "Ta przypięta karta jest zarchiwizowana. Sprawdź aktualny Focus.",
  NOT_FOUND: "Nie znaleziono elementu.",
};
let detailedMessages: Record<string, string> = {};
let loading: Promise<void> | undefined;

/** Detailed failures and warnings load only when a response needs them. */
export function loadMessages(): Promise<void> {
  return (loading ??= import("./message-catalog.ts")
    .then(({ messages }) => {
      detailedMessages = messages;
    })
    .catch(() => {
      // The Polish fallback remains usable if this optional chunk is unavailable.
      loading = undefined;
    }));
}

/** Translate protocol codes without exposing English server prose in the UI. */
export function serverMessage(code = "", status?: number): string {
  const message = detailedMessages[code] ?? commonMessages[code];
  if (message) return message;
  if (code.startsWith("INVALID_"))
    return "Wprowadzone dane są nieprawidłowe. Sprawdź pola formularza.";
  if (code.startsWith("PROJECT_TREE_"))
    return "Folder projektu nie spełnia wymagań tej operacji. Sprawdź diagnostykę.";
  if (code.startsWith("GIT_"))
    return "Nie udało się sprawdzić repozytorium Git.";
  if (code.endsWith("_LIMIT") || code.endsWith("_TOO_LARGE"))
    return "Osiągnięto limit tej operacji. Zawęź zakres danych.";
  if (status === 401 || status === 403)
    return "Nie udało się potwierdzić dostępu. Połącz tę przeglądarkę ponownie.";
  return `Serwer zgłosił problem${code ? ` (${code})` : status ? ` (${status})` : ""}. Sprawdź diagnostykę.`;
}

export function errorMessage(cause: unknown): string {
  // Transport and reply failures carry their own text; this is local JSON input.
  if (cause instanceof SyntaxError)
    return "Nieprawidłowe dane JSON. Sprawdź ich składnię.";
  if (cause instanceof Error && !(cause instanceof TypeError)) {
    if (cause.name === "AbortError")
      return "Operacja została przerwana. Sprawdź wynik oczekującego zapisu.";
    if (cause.name === "TimeoutError")
      return "Upłynął czas oczekiwania. Sprawdź wynik oczekującego zapisu.";
    return cause.message;
  }
  return "Operacja nie powiodła się. Sprawdź połączenie i diagnostykę.";
}
