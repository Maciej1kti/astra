import { test } from "node:test";
import assert from "node:assert/strict";
import { cardScheduleSummary } from "../../apps/web/src/features/editor/card-schedule.ts";

const base = {
  start: "2026-03-28",
  end: "2026-03-30",
  time: "",
  duration: 60,
  status: "active",
};
const summary = (now, fields = {}, timezone = "Europe/Warsaw") =>
  cardScheduleSummary({ ...base, ...fields }, timezone, Date.parse(now));
test("inclusive date summaries cross DST and use workspace midnight, not device time", () => {
  assert.deepEqual(summary("2026-03-27T12:00Z"), {
    text: "Rozpocznie się jutro",
    detail: "3 dni",
    valid: true,
  });
  assert.deepEqual(summary("2026-03-28T12:00Z"), {
    text: "Pozostało 2 dni",
    detail: "Dzień 1",
    overdue: false,
    valid: true,
  });
  assert.equal(summary("2026-03-29T12:00Z").text, "Pozostało 1 dzień");
  assert.equal(summary("2026-03-29T22:01Z").text, "Kończy się dzisiaj");
  assert.equal(
    summary("2026-03-29T22:01Z", {}, "Pacific/Honolulu").text,
    "Pozostało 1 dzień",
  );
  assert.deepEqual(summary("2026-03-31T12:00Z"), {
    text: "1 dzień po terminie",
    detail: "Dzień 4",
    overdue: true,
    valid: true,
  });
  assert.equal(summary("2026-03-26T12:00Z").text, "Rozpocznie się za 2 dni");
});
test("finished cards show planned duration without a misleading running or overdue counter", () => {
  for (const status of ["done", "cancelled"]) {
    assert.deepEqual(summary("2026-04-01T12:00Z", { status }), {
      text: "3-dniowy plan",
      valid: true,
    });
    assert.equal(
      summary("2026-04-01T12:00Z", { status, time: "23:30", duration: 90 })
        .text,
      "Wydarzenie · 1 godz. 30 min",
    );
  }
});
test("timed summaries preserve the domain civil-clock duration through midnight", () => {
  const event = { start: "2026-09-30", time: "23:30", duration: 90 };
  assert.equal(
    summary("2026-09-30T21:00Z", event).text,
    "Rozpocznie się za 30 min",
  );
  assert.equal(
    summary("2026-09-30T21:30Z", event).text,
    "Pozostało 1 godz. 30 min",
  );
  assert.equal(summary("2026-09-30T22:59Z", event).text, "Pozostało 1 min");
  assert.equal(summary("2026-09-30T23:00Z", event).text, "Właśnie zakończone");
  assert.equal(
    summary("2026-09-30T23:01Z", event).text,
    "Zakończone 1 min temu",
  );
});
test("empty and incomplete schedules are distinct and impossible dates never produce NaN", () => {
  assert.deepEqual(summary("2026-03-28T12:00Z", { start: "", end: "" }), {
    text: "Brak harmonogramu",
    valid: true,
  });
  for (const fields of [
    { start: "" },
    { end: "" },
    { end: "2026-03-27" },
    { start: "2026-02-30" },
    { time: "25:30" },
    { time: "12:00", duration: 0 },
  ])
    assert.deepEqual(summary("2026-03-28T12:00Z", fields), {
      text: "Sprawdź harmonogram",
      valid: false,
    });
});
