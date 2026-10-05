import test from "node:test";
import assert from "node:assert/strict";
import { counterScrub } from "../../apps/web/src/features/cards/counter-scrub.ts";

class Surface extends EventTarget {
  dataset = {};
  captured = new Set();
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}

function dispatch(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...properties,
  });
  target.dispatchEvent(event);
  return event;
}

const environments = new WeakMap();
/** One window per test; every counter mounted in it is destroyed before it goes. */
function environment(t) {
  if (environments.has(t)) return environments.get(t);
  const saved = { window: globalThis.window, document: globalThis.document };
  const actions = [];
  environments.set(t, actions);
  globalThis.window = new EventTarget();
  globalThis.document = { activeElement: null };
  t.after(() => {
    actions.forEach((action) => action.destroy());
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return actions;
}

function setup(t, overrides = {}) {
  const actions = environment(t);
  const node = new Surface();
  document.activeElement = node;
  const calls = [];
  const options = {
    value: 20,
    step: 1,
    disabled: false,
    preview: (value) => calls.push(["preview", value]),
    commit: (value) => calls.push(["commit", value]),
    ...overrides,
  };
  const action = counterScrub(node, options);
  actions.push(action);
  return {
    node,
    action,
    options,
    calls,
    down: (properties) => dispatch(node, "pointerdown", properties),
    // Offsets are relative to the press point.
    move: (dx, dy = 0, properties = {}) =>
      dispatch(window, "pointermove", {
        clientX: 100 + dx,
        clientY: 100 + dy,
        ...properties,
      }),
    up: (properties) => dispatch(window, "pointerup", properties),
    key: (key, properties = {}) =>
      dispatch(window, "keydown", { key, ...properties }),
    click: () => dispatch(node, "click"),
  };
}

test("a horizontal scrub previews whole steps and commits the released value once", (t) => {
  const h = setup(t);
  h.down();
  assert.equal(h.move(9).defaultPrevented, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.node.captured.size, 0);
  assert.equal(h.move(12).defaultPrevented, true);
  assert.deepEqual([...h.node.captured], [1]);
  assert.equal(h.node.dataset.scrubbing, "true");
  h.move(35);
  h.move(36);
  h.up();
  assert.deepEqual(h.calls, [
    ["preview", 21],
    ["preview", 22],
    ["preview", 23],
    ["preview", null],
    ["commit", 23],
  ]);
  assert.equal(h.node.captured.size, 0);
  assert.equal("scrubbing" in h.node.dataset, false);
  h.move(120);
  h.up();
  assert.equal(h.calls.length, 5);
});

test("scrubbing multiplies by the counter step and truncates partial steps toward the origin", (t) => {
  const h = setup(t, { value: 100, step: 5 });
  h.down();
  for (const dx of [10, 11, 23, 24, -11, -12, -23, -47, -48]) h.move(dx);
  assert.deepEqual(
    h.calls.map(([, value]) => value),
    [100, 100, 105, 110, 100, 95, 95, 85, 80],
  );
});

test("scrubbed values stay inside the counter bounds", (t) => {
  for (const [value, step, dx, expected] of [
    [3, 2, -240, 0],
    [999_999_999, 10, 120, 1_000_000_000],
  ]) {
    const h = setup(t, { value, step });
    h.down();
    h.move(dx);
    h.up();
    assert.deepEqual(h.calls.at(-1), ["commit", expected]);
  }
});

test("a scrub released on its starting value clears the preview without committing", (t) => {
  const h = setup(t);
  h.down();
  h.move(40);
  h.move(4);
  h.up();
  assert.deepEqual(h.calls, [
    ["preview", 23],
    ["preview", 20],
    ["preview", null],
  ]);
});

test("a press without horizontal intent stays an ordinary click", (t) => {
  const h = setup(t);
  h.down();
  h.move(9, 0);
  h.move(8, 8);
  h.move(-6, -8);
  h.up();
  assert.deepEqual(
    h.calls.filter(([, value]) => value !== null),
    [],
  );
  assert.equal(h.node.captured.size, 0);
  assert.equal(h.click().defaultPrevented, false);
});

test("vertical movement hands the touch back to the page for the rest of the press", (t) => {
  const h = setup(t);
  h.down();
  assert.equal(h.move(3, 9).defaultPrevented, false);
  assert.deepEqual(h.calls, [["preview", null]]);
  h.move(60, 9);
  h.up({ clientX: 160 });
  assert.deepEqual(h.calls, [["preview", null]]);
  assert.equal(h.node.captured.size, 0);
  assert.equal(h.click().defaultPrevented, false);
});

test("once scrubbing, vertical drift no longer cancels the gesture", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  h.move(36, 200);
  h.up();
  assert.deepEqual(h.calls.at(-1), ["commit", 23]);
});

test("a diagonal press waits until one axis dominates", (t) => {
  const h = setup(t);
  h.down();
  h.move(20, 20);
  h.move(8, 8);
  assert.deepEqual(h.calls, []);
  h.move(21, 20);
  assert.deepEqual(h.calls, [["preview", 21]]);
});

test("the click synthesized after a scrub is consumed once", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  h.up();
  assert.equal(h.click().defaultPrevented, true);
  assert.equal(h.click().defaultPrevented, false);
  h.down();
  h.move(24);
  h.up();
  // Browsers may omit that click; a fresh press owns a fresh one.
  h.down();
  h.up();
  assert.equal(h.click().defaultPrevented, false);
});

