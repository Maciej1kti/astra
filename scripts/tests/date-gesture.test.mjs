import test from "node:test";
import assert from "node:assert/strict";
import { dateGesture } from "../../apps/web/src/features/planning/date-gesture.ts";

class Surface extends EventTarget {
  style = { left: "100px", width: "30px" };
  offsetLeft = 100;
  offsetWidth = 30;
  isConnected = true;
  captured = new Set();
  attributes = new Map();
  edge = null;
  closest(selector) {
    if (selector === "[data-edge]")
      return this.edge ? { getAttribute: () => this.edge } : null;
    return null;
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
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...properties,
  });
  Object.defineProperty(event, "target", {
    value: properties.target ?? target,
  });
  target.dispatchEvent(event);
  return event;
}

function setup(t, { span = 3 } = {}) {
  const saved = {
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const frames = [];
  const timers = [];
  globalThis.window = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: true }),
    setTimeout: (run) => timers.push(run),
    clearTimeout: (id) => {
      timers[id - 1] = () => {};
    },
  });
  globalThis.requestAnimationFrame = (run) => frames.push(run);
  globalThis.cancelAnimationFrame = (id) => {
    frames[id - 1] = () => {};
  };
  const node = new Surface();
  const commits = [];
  const previews = [];
  const active = [];
  let disabled = false;
  const options = {
    unit: () => 10,
    span: () => span,
    disabled: () => disabled,
    active: (value) => active.push(value),
    preview: (operation, days) => previews.push([operation, days]),
    commit: (operation, days) => commits.push(["observed", operation, days]),
  };
  const action = dateGesture(node, options);
  t.after(() => {
    action.destroy();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return {
    node,
    action,
    options,
    commits,
    previews,
    active,
    disable: () => (disabled = true),
    paint: () => frames.splice(0).forEach((run) => run()),
    hold: () => timers.splice(0).forEach((run) => run()),
  };
}

/** Press and travel far enough for the press to become a drag. */
function drag(node, x) {
  dispatch(node, "pointerdown");
  dispatch(window, "pointermove", { clientX: x });
}

test("A Timeline bar follows the pointer by the pixel and proposes whole days once", (t) => {
  const { node, commits, previews, active, paint } = setup(t);
  drag(node, 14);
  paint();
  assert.equal(node.style.left, "114px", "the bar moves between day columns");
  assert.equal(node.attributes.get("data-dragging"), "move");
  dispatch(window, "pointermove", { clientX: 21 });
  paint();
  assert.deepEqual(previews, [
    ["move", 0],
    ["move", 1],
    ["move", 2],
  ]);
  assert.deepEqual(commits, [], "a preview never writes");
  dispatch(window, "pointerup", { clientX: 21 });
  assert.deepEqual(commits, [["observed", "move", 2]]);
  assert.deepEqual(previews.at(-1), ["move", null]);
  assert.deepEqual(active, [true, false]);
  assert.equal(node.style.left, "100px", "the view owns the saved position");
  assert.equal(node.captured.size, 0);
  assert.equal(node.attributes.has("data-dragging"), false);
});

test("A press that does not travel stays a click and proposes nothing", (t) => {
  const { node, commits, active } = setup(t);
  dispatch(node, "pointerdown");
  dispatch(window, "pointermove", { clientX: 2 });
  dispatch(window, "pointerup", { clientX: 2 });
  const click = dispatch(node, "click");
  assert.equal(click.defaultPrevented, false, "the click opens the card");
  assert.deepEqual(commits, []);
  assert.deepEqual(active, []);
});

test("The click that ends a drag is suppressed", (t) => {
  const { node } = setup(t);
  drag(node, 20);
  dispatch(window, "pointerup", { clientX: 20 });
  assert.equal(dispatch(node, "click").defaultPrevented, true);
  assert.equal(dispatch(node, "click").defaultPrevented, false);
});

test("The end edge resizes its own end and never below one day", (t) => {
  const { node, commits, paint } = setup(t);
  node.edge = "end";
  drag(node, -80);
  paint();
  assert.equal(node.style.width, "10px", "one day remains");
  dispatch(window, "pointerup", { clientX: -80 });
  assert.deepEqual(commits, [["observed", "end", -2]]);
});

test("The start edge resizes its own end and never below one day", (t) => {
  const { node, commits, paint } = setup(t);
  node.edge = "start";
  drag(node, 80);
  paint();
  assert.equal(node.style.left, "120px");
  assert.equal(node.style.width, "10px");
  dispatch(window, "pointerup", { clientX: 80 });
  assert.deepEqual(commits, [["observed", "start", 2]]);
});

test("A release where the drag began proposes nothing", (t) => {
  const { node, commits, active } = setup(t);
  drag(node, 20);
  dispatch(window, "pointerup", { clientX: 3 });
  assert.deepEqual(commits, []);
  assert.deepEqual(active, [true, false]);
});

test("Timeline date drop retains its observed proposal after an action update", (t) => {
  const { node, action, options, commits } = setup(t);
  drag(node, 20);
  action.update({
    ...options,
    unit: () => 99,
    commit: (operation, days) => commits.push(["updated", operation, days]),
  });
  dispatch(window, "pointerup", { clientX: 20 });
  // The day width is the one measured when the bar was picked up.
  assert.deepEqual(commits, [["updated", "move", 2]]);
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
    drag(node, 20);
    const event = ["Escape", "Tab"].includes(name)
      ? dispatch(window, "keydown", { key: name })
      : dispatch(window, name);
    dispatch(window, "pointerup", { clientX: 20 });
    assert.deepEqual(commits, []);
    assert.deepEqual(active, [true, false]);
    assert.equal(node.captured.size, 0);
    assert.equal(node.style.left, "100px");
    if (name === "Escape") assert.equal(event.defaultPrevented, true);
    if (name === "Tab") assert.equal(event.defaultPrevented, false);
  });
}

