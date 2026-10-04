import test from "node:test";
import assert from "node:assert/strict";
import { mainProjectGesture } from "../../apps/web/src/features/workspace/screens/main-project-gesture.ts";

class Surface extends EventTarget {
  dataset = {};
  attributes = new Map();
  style = {};
  captured = new Set();
  isConnected = true;
  disabled = false;
  removed = false;
  scrollLeft = 0;
  children = [];
  bounds = {
    left: 0,
    right: 300,
    top: 0,
    bottom: 300,
    width: 300,
    height: 300,
  };
  closest() {
    return null;
  }
  querySelectorAll() {
    return this.children;
  }
  getBoundingClientRect() {
    return this.bounds;
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
  focus() {}
  cloneNode() {
    return new Surface();
  }
  remove() {
    this.removed = true;
  }
  append(child) {
    this.children.push(child);
  }
}

function dispatch(target, type, eventTarget = target, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "target", { value: eventTarget });
  Object.assign(event, {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 50,
    detail: 1,
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
  const node = new Surface(),
    source = new Surface(),
    handle = new Surface(),
    app = new Surface();
  source.dataset.mainProject = "p";
  source.bounds = {
    left: 0,
    right: 100,
    top: 0,
    bottom: 100,
    width: 100,
    height: 100,
  };
  handle.closest = (selector) =>
    selector === "[data-main-project-handle]" ? handle : source;
  node.closest = () => app;
  node.children = ["active", "paused", "archived"].map((state, index) => {
    const column = new Surface();
    column.dataset.mainState = state;
    column.bounds = {
      ...node.bounds,
      left: index * 100,
      right: (index + 1) * 100,
      width: 100,
    };
    return column;
  });
  const observed = {
    type: "project",
    id: "p",
    project_id: "p",
    title: "Project",
    version: "original",
    status: "active",
    availability: "ready",
  };
  const commits = [],
    announcements = [];
  const options = {
    projects: () => [observed],
    scope: () => "",
    disabled: () => false,
    commit: (project, state) => {
      assert.equal(
        node.captured.size,
        0,
        "Capture must release before submission",
      );
      assert.equal(
        app.children.at(-1).removed,
        true,
        "Preview must release before submission",
      );
      commits.push([project, state]);
    },
    announce: (message) => announcements.push(message),
  };
  const action = mainProjectGesture(node, options);
  t.after(() => {
    action.destroy();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  const start = () => {
    dispatch(node, "pointerdown", handle);
    dispatch(window, "pointermove", handle, { clientX: 150 });
  };
  return {
    node,
    source,
    handle,
    app,
    observed,
    commits,
    announcements,
    action,
    options,
    start,
  };
}

test("A project drop submits the original summary only after preview/capture cleanup", (t) => {
  const { node, observed, commits, start } = setup(t);
  start();
  dispatch(window, "pointerup", node, { clientX: 150 });
  assert.equal(commits.length, 1);
  assert.equal(commits[0][0], observed);
  assert.equal(commits[0][1], "paused");
  assert.equal(dispatch(node, "click").defaultPrevented, true);
  assert.equal(dispatch(node, "click").defaultPrevented, false);
});

for (const name of [
  "blur",
  "orientationchange",
  "session-ended",
  "Escape",
  "Tab",
  "pointercancel",
  "lostpointercapture",
  "second pointer",
]) {
  test(`Project dragging cancels on ${name} and preserves later clicks`, (t) => {
    const { node, app, commits, start } = setup(t);
    start();
    const event = ["Escape", "Tab"].includes(name)
      ? dispatch(window, "keydown", window, { key: name })
      : name === "lostpointercapture"
        ? dispatch(node, name)
        : name === "second pointer"
          ? dispatch(window, "pointerdown", window, { pointerId: 2 })
          : dispatch(window, name);
    dispatch(window, "pointerup", node, { clientX: 150 });
    assert.deepEqual(commits, []);
    assert.equal(node.captured.size, 0);
    assert.equal(app.children.at(-1).removed, true);
    assert.equal(dispatch(node, "click").defaultPrevented, false);
    if (name === "Escape") assert.equal(event.defaultPrevented, true);
    if (name === "Tab") assert.equal(event.defaultPrevented, false);
  });
}

test("Post-drop keyboard activation and fresh pointer clicks are never swallowed", (t) => {
  const { node, source, start } = setup(t);
  start();
  dispatch(window, "pointerup", node, { clientX: 150 });
  assert.equal(
    dispatch(node, "click", source, { detail: 0 }).defaultPrevented,
    false,
  );
  start();
  dispatch(window, "pointerup", node, { clientX: 150 });
  dispatch(node, "pointerdown", source);
  assert.equal(dispatch(node, "click", source).defaultPrevented, false);
});

for (const change of ["version", "scope", "disabled"]) {
  test(`Project source ${change} changes cancel the retained proposal`, (t) => {
    const { node, observed, options, action, commits, start } = setup(t);
    start();
    action.update({
      ...options,
      ...(change === "version"
        ? { projects: () => [{ ...observed, version: "new" }] }
        : {}),
      ...(change === "scope" ? { scope: () => "new folder" } : {}),
      ...(change === "disabled" ? { disabled: () => true } : {}),
    });
    dispatch(window, "pointerup", node, { clientX: 150 });
    assert.deepEqual(commits, []);
    assert.equal(node.captured.size, 0);
  });
}
