import test from "node:test";
import assert from "node:assert/strict";
import {
  reorderGesture,
  sameReorderOrder,
  reorderKeyIndex,
  reorderInsertionIndex,
  reorderScrollDelta,
  positionReorderOverlay,
} from "../../apps/web/src/lib/ui/reorder-gesture.ts";
import { focusOrderGesture } from "../../apps/web/src/features/workspace/focus-order-gesture.ts";
const { timelineRowGesture } = await import(
  process.env.TIMELINE_GESTURE_MODULE ??
    "../../apps/web/src/features/planning/timeline-row-gesture.ts"
);

class Node extends EventTarget {
  captures = new Set();
  attributes = new Map();
  style = {};
  textContent = "Timeline row";
  children = [];
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
    this.dispatchEvent(pointer("lostpointercapture", { pointerId: id }));
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  remove() {}
  focus() {}
  querySelectorAll() {
    return [];
  }
  cloneNode() {
    const clone = new Node();
    clone.attributes = new Map(this.attributes);
    return clone;
  }
  closest(selector) {
    return selector === ".astra-gantt"
      ? this.viewport
      : selector === ".wx-row"
        ? this.row
        : null;
  }
  getBoundingClientRect() {
    return (
      this.bounds ?? {
        left: 10,
        right: 110,
        top: 100,
        bottom: 144,
        width: 100,
        height: 44,
      }
    );
  }
}

function pointer(type, values = {}) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 7,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 40,
    clientY: 120,
    ...values,
  });
}
function key(value, extras = {}) {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key: value,
    ...extras,
  });
}

function environment(t) {
  const originals = Object.fromEntries(
    ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"].map(
      (name) => [name, globalThis[name]],
    ),
  );
  const window = new EventTarget();
  const timers = new Map();
  const frames = new Map();
  const cleanups = [];
  let sequence = 0;
  window.setTimeout = (callback) => {
    const id = ++sequence;
    timers.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.innerHeight = 800;
  window.scrollBy = () => {};
  globalThis.window = window;
  globalThis.document = { createElement: () => new Node(), body: new Node() };
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup());
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return {
    window,
    frames,
    timers,
    cleanup: (callback) => cleanups.push(callback),
    runFrame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    hold() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((callback) => callback());
    },
  };
}

function setup(t, overrides = {}) {
  const env = environment(t);
  const node = new Node();
  const events = [];
  let order = ["first", "second", "last"];
  let disabled = false;
  const options = {
    disabled: () => disabled,
    capture: () => [...order],
    valid: (observed) => sameReorderOrder(observed, order),
    start: () => events.push("start"),
    paint: () => events.push("paint"),
    drop: (value) => {
      events.push("drop");
      return () => events.push(["commit", value.snapshot]);
    },
    release: () => events.push("release"),
    active: (value) => events.push(["active", value]),
    cancelled: () => events.push("cancelled"),
    ...overrides,
  };
  const action = reorderGesture(node, options);
  env.cleanup(() => action.destroy());
  return {
    ...env,
    node,
    action,
    events,
    options,
    changeOrder: (value) => {
      order = value;
    },
    disable: () => {
      disabled = true;
    },
    down: (extra = {}) => node.dispatchEvent(pointer("pointerdown", extra)),
    move: (extra = {}) =>
      env.window.dispatchEvent(
        pointer("pointermove", { clientY: 210, ...extra }),
      ),
    up: (extra = {}) =>
      env.window.dispatchEvent(
        pointer("pointerup", { clientY: 210, ...extra }),
      ),
  };
}

test("a completed reorder releases its preview/capture before committing its observed snapshot", (t) => {
  const h = setup(t);
  h.down();
  h.move();
  h.runFrame();
  h.up();
  assert.deepEqual(h.events, [
    ["active", true],
    "start",
    "paint",
    "drop",
    "release",
    ["active", false],
    ["commit", ["first", "second", "last"]],
  ]);
  assert.equal(h.node.captures.size, 0);
  assert.equal(h.frames.size, 0);
});

test("membership changes, changed order and disabled controls invalidate the proposal even at pointerup", (t) => {
  const h = setup(t);
  for (const change of [
    () => h.changeOrder(["first", "second", "last", "added"]),
    () => h.changeOrder(["second", "first", "last"]),
    () => h.disable(),
  ]) {
    h.changeOrder(["first", "second", "last"]);
    h.down();
    h.move();
    change();
    h.up();
  }
  assert.equal(h.events.includes("drop"), false);
  assert.equal(h.events.filter((event) => event === "cancelled").length, 3);
});