test("Only the matching pointer cancellation ends a Timeline date preview", (t) => {
  const { node, commits, active } = setup(t);
  drag(node, 20);
  dispatch(window, "pointercancel", { pointerId: 2 });
  assert.deepEqual(active, [true]);
  dispatch(window, "pointercancel");
  dispatch(window, "pointerup", { clientX: 20 });
  assert.deepEqual(commits, []);
  assert.deepEqual(active, [true, false]);
});

test("A Timeline bar that stops being editable cancels its pending drop", (t) => {
  const { node, action, options, commits, disable } = setup(t);
  drag(node, 20);
  disable();
  action.update(options);
  dispatch(window, "pointerup", { clientX: 20 });
  assert.deepEqual(commits, []);
  assert.equal(node.captured.size, 0);
});

test("A finger on a bar scrolls the axis and changes no date", (t) => {
  const { node, commits, active, hold } = setup(t);
  dispatch(node, "pointerdown", { pointerType: "touch" });
  dispatch(window, "pointermove", { pointerType: "touch", clientX: 30 });
  hold();
  dispatch(window, "pointerup", { pointerType: "touch", clientX: 30 });
  assert.deepEqual(commits, [], "a swipe is never a date change");
  assert.deepEqual(active, []);
});

test("A held finger picks a bar up and stops the scroll", (t) => {
  const { node, commits, hold } = setup(t);
  node.edge = "end";
  dispatch(node, "pointerdown", { pointerType: "touch" });
  hold();
  assert.equal(node.attributes.get("data-dragging"), "end");
  const moved = dispatch(node, "touchmove");
  assert.equal(moved.defaultPrevented, true, "the held bar stops the scroll");
  dispatch(window, "pointermove", { pointerType: "touch", clientX: 30 });
  dispatch(window, "pointerup", { pointerType: "touch", clientX: 30 });
  assert.deepEqual(commits, [["observed", "end", 3]]);
});
