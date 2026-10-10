import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldLabel,
  sourceFields,
} from "../../apps/web/src/features/editor/source-fields.ts";

test("history names source fields the way the editor labels them", () => {
  assert.deepEqual(
    ["title", "status", "due", "body", "archived", "labels"].map(fieldLabel),
    ["Tytuł", "Status", "Termin", "Opis", "Zarchiwizowane", "Etykiety"],
  );
  assert.equal(fieldLabel("acceptance"), "Lista kontrolna");
  assert.equal(fieldLabel("hidden_sections"), "Ukryte sekcje");
});

test("extension and unknown fields keep their identifier", () => {
  assert.equal(fieldLabel("x-evidence"), "x-evidence");
  assert.equal(fieldLabel("future_field"), "future_field");
  // Inherited object members are not labels.
  assert.equal(fieldLabel("constructor"), "constructor");
});

test("a saved card is presented with labels, dates and state names", () => {
  const fields = sourceFields({
    metadata: {
      id: "5f0c7a52-4a0f-4d0e-9d55-0d0d7f6f3a11",
      created_at: "2026-09-01T08:15:00Z",
      updated_at: "2026-09-02T10:30:00Z",
      title: "Changed elsewhere",
      status: "review",
      priority: "high",
      position: "a0",
      archived: false,
      pinned: true,
      schedule: { start: "2026-09-08", end: "2026-09-09" },
      labels: ["Backend", "Pilne"],
      acceptance: [
        { id: "a", text: "First", done: true },
        { id: "b", text: "Second", done: false },
      ],
      comments: [{ id: "c" }],
      counters: [],
      hidden_sections: ["comments", "labels"],
    },
    body: "Saved body",
  });
  const value = (label) => fields.find((field) => field.label === label)?.value;
  assert.equal(value("Tytuł"), "Changed elsewhere");
  assert.equal(value("Status"), "Do sprawdzenia");
  assert.equal(value("Priorytet"), "Wysoki");
  assert.equal(value("Zarchiwizowane"), "Nie");
  assert.equal(value("Przypięcie do Focus"), "Tak");
  assert.equal(value("Plan"), "8 września 2026 – 9 września 2026");
  assert.equal(value("Etykiety"), "Backend, Pilne");
  assert.equal(value("Lista kontrolna"), "2 pozycje");
  assert.equal(value("Komentarze"), "1 komentarz");
  assert.equal(value("Liczniki"), "0 liczników");
  assert.equal(value("Ukryte sekcje"), "Komentarze, Etykiety");
  // The joiner between date and time depends on the runtime's locale data.
  assert.match(value("Zmieniono"), /^2 wrz 2026(?:,| o) 10:30 UTC$/);
  assert.equal(value("Opis"), "Saved body");
  // Every field is listed once, with the description last.
  assert.equal(fields.at(-1).label, "Opis");
  assert.equal(new Set(fields.map((field) => field.name)).size, fields.length);
  for (const field of fields) assert.doesNotMatch(field.value, /[{}"]/);
});

test("events, due dates and report fields are readable", () => {
  const fields = sourceFields({
    metadata: {
      title: "Milestone",
      status: "achieved",
      due: { date: "2026-10-01" },
      event: { start: "2026-09-08T10:05", duration_minutes: 90 },
      kind: "decision_needed",
      author: { kind: "agent", label: "Build bot" },
      target: { type: "project", id: "p-1" },
    },
    body: "",
  });
  const value = (label) => fields.find((field) => field.label === label)?.value;
  assert.equal(value("Status"), "Osiągnięte");
  assert.equal(value("Termin"), "1 października 2026");
  assert.equal(value("Wydarzenie"), "8 września 2026, 10:05 · 90 min");
  assert.equal(value("Rodzaj"), "Potrzebna decyzja");
  assert.equal(value("Autor"), "Build bot");
  assert.equal(value("Dotyczy"), "Cel · p-1");
  assert.equal(value("Opis"), "—");
});

test("unrecognized values stay visible instead of being dropped", () => {
  const fields = sourceFields({
    metadata: {
      "x-evidence": { url: "https://example.test", ok: true },
      schedule: { start: "not-a-date", end: "2026-09-09" },
      labels: [],
      folder: null,
      schema_version: 1,
    },
    body: "",
  });
  const field = (name) => fields.find((item) => item.name === name);
  assert.equal(field("x-evidence").label, "x-evidence");
  assert.equal(
    field("x-evidence").value,
    JSON.stringify({ url: "https://example.test", ok: true }),
  );
  assert.equal(field("schedule").value, "not-a-date – 9 września 2026");
  assert.equal(field("labels").value, "—");
  assert.equal(field("folder").value, "—");
  assert.equal(field("schema_version").value, "1");
});
