import { uiLocale } from "./locale.ts";

const names = (field: "month" | "weekday", width: "long" | "short") =>
  Array.from({ length: field === "month" ? 12 : 7 }, (_, index) =>
    new Intl.DateTimeFormat(uiLocale, {
      [field]: width,
      timeZone: "UTC",
    }).format(
      new Date(
        field === "month"
          ? Date.UTC(2026, index, 1)
          : Date.UTC(2026, 0, 4 + index),
      ),
    ),
  );

/** Native widgets retain their protocol keys and receive Polish presentation words. */
export const widgetWords = {
  lang: uiLocale,
  calendar: {
    monthFull: names("month", "long"),
    monthShort: names("month", "short"),
    dayFull: names("weekday", "long"),
    dayShort: names("weekday", "short"),
    hours: "Godziny",
    minutes: "Minuty",
    done: "Gotowe",
    clear: "Wyczyść",
    today: "Dzisiaj",
    am: ["przed południem", "przed południem"],
    pm: ["po południu", "po południu"],
    weekStart: 1,
    clockFormat: 24,
  },
  formats: {
    timeFormat: "%H:%i",
    dateFormat: "%d.%m.%Y",
    monthYearFormat: "%F %Y",
    yearFormat: "%Y",
  },
  core: {
    ok: "OK",
    cancel: "Anuluj",
    select: "Wybierz",
    "No data": "Brak danych",
    "Rows per page": "Wierszy na stronę",
    "Total pages": "Liczba stron",
  },
  kanban: {
    Title: "Tytuł",
    Description: "Opis",
    Priority: "Priorytet",
    Deadline: "Termin",
    Tags: "Tagi",
    Users: "Użytkownicy",
    Low: "Niski",
    Medium: "Średni",
    High: "Wysoki",
    Sort: "Sortuj",
    "Title A-Z": "Tytuł A–Z",
    "Title Z-A": "Tytuł Z–A",
    "Priority Low-High": "Priorytet rosnąco",
    "Priority High-Low": "Priorytet malejąco",
    "Clear sorting": "Wyczyść sortowanie",
    "Edit card": "Edytuj kartę",
    "Kanban board": "Tablica kart",
    "Expand column": "Rozwiń kolumnę",
    "Collapse column": "Zwiń kolumnę",
    "Add card to": "Dodaj kartę do",
    "Card menu": "Menu karty",
    Card: "Karta",
    Column: "Kolumna",
    Progress: "Postęp",
    Attachments: "Załączniki",
    Comments: "Komentarze",
    Add: "Dodaj",
    Edit: "Edytuj",
    Delete: "Usuń",
    "Add card": "Dodaj kartę",
    "Add column": "Dodaj kolumnę",
    "Move up": "Przenieś w górę",
    "Move down": "Przenieś w dół",
    "Move left": "Przenieś w lewo",
    "Move right": "Przenieś w prawo",
    "Move to": "Przenieś do",
    "Duplicate card": "Duplikuj kartę",
    "Delete card": "Usuń kartę",
  },
};
