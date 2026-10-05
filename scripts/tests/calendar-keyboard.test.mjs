import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarEventAccess,
  calendarGestureGuard,
  calendarShortcuts,
  keyboardDateProposal,
} from "../../apps/web/src/features/planning/calendar-keyboard.ts";

const project = "11111111-1111-4111-8111-111111111111";
const card = "22222222-2222-4222-8222-222222222222";
const plan = {
  kind: "card_schedule",
  resource_id: card,
  project_id: project,
  title: "Planned work",
  version: "r1.plan",
  start: "2026-09-08",
  end: "2026-09-10",
};
const timed = {
  ...plan,
  kind: "card_event",
  version: "r1.event",
  event: { start: "2026-09-08T10:30", duration_minutes: 45 },
};
const path = `/api/v1/projects/${project}/cards/${card}`;

function key(name, modifiers = {}, target = { closest: () => null }) {
  const calls = [];
  return {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    ...modifiers,
    calls,
    preventDefault: () => calls.push("prevent"),
    stopImmediatePropagation: () => calls.push("stop"),
  };
}
function element(parent) {
  const listeners = new Map();
  return {
    listeners,
    attributes: {},
    closest: () => parent ?? null,
    contains: () => true,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
}

test("Alt shortcuts navigate, return to today and change layout outside text fields", () => {
  const node = element();
  const seen = [];
  const action = calendarShortcuts(node, {
    navigate: (delta) => seen.push(["navigate", delta]),
    today: () => seen.push(["today"]),
    layout: (value) => seen.push(["layout", value]),
  });
  const press = (...args) => {
    const event = key(...args);
    node.listeners.get("keydown")(event);
    return event.calls;
  };
  assert.deepEqual(press("ArrowLeft", { altKey: true }), ["prevent"]);
  assert.deepEqual(press("ArrowRight", { altKey: true }), ["prevent"]);
  assert.deepEqual(press("T", { altKey: true }), ["prevent"]);
  for (const digit of ["1", "2", "3", "4"]) press(digit, { altKey: true });
  assert.deepEqual(seen, [
    ["navigate", -1],
    ["navigate", 1],
    ["today"],
    ["layout", "day"],
    ["layout", "week"],
    ["layout", "month"],
    ["layout", "agenda"],
  ]);
  seen.length = 0;
  // Plain keys, other modifiers and text editing are left alone.
  assert.deepEqual(press("ArrowLeft"), []);
  assert.deepEqual(press("ArrowLeft", { altKey: true, ctrlKey: true }), []);
  assert.deepEqual(press("t", { altKey: true, metaKey: true }), []);
  assert.deepEqual(press("5", { altKey: true }), []);
  assert.deepEqual(
    press("ArrowLeft", { altKey: true }, { closest: () => ({}) }),
    [],
  );
  assert.deepEqual(seen, []);
  action.destroy();
  assert.equal(node.listeners.size, 0);
});

test("Alt+arrow proposes a day or week move with the observed version", () => {
  assert.deepEqual(
    keyboardDateProposal({ key: "ArrowRight", altKey: true }, plan),
    {
      path,
      version: "r1.plan",
      schedule: { start: "2026-09-09", end: "2026-09-11" },
    },
  );
  assert.deepEqual(
    keyboardDateProposal(
      { key: "ArrowLeft", altKey: true, shiftKey: true },
      plan,
    ).schedule,
    { start: "2026-09-01", end: "2026-09-03" },
  );
  // A timed event keeps its clock time and duration.
  assert.deepEqual(
    keyboardDateProposal({ key: "ArrowLeft", altKey: true }, timed),
    {
      path,
      version: "r1.event",
      event: { start: "2026-09-07T10:30", duration_minutes: 45 },
    },
  );
  assert.equal(keyboardDateProposal({ key: "ArrowRight" }, plan), null);
  assert.equal(
    keyboardDateProposal({ key: "Enter", altKey: true }, plan),
    null,
  );
  assert.equal(
    keyboardDateProposal(
      { key: "ArrowRight", altKey: true },
      { ...plan, kind: "milestone_due" },
    ),
    null,
  );
});

test("an event's wrapper is named, opens from the keyboard and proposes only while movable", () => {
  const wrapper = element();
  const opened = [];
  const proposed = [];
  let movable = true;
  const access = calendarEventAccess({
    open: (item) => opened.push(item.version),
    movable: () => movable,
    propose: (proposal) => proposed.push(proposal.version),
  })(element(wrapper), plan);
  assert.deepEqual(wrapper.attributes, {
    "aria-label": "Zaplanowana praca: Planned work",
    "data-source-version": "r1.plan",
  });
  const press = (...args) => {
    const event = key(...args);
    wrapper.listeners.get("keydown")(event);
    return event.calls;
  };
  assert.deepEqual(press("Enter"), ["prevent", "stop"]);
  assert.deepEqual(press(" "), ["prevent", "stop"]);
  assert.deepEqual(press("ArrowRight", { altKey: true }), ["prevent", "stop"]);
  movable = false;
  assert.deepEqual(press("ArrowRight", { altKey: true }), []);
  assert.deepEqual(press("a"), []);
  // A refreshed item replaces the label, the version and what a key acts on.
  access.update(timed);
  assert.equal(wrapper.attributes["data-source-version"], "r1.event");
  assert.match(wrapper.attributes["aria-label"], /^Wydarzenie 10:30/);
  press("Enter");
  assert.deepEqual(opened, ["r1.plan", "r1.plan", "r1.event"]);
  assert.deepEqual(proposed, ["r1.plan"]);
  access.destroy();
  assert.equal(wrapper.listeners.size, 0);
});

test("a gesture is cancelled by Escape, a second pointer or pointercancel, and released after the widget", async () => {
  const windowListeners = new Map();
  const original = globalThis.window;
  globalThis.window = {
    addEventListener: (type, handler) => windowListeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (windowListeners.get(type) === handler) windowListeners.delete(type);
    },
  };
  try {
    const inside = {};
    const node = { contains: (target) => target === inside };
    const seen = [];
    const guard = calendarGestureGuard(node, {
      started: () => seen.push("started"),
      released: () => seen.push("released"),
      cancelled: () => seen.push("cancelled"),
    });
    const down = (pointerId, target = inside, button = 0) =>
      windowListeners.get("pointerdown")({ pointerId, target, button });
    const settle = () => new Promise((done) => setImmediate(done));

    // Outside the calendar, or with another button, nothing starts.
    down(1, {});
    down(1, inside, 2);
    windowListeners.get("keydown")({ key: "Escape" });
    assert.deepEqual(seen, []);

    down(1);
    windowListeners.get("pointerup")();
    assert.deepEqual(seen, ["started"]);
    await settle();
    assert.deepEqual(seen, ["started", "released"]);

    seen.length = 0;
    down(2);
    windowListeners.get("keydown")({ key: "a" });
    windowListeners.get("keydown")({ key: "Escape" });
    await settle();
    assert.deepEqual(seen, ["started", "cancelled", "released"]);

    seen.length = 0;
    down(3);
    down(4);
    await settle();
    assert.deepEqual(seen, ["started", "cancelled", "released"]);

    seen.length = 0;
    down(5);
    windowListeners.get("pointercancel")();
    await settle();
    windowListeners.get("orientationchange")();
    assert.deepEqual(seen, ["started", "cancelled", "released"]);

    guard.destroy();
    assert.equal(windowListeners.size, 0);
  } finally {
    globalThis.window = original;
  }
});
