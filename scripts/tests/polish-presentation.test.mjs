import test from "node:test";
import assert from "node:assert/strict";
import { TransportError } from "../../apps/web/src/lib/api/transport-errors.ts";
import { counted, uiLocale } from "../../apps/web/src/lib/ui/locale.ts";
import {
  serverMessage,
  errorMessage,
} from "../../apps/web/src/lib/api/messages.ts";
import { ApiError } from "../../apps/web/src/lib/api/api.ts";
import {
  chartDate,
  chartRate,
  chartValue,
} from "../../apps/web/src/features/charts/chart-model.ts";
import {
  readRoute,
  writeRoute,
  viewLabel,
} from "../../apps/web/src/features/workspace/navigation.ts";

test("Polish labels retain route identifiers and civil dates across navigation", () => {
  const route = readRoute(
    new URLSearchParams("view=calendar&date=2026-10-04&layout=week"),
    "2026-10-05",
  );
  assert.equal(viewLabel(route.view), "Kalendarz");
  assert.equal(writeRoute(route).get("date"), "2026-10-04");
  assert.equal(writeRoute(route).get("view"), "calendar");
  assert.equal(uiLocale, "pl-PL");
});

test("Polish count forms handle teens, compound counts and fractions", () => {
  for (const [value, expected] of [
    [0, "0 liczników"],
    [1, "1 licznik"],
    [2, "2 liczniki"],
    [4, "4 liczniki"],
    [5, "5 liczników"],
    [12, "12 liczników"],
    [14, "14 liczników"],
    [21, "21 liczników"],
    [22, "22 liczniki"],
    [112, "112 liczników"],
    [1.5, "1,5 liczników"],
  ])
    assert.equal(counted(value, "licznik", "liczniki", "liczników"), expected);
});

test("chart presentation uses decimal commas without changing stored quantities", () => {
  assert.equal(chartValue(1234.5), "1234,5");
  assert.match(chartDate("2026-10-04", true), /paź/);
  assert.equal(chartRate("2,5"), 2.5);
  assert.equal(chartRate("2.5"), 2.5);
  assert.equal(chartRate("1,234.5"), null);
});

test("server and browser failures have Polish presentation while protocol details remain intact", () => {
  const data = {
    error: { code: "VERSION_CONFLICT", message: "English server explanation" },
  };
  const error = new ApiError(412, data);
  assert.match(error.message, /Wersja robocza została zachowana/);
  assert.equal(error.data, data);
  assert.equal(error.status, 412);
  assert.doesNotMatch(
    new ApiError(500, {
      error: { code: "FUTURE_ERROR", message: "English server explanation" },
    }).message,
    /English/,
  );
  assert.match(serverMessage("FUTURE_ERROR"), /FUTURE_ERROR/);
  assert.match(errorMessage(new TransportError()), /połączyć z serwerem/);
  assert.match(
    errorMessage(new SyntaxError("Unexpected token")),
    /Nieprawidłowe dane JSON/,
  );
});
