import test from "node:test";
import assert from "node:assert/strict";
import { orderListGesture } from "../../apps/web/src/lib/ui/order-list-gesture.ts";

class Surface extends EventTarget {
  className = "layout-order scoped-list";
  style = {};
  attributes = new Map();
  dataset = {};
  children = [];
  captures = new Set();
  scrollTop = 0;
  offsetHeight = 44;
  offsetWidth = 200;
  bounds = {
    left: 0,
    right: 200,
    top: 0,
    bottom: 300,
    width: 200,
    height: 300,
  };
  append(...nodes) {
    this.children.push(...nodes);
  }
  remove() {
    this.removed = true;
  }
  getBoundingClientRect() {
    return this.bounds;
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  focus() {
    this.focused = true;
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
  matches(selector) {
    return selector === ":popover-open" && !!this.popover;
  }
  querySelectorAll() {
    return this.children;
  }
  cloneNode() {
    const clone = new Surface();
    clone.attributes = new Map(this.attributes);
    clone.children = this.children.map((child) => child.cloneNode(true));
    return clone;
  }
}
function event(type, target, extras = {}) {
  const result = Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 7,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 40,
    ...extras,
  });
  if (target) Object.defineProperty(result, "target", { value: target });
  return result;
}
function fixture(t) {
  const originals = Object.fromEntries(
    ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"].map(
      (name) => [name, globalThis[name]],
    ),
  );
  const window = new EventTarget();
  window.clearTimeout = () => {};
  let frame;
  globalThis.window = window;
  globalThis.document = { createElement: () => new Surface() };
  globalThis.requestAnimationFrame = (callback) => ((frame = callback), 1);
  globalThis.cancelAnimationFrame = () => (frame = undefined);
  const panel = new Surface();
  panel.popover = true;
  const list = new Surface();
  list.closest = (selector) =>
    selector === ".action-menu-panel" ? panel : null;
  let order = ['key"with:punctuation', "Tablica", "Oś czasu"];
  const rows = order.map((key, index) => {
    const row = new Surface();
    const handle = new Surface();
    row.dataset.orderItem = key;
    row.setAttribute("data-order-item", key);
    row.setAttribute("data-navigation-item", key);
    row.bounds = { ...row.bounds, top: index * 50, bottom: index * 50 + 44 };
    handle.dataset.orderHandle = key;
    handle.setAttribute("data-order-handle", key);
    handle.setAttribute("data-navigation-handle", key);
    row.closest = (selector) => (selector === "[data-order-item]" ? row : null);
    handle.closest = (selector) =>
      selector === "[data-order-handle]"
        ? handle
        : selector === "[data-order-item]"
          ? row
          : null;
    row.append(handle);
    return row;
  });
  list.children = rows;
  const commits = [],
    announcements = [];
  const options = {
    order: () => order,
    label: (key) => `View ${key}`,
    disabled: () => false,
    commit: (...args) => commits.push(args),
    announce: (message) => announcements.push(message),
    cancellationMessage: "Kolejność bez zmian.",
    rowAttribute: "data-navigation-item",
    handleAttribute: "data-navigation-handle",
  };
  const action = orderListGesture(list, options);
  t.after(() => {
    action.destroy();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {
    window,
    list,
    rows,
    panel,
    action,
    options,
    commits,
    announcements,
    changeOrder: (next) => (order = next),
    down: () => list.dispatchEvent(event("pointerdown", rows[0].children[0])),
    move: () =>
      window.dispatchEvent(event("pointermove", null, { clientY: 120 })),
    up: (extras = {}) =>
      window.dispatchEvent(
        event("pointerup", null, { clientY: 120, ...extras }),
      ),
    paint: () => frame?.(),
    key: (target, key) => list.dispatchEvent(event("keydown", target, { key })),
  };
}

test("the shared list reorders arbitrary identified items with bounded keyboard moves", (t) => {
  const h = fixture(t);
  h.key(h.rows[0].children[0], "End");
  assert.deepEqual(h.commits, [
    [["Tablica", "Oś czasu", 'key"with:punctuation'], 'key"with:punctuation'],
  ]);
  h.key(h.rows[0].children[0], "Home");
  assert.equal(h.commits.length, 1);
  h.rows[0].children[0].dataset.orderHandle = "Unrecognized";
  h.key(h.rows[0].children[0], "ArrowDown");
  assert.equal(h.commits.length, 1);
});

test("the shared list owns an inert native-layer preview and drops its captured order", (t) => {
  const h = fixture(t);
  h.down();
  h.move();
  h.paint();
  const [preview, indicator] = h.panel.children;
  assert.equal(
    preview.className,
    "layout-order scoped-list layout-drag-preview",
  );
  assert.equal(preview.inert, true);
  const clone = preview.children[0];
  assert.equal(clone.inert, true);
  assert.equal(clone.attributes.has("data-order-item"), false);
  assert.equal(clone.attributes.has("data-navigation-item"), false);
  assert.equal(clone.children[0].attributes.has("data-order-handle"), false);
  assert.equal(
    clone.children[0].attributes.has("data-navigation-handle"),
    false,
  );
  h.up();
  assert.deepEqual(h.commits, [
    [["Tablica", 'key"with:punctuation', "Oś czasu"], 'key"with:punctuation'],
  ]);
  assert.equal(preview.removed, true);
  assert.equal(indicator.removed, true);
  assert.equal(h.list.captures.size, 0);
});

test("a changed order cancels the shared list instead of rebasing its proposal", (t) => {
  const h = fixture(t);
  h.down();
  h.move();
  h.changeOrder(["Oś czasu", "Tablica", 'key"with:punctuation']);
  h.up();
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.announcements, [
    'View key"with:punctuation podniesiono.',
    "Kolejność bez zmian.",
  ]);
  assert.equal(h.rows[0].children[0].focused, true);
  assert.equal(
    h.panel.children.every((overlay) => overlay.removed),
    true,
  );
});

for (const cancel of ["outside", "Escape", "Tab"]) {
  test(`the shared list preserves its order on ${cancel} cancellation`, (t) => {
    const h = fixture(t);
    h.down();
    h.move();
    if (cancel === "outside") h.up({ clientX: 220 });
    else {
      h.window.dispatchEvent(event("keydown", null, { key: cancel }));
      h.up();
    }
    assert.deepEqual(h.commits, []);
    assert.equal(h.list.captures.size, 0);
    assert.equal(
      h.panel.children.every((overlay) => overlay.removed),
      true,
    );
  });
}
