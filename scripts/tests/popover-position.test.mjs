import assert from "node:assert/strict";
import test from "node:test";
import { popoverPosition } from "../../apps/web/src/lib/ui/popover-position.ts";

function fixture(t, { width = 320, height = 400, authoredHeight = 300 } = {}) {
  const names = [
    "window",
    "document",
    "innerWidth",
    "innerHeight",
    "getComputedStyle",
    "ResizeObserver",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Node",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, globalThis[name]]),
  );
  const frames = new Map();
  const observers = [];
  let nextFrame = 0;
  globalThis.window = new EventTarget();
  window.visualViewport = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    width,
    height,
  });
  globalThis.document = new EventTarget();
  globalThis.Node = class {};
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => (name === "--space-4" ? "8px" : "12px"),
  });
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  class Observer {
    active = true;
    observed = new Set();
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      this.observed.add(node);
    }
    unobserve(node) {
      this.observed.delete(node);
    }
    disconnect() {
      this.active = false;
      this.observed.clear();
    }
  }
  globalThis.ResizeObserver = Observer;
  globalThis.MutationObserver = Observer;
  const anchor = {
    isConnected: true,
    bounds: { left: 100, right: 144, top: 340, bottom: 384 },
    getBoundingClientRect() {
      return this.bounds;
    },
  };
  const classes = new Set();
  const panel = {
    isConnected: true,
    authoredHeight,
    naturalHeight: 300,
    width: 220,
    shown: false,
    scrollTop: 0,
    scrollLeft: 0,
    contains(node) {
      return node.parent === this;
    },
    style: {
      removeProperty(name) {
        if (name === "max-height") delete this.maxHeight;
      },
    },
    classList: {
      toggle(name, value) {
        if (value) classes.add(name);
        else classes.delete(name);
      },
    },
    showPopover() {
      this.shown = true;
    },
    get offsetHeight() {
      return Math.min(
        this.naturalHeight,
        this.authoredHeight,
        parseFloat(this.style.maxHeight) || Infinity,
      );
    },
    get offsetWidth() {
      return Math.min(this.width, parseFloat(this.style.maxWidth) || Infinity);
    },
  };
  const action = popoverPosition(panel, {
    anchor,
    align: "end",
    placement: "auto",
  });
  function flush() {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  }
  const bounds = () => ({
    left: parseFloat(panel.style.left),
    top: parseFloat(panel.style.top),
    right: parseFloat(panel.style.left) + panel.offsetWidth,
    bottom: parseFloat(panel.style.top) + panel.offsetHeight,
  });
  t.after(() => {
    action.destroy();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return { anchor, panel, action, frames, observers, classes, flush, bounds };
}

test("a lower-edge disclosure opens above its trigger and stays reachable", (t) => {
  const { panel, anchor, bounds, classes } = fixture(t);
  assert.equal(panel.shown, true);
  assert.equal(classes.has("above"), true);
  assert.ok(bounds().bottom < anchor.bounds.top);
  assert.ok(bounds().left >= 12 && bounds().right <= 308);
  assert.ok(bounds().top >= 12 && bounds().bottom <= 388);
});

test("start and end alignment follow the same unbounded anchor", (t) => {
  const { anchor, panel, action, flush, bounds } = fixture(t, {
    width: 1000,
    height: 800,
  });
  anchor.bounds = { left: 400, right: 444, top: 100, bottom: 144 };
  panel.naturalHeight = 100;
  action.update({ anchor, align: "start", placement: "auto" });
  flush();
  assert.equal(bounds().left, anchor.bounds.left);
  action.update({ anchor, align: "end", placement: "auto" });
  flush();
  assert.equal(bounds().right, anchor.bounds.right);
  assert.ok(bounds().top > anchor.bounds.bottom);
});

test("visual viewport movement and keyboard resizing retain every panel edge", (t) => {
  const { anchor, panel, flush, bounds } = fixture(t, {
    width: 1000,
    height: 1000,
  });
  anchor.bounds = { left: 85, right: 129, top: 210, bottom: 254 };
  panel.naturalHeight = 180;
  Object.assign(window.visualViewport, {
    offsetLeft: 40,
    offsetTop: 120,
    width: 240,
    height: 200,
  });
  window.visualViewport.dispatchEvent(new Event("scroll"));
  flush();
  assert.ok(bounds().left >= 52 && bounds().right <= 268);
  assert.ok(bounds().top >= 132 && bounds().bottom <= 308);
  window.visualViewport.height = 100;
  window.visualViewport.dispatchEvent(new Event("resize"));
  flush();
  assert.ok(bounds().top >= 132 && bounds().bottom <= 208);
});

test("content growth restores the authored height limit after viewport contraction", (t) => {
  const { anchor, panel, observers, flush } = fixture(t, {
    authoredHeight: 200,
  });
  anchor.bounds = { left: 100, right: 144, top: 160, bottom: 204 };
  observers[0].callback();
  flush();
  assert.ok(panel.offsetHeight < 200);
  panel.naturalHeight = 700;
  window.visualViewport.height = 800;
  observers[1].callback();
  flush();
  assert.equal(panel.offsetHeight, 200);
});

test("short screens place a disclosure beside its trigger when that preserves its full height", (t) => {
  const { anchor, panel, action, flush, bounds, classes } = fixture(t, {
    width: 1000,
    height: 320,
    authoredHeight: 240,
  });
  anchor.bounds = { left: 600, right: 644, top: 135, bottom: 179 };
  action.update({ anchor, align: "end", placement: "auto" });
  flush();
  assert.equal(classes.has("beside"), true);
  assert.equal(panel.offsetHeight, 240);
  assert.ok(bounds().right < anchor.bounds.left);
  assert.ok(bounds().top >= 12 && bounds().bottom <= 308);
});

test("resize, content and scroll notifications coalesce and clean up on removal", (t) => {
  const { action, frames, observers, flush } = fixture(t);
  for (let i = 0; i < 8; i++) {
    window.dispatchEvent(new Event("scroll"));
    observers[0].callback();
    observers[1].callback();
  }
  assert.equal(frames.size, 1);
  flush();
  assert.equal(frames.size, 0);
  window.dispatchEvent(new Event("resize"));
  action.destroy();
  assert.equal(frames.size, 0);
  assert.ok(observers.every((observer) => !observer.active));
  window.dispatchEvent(new Event("scroll"));
  document.dispatchEvent(new Event("animationend"));
  assert.equal(frames.size, 0);
});

test("repositioning retains scroll offsets when measuring the authored height resets them", (t) => {
  const { panel, flush } = fixture(t);
  const removeProperty = panel.style.removeProperty.bind(panel.style);
  panel.style.removeProperty = (name) => {
    removeProperty(name);
    // Restoring the larger authored size can clamp offsets during native layout.
    panel.scrollTop = 0;
    panel.scrollLeft = 0;
  };
  panel.scrollTop = 120;
  panel.scrollLeft = 15;
  window.dispatchEvent(new Event("scroll"));
  flush();
  assert.equal(panel.scrollTop, 120);
  assert.equal(panel.scrollLeft, 15);
});

test("scrolling within a disclosure does not schedule another height measurement", (t) => {
  const { panel, frames } = fixture(t);
  const child = Object.assign(new Node(), { parent: panel });
  for (const target of [panel, child]) {
    const scroll = new Event("scroll");
    Object.defineProperty(scroll, "target", { value: target });
    window.dispatchEvent(scroll);
    assert.equal(frames.size, 0);
  }
  window.dispatchEvent(new Event("scroll"));
  assert.equal(frames.size, 1);
});
