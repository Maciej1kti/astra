import test from "node:test";
import assert from "node:assert/strict";
import { dateGesture } from "../../apps/web/src/features/planning/date-gesture.ts";

class Surface extends EventTarget {
  style = { transform: "", width: "" };
  captured = new Set();
  attributes = new Map();
  disabled = false;
  closest() {
    return null;
  }
  matches() {
    return this.disabled;
  }
  getBoundingClientRect() {
    return { width: 100 };
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

function dispatch(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...properties,
  });
  target.dispatchEvent(event);
  return event;
}

function setup(t) {
  const saved = {
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  globalThis.window = new EventTarget();
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const node = new Surface();
  const commits = [],
    active = [];
  const options = {
    delta: (x, _y, startX) => Math.round((x - startX) / 10),
    commit: (days) => commits.push(["observed", days]),
    active: (value) => active.push(value),
  };
  const action = dateGesture(node, options);
  t.after(() => {
    action.destroy();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return { node, action, options, commits, active };
}

test("Timeline date drop retains its observed proposal after an action update", (t) => {
  const { node, action, options, commits, active } = setup(t);
  dispatch(node, "pointerdown");
  action.update({
    ...options,
    delta: () => 99,
    commit: (days) => commits.push(["new observation", days]),
    active: () => assert.fail("The new owner must not release the old gesture"),
  });
  dispatch(node, "pointerup", { clientX: 20 });
  assert.deepEqual(commits, [["observed", 2]]);
  assert.deepEqual(active, [true, false]);
  assert.equal(node.captured.size, 0);
});

for (const name of [
  "blur",
  "orientationchange",
  "session-ended",
  "Escape",
  "Tab",
]) {
  test(`Timeline date preview cancels on ${name} without a proposal`, (t) => {
    const { node, commits, active } = setup(t);
    dispatch(node, "pointerdown");
    const event = ["Escape", "Tab"].includes(name)
      ? dispatch(window, "keydown", { key: name })
      : dispatch(window, name);
    dispatch(node, "pointerup", { clientX: 20 });
    assert.deepEqual(commits, []);
    assert.deepEqual(active, [true, false]);
    assert.equal(node.captured.size, 0);
    if (name === "Escape") assert.equal(event.defaultPrevented, true);
    if (name === "Tab") assert.equal(event.defaultPrevented, false);
  });
}

test("Only the matching pointer cancellation ends a Timeline date preview", (t) => {
  const { node, commits, active } = setup(t);
  dispatch(node, "pointerdown");
  dispatch(window, "pointercancel", { pointerId: 2 });
  assert.deepEqual(active, [true]);
  dispatch(window, "pointercancel");
  dispatch(node, "pointerup", { clientX: 20 });
  assert.deepEqual(commits, []);
  assert.deepEqual(active, [true, false]);
});

test("A disabled Timeline control cancels its pending drop", (t) => {
  const { node, action, options, commits } = setup(t);
  dispatch(node, "pointerdown");
  node.disabled = true;
  action.update(options);
  dispatch(node, "pointerup", { clientX: 20 });
  assert.deepEqual(commits, []);
  assert.equal(node.captured.size, 0);
});
