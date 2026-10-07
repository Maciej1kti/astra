import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cities,
  landDots,
  mapNorth,
  mapPoint,
  mapSouth,
  nearestCity,
  offsetLabel,
  zoneOffset,
} from "../../apps/web/src/features/settings/timezone-map.ts";

test("land dots stay inside the map and never repeat", () => {
  const dots = landDots();
  assert(dots.length > 400, `a world needs its land: ${dots.length}`);
  const seen = new Set();
  for (const { x, y } of dots) {
    assert(x > 0 && x < 360 && y > 0 && y < mapNorth - mapSouth);
    const key = `${x}:${y}`;
    assert(!seen.has(key), `repeated dot ${key}`);
    seen.add(key);
  }
  const has = (latitude, longitude) => {
    const cell = (value) => Math.floor(value / 5) * 5 + 2.5;
    const point = mapPoint(cell(latitude), cell(longitude));
    return seen.has(`${point.x}:${point.y}`);
  };
  assert(has(52, 21), "Warsaw stands on land");
  assert(has(-25, 134), "so does central Australia");
  assert(!has(30, -40), "the mid-Atlantic is water");
  assert(!has(0, -150), "and so is the Pacific");
});

test("every listed place is a zone this runtime knows, on the map", () => {
  const instant = new Date("2026-01-15T12:00:00Z");
  for (const [zone, latitude, longitude] of cities) {
    assert.notEqual(zoneOffset(zone, instant), null, zone);
    const { x, y } = mapPoint(latitude, longitude);
    assert(x >= 0 && x <= 360 && y >= 0 && y <= mapNorth - mapSouth, zone);
  }
  assert.equal(new Set(cities.map(([zone]) => zone)).size, cities.length);
});

test("a point of the map means its nearest available place", () => {
  assert.equal(nearestCity(mapPoint(52, 21)), "Europe/Warsaw");
  assert.equal(nearestCity(mapPoint(35, 139)), "Asia/Tokyo");
  assert.equal(
    nearestCity(mapPoint(52, 21), (zone) => zone !== "Europe/Warsaw"),
    "Europe/Stockholm",
  );
  assert.equal(
    nearestCity(mapPoint(0, 0), () => false),
    null,
  );
});

test("offsets follow the zone's own calendar and unknown zones have none", () => {
  assert.equal(
    zoneOffset("Europe/Warsaw", new Date("2026-01-15T12:00:00Z")),
    60,
  );
  assert.equal(
    zoneOffset("Europe/Warsaw", new Date("2026-07-15T12:00:00Z")),
    120,
  );
  assert.equal(
    zoneOffset("Asia/Kolkata", new Date("2026-07-15T12:00:30Z")),
    330,
  );
  assert.equal(
    zoneOffset("America/New_York", new Date("2026-01-15T03:00:00Z")),
    -300,
  );
  assert.equal(zoneOffset("UTC", new Date("2026-07-15T12:00:00Z")), 0);
  assert.equal(zoneOffset("Mars/Olympus", new Date()), null);
  assert.equal(zoneOffset("", new Date()), null);
});

test("offset labels read as hours from UTC", () => {
  assert.equal(offsetLabel(0), "UTC");
  assert.equal(offsetLabel(120), "UTC+2");
  assert.equal(offsetLabel(-210), "UTC−3:30");
  assert.equal(offsetLabel(345), "UTC+5:45");
});