test("snapshot changes also cancel while held, without requiring another pointer event", (t) => {
  const h = setup(t);
  h.down();
  h.move();
  h.changeOrder(["last", "second", "first"]);
  h.runFrame();
  h.up();
  assert.equal(h.events.includes("paint"), false);
  assert.equal(h.events.includes("drop"), false);
  assert.equal(h.frames.size, 0);
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
  test(`${reason} cancels a reorder without committing and removes pending effects`, (t) => {
    const h = setup(t);
    h.down();
    h.move();
    const event =
      reason === "Escape" || reason === "Tab"
        ? key(reason)
        : reason === "pointercancel" || reason === "lostpointercapture"
          ? pointer(reason)
          : reason === "second-pointer"
            ? pointer("pointerdown", { pointerId: 8, isPrimary: false })
            : new Event(reason);
    (reason === "lostpointercapture" ? h.node : h.window).dispatchEvent(event);
    h.up();
    assert.equal(h.events.includes("drop"), false);
    assert.equal(h.events.filter((value) => value === "release").length, 1);
    assert.equal(h.node.captures.size, 0);
    assert.equal(h.frames.size, 0);
    if (reason === "Escape" || reason === "Tab")
      assert.equal(event.defaultPrevented, reason === "Escape");
  });
}

test("unrelated pointer cancellation and a child losing implicit touch capture keep the owned drag", (t) => {
  const h = setup(t);
  h.down();
  h.move();
  h.window.dispatchEvent(pointer("pointercancel", { pointerId: 8 }));
  const childLost = pointer("lostpointercapture");
  Object.defineProperty(childLost, "target", { value: new Node() });
  h.node.dispatchEvent(childLost);
  h.up();
  assert.equal(h.events.includes("drop"), true);
});

test("whole-card click keeps native focus and does not become a drag below the threshold", (t) => {
  const h = setup(t, { touchHold: 250 });
  const down = pointer("pointerdown");
  h.node.dispatchEvent(down);
  assert.equal(h.node.captures.size, 0);
  h.move({ clientY: 123 });
  h.up({ clientY: 123 });
  assert.equal(down.defaultPrevented, false);
  assert.equal(h.events.includes("start"), false);
  assert.equal(h.events.includes("drop"), false);
});

test("whole-card touch scroll cancels a pending hold; stationary hold starts a captured reorder", (t) => {
  const h = setup(t, { touchHold: 250 });
  h.down({ pointerType: "touch" });
  h.move({ pointerType: "touch" });
  h.hold();
  h.up({ pointerType: "touch" });
  assert.equal(h.events.includes("start"), false);
  assert.equal(h.events.includes("drop"), false);
  h.down({ pointerType: "touch" });
  h.hold();
  h.up({ pointerType: "touch" });
  assert.equal(h.events.includes("start"), true);
  assert.equal(h.events.includes("drop"), true);
});

test("cancelled preview consumes only its synthesized click, allowing the next ordinary click", (t) => {
  const h = setup(t);
  h.down();
  h.move();
  h.window.dispatchEvent(key("Escape"));
  h.up();
  const first = new Event("click", { cancelable: true });
  const next = new Event("click", { cancelable: true });
  h.node.dispatchEvent(first);
  h.node.dispatchEvent(next);
  assert.equal(first.defaultPrevented, true);
  assert.equal(next.defaultPrevented, false);
});

test("a fresh press on a non-drag control cannot inherit stale drag click suppression", (t) => {
  let handle = true;
  const h = setup(t, {
    capture: () => (handle ? ["first", "second", "last"] : null),
  });
  h.down();
  h.move();
  h.window.dispatchEvent(key("Escape"));
  h.up();
  // Browsers do not always synthesize a click after a cancelled captured drag.
  handle = false;
  h.down();
  h.up();
  const click = new Event("click", { cancelable: true });
  h.node.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
});

test("shared keyboard destinations and measured insertion tolerate boundaries and variable row heights", () => {
  assert.equal(reorderKeyIndex("ArrowUp", 0, 3), 0);
  assert.equal(reorderKeyIndex("ArrowDown", 2, 3), 2);
  assert.equal(reorderKeyIndex("Home", 2, 3), 0);
  assert.equal(reorderKeyIndex("End", 0, 3), 2);
  assert.equal(reorderKeyIndex("ArrowDown", -1, 3), null);
  assert.equal(reorderKeyIndex("Enter", 0, 3), null);
  assert.equal(
    reorderInsertionIndex(95, [
      { top: 20, bottom: 60 },
      { top: 70, bottom: 130 },
    ]),
    1,
  );
  assert.equal(
    reorderInsertionIndex(105, [
      { top: 20, bottom: 60 },
      { top: 70, bottom: 130 },
    ]),
    2,
  );
  assert.equal(reorderInsertionIndex(20, []), 0);
  assert.equal(reorderScrollDelta(105, { top: 100, bottom: 200 }), -12);
  assert.equal(reorderScrollDelta(150, { top: 100, bottom: 200 }), 0);
  assert.equal(reorderScrollDelta(195, { top: 100, bottom: 200 }), 12);
});

test("preview coordinates compensate a native layer's translated/scaled fixed containing block", () => {
  const overlay = {
    style: { left: "357px", top: "500px", width: "726px" },
    get offsetWidth() {
      return parseFloat(this.style.width);
    },
    offsetHeight: 44,
    getBoundingClientRect() {
      return {
        left: 320 + parseFloat(this.style.left) * 0.992,
        top: 50 + parseFloat(this.style.top) * 0.992,
        width: this.offsetWidth * 0.992,
        height: this.offsetHeight * 0.992,
      };
    },
  };
  for (const top of [500, 520]) {
    positionReorderOverlay(overlay, 357, top, 726);
    const rect = overlay.getBoundingClientRect();
    assert(Math.abs(rect.left - 357) < 0.01);
    assert(Math.abs(rect.top - top) < 0.01);
    assert(Math.abs(rect.width - 726) < 0.01);
  }
});

function timeline(t) {
  const env = environment(t);
  const node = new Node();
  node.row = new Node();
  node.viewport = new Node();
  node.viewport.bounds = { left: 0, right: 600, top: 0, bottom: 400 };
  let order = ["first", "second", "last"];
  const commits = [];
  const action = timelineRowGesture(node, {
    id: "first",
    order: () => order,
    disabled: () => false,
    active() {},
    commit: (...args) => commits.push(args),
  });
  env.cleanup(() => action.destroy());
  return {
    ...env,
    node,
    commits,
    change: (value) => {
      order = value;
    },
  };
}

test("Timeline adapter rejects a captured order made obsolete just before release", (t) => {
  const h = timeline(t);
  h.node.dispatchEvent(pointer("pointerdown"));
  h.window.dispatchEvent(pointer("pointermove", { clientY: 210 }));
  h.change(["last", "second", "first"]);
  h.window.dispatchEvent(pointer("pointerup", { clientY: 210 }));
  assert.deepEqual(h.commits, []);
  assert.equal(h.node.captures.size, 0);
});

test("Timeline adapter recomputes release geometry and uses the shared keyboard boundaries", (t) => {
  const h = timeline(t);
  h.node.dispatchEvent(pointer("pointerdown"));
  h.window.dispatchEvent(pointer("pointermove", { clientY: 170 }));
  h.window.dispatchEvent(pointer("pointerup", { clientY: 210 }));
  assert.deepEqual(h.commits, [["first", 2]]);
  h.node.dispatchEvent(key("Home", { altKey: true }));
  assert.equal(h.commits.length, 1);
  h.node.dispatchEvent(key("End", { altKey: true }));
  assert.deepEqual(h.commits.at(-1), ["first", 2]);
});

function focus(t) {
  const env = environment(t);
  const node = new Node();
  node.bounds = { left: 10, right: 110, top: 100, bottom: 250 };
  const rows = ["first", "second", "last"].map((id, index) => {
    const row = new Node();
    row.dataset = {
      focusCard: id,
      focusProject: "project",
      focusKey: `project:${id}`,
    };
    row.bounds = {
      left: 10,
      right: 110,
      top: 100 + index * 50,
      bottom: 144 + index * 50,
      width: 100,
      height: 44,
    };
    row.closest = (selector) =>
      selector === "[data-focus-interactive]" ? null : row;
    return row;
  });
  node.querySelectorAll = () => rows;
  let cards = rows.map((row) => ({
    id: row.dataset.focusCard,
    project_id: "project",
  }));
  let fullOrder = cards.map((card) => ({
    project_id: card.project_id,
    card_id: card.id,
  }));
  let version = "observed";
  let scope = "initial-folder";
  const commits = [];
  const action = focusOrderGesture(node, {
    cards: () => cards,
    fullOrder: () => fullOrder,
    version: () => version,
    scope: () => scope,
    disabled: () => false,
    active() {},
    commit: (...args) => commits.push(args),
  });
  env.cleanup(() => action.destroy());
  const down = pointer("pointerdown");
  Object.defineProperty(down, "target", { value: rows[0] });
  return {
    ...env,
    node,
    down,
    commits,
    refresh() {
      cards = [cards[1], cards[0], cards[2]];
      fullOrder = [fullOrder[1], fullOrder[0], fullOrder[2]];
      version = "competing-observation";
    },
    changeScope() {
      scope = "another-folder";
    },
  };
}

test("Focus adapter keeps the frozen preview and captured conditional version through canonical refresh", (t) => {
  const h = focus(t);
  h.node.dispatchEvent(h.down);
  h.window.dispatchEvent(pointer("pointermove", { clientY: 230 }));
  h.refresh();
  h.runFrame();
  h.window.dispatchEvent(pointer("pointerup", { clientY: 230 }));
  assert.equal(h.commits.length, 1);
  assert.deepEqual(
    h.commits[0][0].map((card) => card.id),
    ["second", "last", "first"],
  );
  assert.deepEqual(
    h.commits[0][1].map((ref) => ref.card_id),
    ["first", "second", "last"],
  );
  assert.equal(h.commits[0][2], "observed");
});

test("Focus adapter cancels the proposal when its filter scope changes", (t) => {
  const h = focus(t);
  h.node.dispatchEvent(h.down);
  h.window.dispatchEvent(pointer("pointermove", { clientY: 230 }));
  h.changeScope();
  h.window.dispatchEvent(pointer("pointerup", { clientY: 230 }));
  assert.deepEqual(h.commits, []);
});