test("secondary buttons, non-primary pointers and disabled counters never start a scrub", (t) => {
  for (const [overrides, properties] of [
    [{}, { button: 2 }],
    [{}, { isPrimary: false }],
    [{ disabled: true }, {}],
  ]) {
    const h = setup(t, overrides);
    h.down(properties);
    h.move(48);
    h.up();
    assert.deepEqual(h.calls, []);
    assert.equal(h.node.captured.size, 0);
  }
});

test("movement and release of another pointer leave the scrub untouched", (t) => {
  const h = setup(t);
  h.down();
  h.move(48, 0, { pointerId: 2 });
  h.up({ pointerId: 2 });
  assert.deepEqual(h.calls, []);
  h.move(24);
  h.up();
  assert.deepEqual(h.calls.at(-1), ["commit", 22]);
});

test("a scrub commits against the value and owner observed at press time", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  h.action.update({
    ...h.options,
    value: 500,
    step: 50,
    preview: () => assert.fail("The new owner must not preview the old scrub"),
    commit: () => assert.fail("The new owner must not commit the old scrub"),
  });
  h.move(36);
  h.up();
  assert.deepEqual(h.calls, [
    ["preview", 22],
    ["preview", 23],
    ["preview", null],
    ["commit", 23],
  ]);
});

test("disabling the counter cancels a scrub and blocks the next press", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  h.action.update({ ...h.options, disabled: true });
  assert.deepEqual(h.calls, [
    ["preview", 22],
    ["preview", null],
  ]);
  assert.equal(h.node.captured.size, 0);
  assert.equal("scrubbing" in h.node.dataset, false);
  h.move(48);
  h.up();
  h.down();
  h.move(48);
  h.up();
  assert.equal(h.calls.length, 2);
});

for (const reason of [
  "Escape",
  "Tab",
  "blur",
  "orientationchange",
  "session-ended",
  "pointercancel",
  "lostpointercapture",
  "second-pointer",
]) {
  test(`${reason} cancels a scrub without committing`, (t) => {
    const h = setup(t);
    h.down();
    h.move(24);
    const event =
      reason === "Escape" || reason === "Tab"
        ? h.key(reason)
        : reason === "lostpointercapture"
          ? dispatch(h.node, reason)
          : reason === "second-pointer"
            ? dispatch(window, "pointerdown", { pointerId: 2 })
            : dispatch(window, reason);
    h.move(48);
    h.up();
    assert.deepEqual(h.calls, [
      ["preview", 22],
      ["preview", null],
    ]);
    assert.equal(h.node.captured.size, 0);
    assert.equal("scrubbing" in h.node.dataset, false);
    if (reason === "Escape" || reason === "Tab")
      assert.equal(event.defaultPrevented, reason === "Escape");
  });
}

test("another pointer's cancellation and a child losing capture keep the scrub", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  dispatch(window, "pointercancel", { pointerId: 2 });
  const childLost = new Event("lostpointercapture");
  Object.defineProperty(childLost, "target", { value: new Surface() });
  h.node.dispatchEvent(Object.assign(childLost, { pointerId: 1 }));
  h.up();
  assert.deepEqual(h.calls.at(-1), ["commit", 22]);
});

test("arrow keys step the focused counter by its step in both directions", (t) => {
  const h = setup(t, { value: 20, step: 5 });
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    const event = h.key(key);
    assert.equal(event.defaultPrevented, true);
  }
  assert.deepEqual(h.calls, [
    ["commit", 25],
    ["commit", 25],
    ["commit", 15],
    ["commit", 15],
  ]);
  h.action.update({ ...h.options, value: 25 });
  h.key("ArrowUp");
  assert.deepEqual(h.calls.at(-1), ["commit", 30]);
});

test("arrow keys keep the counter inside its bounds", (t) => {
  const low = setup(t, { value: 2, step: 5 });
  low.key("ArrowDown");
  assert.deepEqual(low.calls, [["commit", 0]]);
  const high = setup(t, { value: 999_999_998, step: 5 });
  high.key("ArrowUp");
  assert.deepEqual(high.calls, [["commit", 1_000_000_000]]);
});

test("arrow keys do not escape the counter to surrounding shortcuts", (t) => {
  const h = setup(t);
  for (const [key, expected] of [
    ["ArrowUp", true],
    ["Enter", false],
  ]) {
    const event = new Event("keydown", { cancelable: true });
    let stopped = false;
    event.stopPropagation = () => (stopped = true);
    window.dispatchEvent(Object.assign(event, { key }));
    assert.equal(stopped, expected, key);
  }
  assert.deepEqual(h.calls, [["commit", 21]]);
});

test("other keys, modified arrows, unfocused and disabled counters ignore the keyboard", (t) => {
  const h = setup(t);
  for (const key of ["Enter", " ", "Home", "End", "PageUp", "a", "Escape"])
    assert.equal(h.key(key).defaultPrevented, false, key);
  for (const modifier of ["altKey", "ctrlKey", "metaKey"])
    assert.equal(
      h.key("ArrowUp", { [modifier]: true }).defaultPrevented,
      false,
    );
  document.activeElement = new Surface();
  assert.equal(h.key("ArrowUp").defaultPrevented, false);
  document.activeElement = h.node;
  h.action.update({ ...h.options, disabled: true });
  assert.equal(h.key("ArrowUp").defaultPrevented, false);
  assert.deepEqual(h.calls, []);
});

test("a destroyed counter cancels its scrub and stops listening", (t) => {
  const h = setup(t);
  h.down();
  h.move(24);
  h.action.destroy();
  assert.deepEqual(h.calls, [
    ["preview", 22],
    ["preview", null],
  ]);
  assert.equal(h.node.captured.size, 0);
  h.up();
  h.down();
  h.move(48);
  h.up();
  h.key("ArrowUp");
  assert.equal(h.calls.length, 2);
});
