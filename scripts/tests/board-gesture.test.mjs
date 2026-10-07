import test from "node:test";
import assert from "node:assert/strict";
import { boardGesture } from "../../apps/web/src/features/board/board-gesture.ts";

/** Enough of an element for ancestry selectors, cloning, capture and geometry. */
class El extends EventTarget {
  parentElement = null;
  children = [];
  style = {};
  captured = new Set();
  scrollLeft = 0;
  scrollTop = 0;
  bounds = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  constructor(tag = "div", attributes = {}, children = []) {
    super();
    this.tag = tag;
    this.attributes = new Map(Object.entries(attributes));
    this.append(...children);
  }
  append(...nodes) {
    for (const node of nodes) node.parentElement = this;
    this.children.push(...nodes);
  }
  remove() {
    const siblings = this.parentElement?.children;
    siblings?.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  matches(selector) {
    return selector
      .split(",")
      .some((part) =>
        part === "*"
          ? true
          : part.startsWith(".")
            ? (this.attributes.get("class") ?? "")
                .split(" ")
                .includes(part.slice(1))
            : part.startsWith("[")
              ? this.attributes.has(part.slice(1, -1))
              : this.tag === part,
      );
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement)
      if (node.matches(selector)) return node;
    return null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  cloneNode(deep) {
    return new El(
      this.tag,
      Object.fromEntries(this.attributes),
      deep ? this.children.map((child) => child.cloneNode(true)) : [],
    );
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getBoundingClientRect() {
    return this.bounds;
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}
const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

function event(type, properties = {}, target) {
  const result = Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 150,
    clientY: 220,
    ...properties,
  });
  if (target) Object.defineProperty(result, "target", { value: target });
  return result;
}

function setup(t) {
  const names = [
    "window",
    "document",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const originals = Object.fromEntries(
    names.map((name) => [name, globalThis[name]]),
  );
  const window = new EventTarget();
  const timers = new Map(),
    frames = new Map(),
    lifecycle = [];
  let sequence = 0,
    clock = 1000,
    hit = null;
  window.setTimeout = (callback, delay) => {
    timers.set(++sequence, { callback, delay });
    return sequence;
  };
  window.clearTimeout = (id) => timers.delete(id);
  for (const name of ["planning-gesture-started", "planning-gesture-ended"])
    window.addEventListener(name, () => lifecycle.push(name.slice(17)));
  const body = new El("body");
  globalThis.window = window;
  globalThis.document = {
    body,
    documentElement: new El("html"),
    createElement: (tag) => new El(tag),
    elementFromPoint: () => hit,
  };
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++sequence, callback);
    return sequence;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);

  // .date-scroll > [data-kanban-column-cards] > article (the card under test)
  const title = new El("button", { class: "title" }, [new El("span")]);
  const node = new El(
    "article",
    { id: "card-1", "data-board-card": "1", "aria-label": "Card" },
    [
      title,
      new El("button", { class: "handle", id: "grip", "aria-label": "Move" }),
      new El("button", { class: "menu" }, [new El("span")]),
      new El("a"),
      new El("details", {}, [new El("summary")]),
      new El("label", {}, [
        new El("input"),
        new El("select"),
        new El("textarea"),
      ]),
    ],
  );
  node.bounds = box(100, 200, 240, 80);
  const column = new El("div", { "data-kanban-column-cards": "" }, [node]);
  column.bounds = box(100, 100, 240, 400);
  const board = new El("div", { class: "date-scroll" }, [column]);
  board.bounds = box(100, 0, 400, 600);

  let disabled = false,
    drop = { left: 300, top: 120, width: 180, height: 80, key: "doing:0" };
  const targets = [],
    commits = [];
  const options = {
    disabled: () => disabled,
    target: (x, y) => (targets.push([x, y]), drop),
    commit: () =>
      commits.push({
        overlays: body.children.length,
        captured: node.captured.size,
        dragging: node.attributes.has("data-dragging"),
        lifecycle: [...lifecycle],
      }),
  };
  const action = boardGesture(node, options);
  t.after(() => {
    action.destroy();
    for (const name of names) {
      if (originals[name] === undefined) delete globalThis[name];
      else globalThis[name] = originals[name];
    }
  });
  const h = {
    window,
    root: document.documentElement,
    body,
    node,
    title,
    column,
    board,
    action,
    options,
    timers,
    frames,
    lifecycle,
    targets,
    commits,
    disable: () => (disabled = true),
    dropAt: (value) => (drop = value),
    over: (element) => (hit = element),
    down(properties = {}, target = title) {
      const result = event("pointerdown", properties, target);
      node.dispatchEvent(result);
      return result;
    },
    move(x, y = 220, properties = {}) {
      const result = event("pointermove", {
        clientX: x,
        clientY: y,
        ...properties,
      });
      window.dispatchEvent(result);
      return result;
    },
    up(properties = {}) {
      window.dispatchEvent(event("pointerup", properties));
    },
    hold() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(({ callback }) => callback());
    },
    // Frames arrive 16ms apart unless a test supplies its own timestamps.
    frame(time = (clock += 16)) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    },
    clean() {
      assert.deepEqual(body.children, []);
      assert.equal(node.captured.size, 0);
      assert.equal(node.attributes.has("data-dragging"), false);
      assert.equal(frames.size, 0);
      assert.equal(timers.size, 0);
    },
  };
  return h;
}

test("a mouse drag lifts an inert anonymous preview once it travels five pixels", (t) => {
  const h = setup(t);
  h.down();
  assert.deepEqual(h.lifecycle, ["started"]);
  assert.equal(h.move(153, 222).defaultPrevented, false);
  assert.deepEqual(h.body.children, []);
  assert.equal(h.node.captured.size, 0);
  assert.equal(h.move(153, 224).defaultPrevented, true);
  assert.deepEqual([...h.node.captured], [1]);
  assert.equal(h.node.attributes.get("data-dragging"), "true");
  const [ghost, indicator] = h.body.children;
  assert.equal(h.body.children.length, 2);
  for (const element of [ghost, ...ghost.querySelectorAll("*")])
    for (const name of ["id", "data-board-card", "data-dragging", "aria-label"])
      assert.equal(element.attributes.has(name), false, name);
  assert.equal(ghost.querySelectorAll("*").length, 12);
  assert.equal(ghost.querySelectorAll(".title").length, 1);
  assert.equal(ghost.inert, true);
  assert.equal(ghost.attributes.get("aria-hidden"), "true");
  assert.equal(ghost.attributes.has("data-board-drag-preview"), true);
  assert.equal(ghost.style.position, "fixed");
  assert.equal(ghost.style.pointerEvents, "none");
  assert.equal(ghost.style.width, "240px");
  // The preview starts exactly over the card and is moved by transform only.
  assert.equal(
    ghost.style.transform,
    "translate3d(100px, 200px, 0) rotate(0.00deg) scale(1.0000)",
  );
  assert.equal(h.root.attributes.has("data-board-dragging"), true);
  assert.equal(indicator.attributes.has("data-board-drop-indicator"), true);
  assert.equal(indicator.attributes.get("aria-hidden"), "true");
  assert.equal(indicator.style.pointerEvents, "none");
  assert.equal(indicator.style.display, "none");
  // The card itself keeps its identity for the board.
  assert.equal(h.node.attributes.get("id"), "card-1");
  assert.equal(h.node.attributes.get("data-board-card"), "1");
});

test("each frame keeps the preview under the grip and marks the proposed slot", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  const [ghost, indicator] = h.body.children;
  h.frame();
  assert.deepEqual(h.targets, [[400, 300]]);
  assert.match(ghost.style.transform, /^translate3d\(350px, 280px, 0\) /);
  assert.equal(ghost.style.cursor, "grabbing");
  assert.equal(indicator.style.display, "block");
  assert.equal(indicator.style.left, "300px");
  assert.equal(indicator.style.top, "120px");
  assert.equal(indicator.style.width, "180px");
  assert.equal(indicator.style.height, "80px");
  assert.equal(indicator.style.transition, "none");
  h.dropAt(null);
  h.move(410, 320);
  h.frame();
  assert.match(ghost.style.transform, /^translate3d\(360px, 300px, 0\) /);
  assert.equal(ghost.style.cursor, "no-drop");
  assert.equal(indicator.style.display, "none");
  assert.equal(h.frames.size, 1);
});

test("the preview grows as it lifts, leans into its travel and straightens at rest", (t) => {
  const h = setup(t);
  const shape = () => {
    const [, turn, scale] = h.body.children[0].style.transform.match(
      /rotate\((-?[\d.]+)deg\) scale\(([\d.]+)\)/,
    );
    return { turn: Number(turn), scale: Number(scale) };
  };
  h.down();
  h.move(160, 220);
  h.frame(1000);
  assert.equal(shape().scale, 1);
  h.move(200, 220);
  h.frame(1016);
  assert(shape().turn > 0, "travel to the right leans the preview clockwise");
  assert(shape().scale > 1 && shape().scale < 1.03);
  for (let time = 1032; time < 1600; time += 16) h.frame(time);
  assert.equal(shape().scale, 1.03);
  assert(Math.abs(shape().turn) < 0.01, "a resting preview is level");
  h.move(120, 220);
  h.frame(1616);
  assert(shape().turn < 0, "travel to the left leans it the other way");
  assert(shape().turn >= -4, "the lean is bounded");
});

test("the slot marker glides to a new place and otherwise follows scrolling exactly", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  const [, indicator] = h.body.children;
  h.frame();
  h.dropAt({ left: 300, top: 90, width: 180, height: 80, key: "doing:0" });
  h.frame();
  assert.equal(indicator.style.top, "90px");
  assert.equal(indicator.style.transition, "none");
  h.dropAt({ left: 300, top: 260, width: 180, height: 80, key: "doing:3" });
  h.frame();
  assert.equal(indicator.style.top, "260px");
  assert.match(indicator.style.transition, /top 160ms/);
});

test("a drop on a slot commits once, after the preview and capture are gone", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.frame();
  h.up({ clientX: 420, clientY: 310 });
  assert.deepEqual(h.targets.at(-1), [420, 310]);
  assert.deepEqual(h.commits, [
    {
      // The preview outlives the pointer until it has come to rest.
      overlays: 1,
      captured: 0,
      dragging: false,
      lifecycle: ["started", "ended"],
    },
  ]);
  h.clean();
  h.move(500, 300);
  h.up();
  h.frame();
  assert.equal(h.commits.length, 1);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
});

test("a drop outside every slot restores the board without a proposal", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.dropAt(null);
  h.up();
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  h.clean();
});

test("a press released in place is a click, not a proposal", (t) => {
  const h = setup(t);
  h.down();
  h.move(152, 221);
  h.up();
  assert.deepEqual(h.targets, []);
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  const click = event("click");
  h.node.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  h.clean();
});

test("the click synthesized after a drag is consumed once", (t) => {
  const h = setup(t);
  const click = () => {
    const result = event("click");
    h.node.dispatchEvent(result);
    return result.defaultPrevented;
  };
  h.down();
  h.move(400, 300);
  h.up();
  assert.equal(click(), true);
  assert.equal(click(), false);
  h.down();
  h.move(400, 300);
  h.up();
  // Browsers may omit that click; a fresh press owns a fresh one.
  h.down();
  h.up();
  assert.equal(click(), false);
});

test("presses on form controls, links and ordinary buttons stay with those controls", (t) => {
  const h = setup(t);
  const [, grip, menu, link, details, label] = h.node.children;
  for (const target of [
    menu,
    menu.children[0],
    link,
    details,
    details.children[0],
    ...label.children,
  ]) {
    h.down({}, target);
    h.move(400, 300);
    h.up();
  }
  assert.deepEqual(h.lifecycle, []);
  assert.deepEqual(h.commits, []);
  for (const target of [h.node, label, grip, h.title, h.title.children[0]]) {
    h.down({}, target);
    h.move(400, 300);
    h.up();
  }
  assert.equal(h.commits.length, 5);
});

test("secondary buttons, non-primary pointers and a disabled board never start a drag", (t) => {
  const h = setup(t);
  for (const properties of [{ button: 1 }, { button: 2 }, { isPrimary: false }])
    h.down(properties);
  h.disable();
  h.down();
  h.move(400, 300);
  h.up();
  assert.deepEqual(h.lifecycle, []);
  assert.deepEqual(h.targets, []);
  h.clean();
});

test("movement and release of another pointer leave the drag untouched", (t) => {
  const h = setup(t);
  h.down();
  assert.equal(h.move(400, 300, { pointerId: 2 }).defaultPrevented, false);
  assert.deepEqual(h.body.children, []);
  h.move(400, 300);
  h.up({ pointerId: 2 });
  assert.deepEqual(h.commits, []);
  assert.equal(h.body.children.length, 2);
  h.up();
  assert.equal(h.commits.length, 1);
});

for (const pointerType of ["touch", "pen"]) {
  test(`a ${pointerType} press lifts the card only after a stationary hold`, (t) => {
    const h = setup(t);
    h.down({ pointerType });
    assert.deepEqual(
      [...h.timers.values()].map(({ delay }) => delay),
      [250],
    );
    assert.equal(h.node.attributes.get("data-pressing"), "true");
    assert.equal(h.move(156, 225.2).defaultPrevented, false);
    assert.deepEqual(h.body.children, []);
    assert.equal(h.node.captured.size, 0);
    h.hold();
    assert.equal(h.body.children.length, 2);
    assert.deepEqual([...h.node.captured], [1]);
    assert.equal(h.frames.size, 1);
    assert.equal(h.move(400, 300).defaultPrevented, true);
    h.frame();
    assert.match(h.body.children[0].style.transform, /^translate3d\(350px, /);
    assert.equal(h.node.attributes.has("data-pressing"), false);
    h.up({ clientX: 400, clientY: 300 });
    assert.equal(h.commits.length, 1);
    h.clean();
  });
}

test("touch movement before the hold belongs to native scrolling", (t) => {
  const h = setup(t);
  h.down({ pointerType: "touch" });
  assert.equal(h.move(150, 229).defaultPrevented, false);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  h.clean();
  h.hold();
  h.move(400, 300);
  h.up();
  assert.deepEqual(h.body.children, []);
  assert.deepEqual(h.targets, []);
  assert.deepEqual(h.commits, []);
});

test("a touch released before the hold is an ordinary tap", (t) => {
  const h = setup(t);
  h.down({ pointerType: "touch" });
  h.up();
  h.clean();
  h.hold();
  assert.deepEqual(h.body.children, []);
  assert.deepEqual(h.targets, []);
  assert.deepEqual(h.commits, []);
  const click = event("click");
  h.node.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
});

// Auto-scroll: nothing where a 56px band begins, 1.1px/ms at the edge and beyond.
const pace = (depth) => Math.min(1, Math.max(0, depth / 56)) ** 2 * 1.1;
const near = (actual, expected, message) =>
  assert(
    Math.abs(actual - expected) < 1e-9,
    message ?? `${actual} != ${expected}`,
  );

test("holding the preview near a horizontal board edge scrolls the board faster the closer it is", (t) => {
  const h = setup(t);
  h.down();
  // Board spans x 100..500.
  h.move(110, 300);
  h.frame(1000);
  near(h.board.scrollLeft, -pace(46) * 16);
  h.frame(1010);
  near(h.board.scrollLeft, -pace(46) * 26);
  // A stalled frame never jumps further than 32ms would.
  h.frame(5000);
  near(h.board.scrollLeft, -pace(46) * 58);
  let time = 5000;
  for (const [x, y, speed] of [
    [60, 300, -1.1],
    [100, 300, -1.1],
    [128, 300, -pace(28)],
    [155, 300, -pace(1)],
    [156, 300, 0],
    [300, 300, 0],
    [444, 300, 0],
    [472, 300, pace(28)],
    [500, 300, 1.1],
    [110, 601, 0],
    [490, -1, 0],
  ]) {
    h.board.scrollLeft = 0;
    h.move(x, y);
    h.frame((time += 16));
    near(h.board.scrollLeft, speed * 16, `x=${x} y=${y}`);
  }
});

test("a paged board turns one page after a pause at its edge, then rests", (t) => {
  const h = setup(t);
  const pages = [];
  h.options.paged = () => true;
  h.options.page = (direction) => pages.push(direction);
  h.down();
  // Board spans x 100..500; the page bands are 32px.
  h.move(480, 300);
  h.frame(1000);
  h.frame(1300);
  assert.deepEqual(pages, [], "a passing preview turns nothing");
  h.frame(1380);
  assert.deepEqual(pages, [1]);
  assert.equal(h.board.scrollLeft, 0, "a paged board is never crept along");
  h.frame(1800);
  assert.deepEqual(pages, [1], "the next page waits for the board to rest");
  h.frame(2040);
  assert.deepEqual(pages, [1, 1]);
  h.move(300, 300);
  h.frame(2100);
  h.move(120, 300);
  h.frame(2700);
  h.frame(3000);
  assert.deepEqual(pages, [1, 1], "each edge needs its own pause");
  h.frame(3080);
  assert.deepEqual(pages, [1, 1, -1]);
});

test("holding the preview near a column edge scrolls the column under the pointer", (t) => {
  const h = setup(t);
  h.down();
  h.move(300, 300);
  h.frame();
  assert.equal(h.column.scrollTop, 0);
  // Column spans y 100..500; another column may be under the pointer.
  const other = new El("div", { "data-kanban-column-cards": "" }, [
    new El("article"),
  ]);
  other.bounds = h.column.bounds;
  for (const [y, speed] of [
    [100, -1.1],
    [128, -pace(28)],
    [156, 0],
    [300, 0],
    [444, 0],
    [472, pace(28)],
    [500, 1.1],
  ]) {
    other.scrollTop = 0;
    h.over(other.children[0]);
    h.move(300, y);
    h.frame();
    near(other.scrollTop, speed * 16, `y=${y}`);
  }
  assert.equal(h.column.scrollTop, 0);
  other.scrollTop = 0;
  h.over(new El("main"));
  h.move(300, 110);
  h.frame();
  assert.equal(other.scrollTop, 0);
  assert.equal(h.column.scrollTop, 0);
});

test("a drag keeps the slot rules and proposal observed at press time", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.action.update({
    disabled: () => false,
    target: () => assert.fail("The new owner must not resolve the old drag"),
    commit: () => assert.fail("The new owner must not commit the old drag"),
  });
  h.frame();
  h.up({ clientX: 400, clientY: 300 });
  assert.deepEqual(h.targets, [
    [400, 300],
    [400, 300],
  ]);
  assert.equal(h.commits.length, 1);
});

test("a board disabled by an update cancels the drag immediately", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.action.update({ ...h.options, disabled: () => true });
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  h.clean();
  h.up();
  assert.deepEqual(h.commits, []);
});

for (const moment of ["the next frame", "release"]) {
  test(`a board that becomes disabled mid-drag cancels at ${moment}`, (t) => {
    const h = setup(t);
    h.down();
    h.move(400, 300);
    h.disable();
    if (moment === "release") h.up();
    else h.frame();
    assert.deepEqual(h.targets, []);
    assert.deepEqual(h.commits, []);
    assert.deepEqual(h.lifecycle, ["started", "ended"]);
    h.clean();
  });
}

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
  test(`${reason} cancels a board drag without a proposal`, (t) => {
    const h = setup(t);
    h.down();
    h.move(400, 300);
    h.frame();
    const cancel =
      reason === "Escape" || reason === "Tab"
        ? event("keydown", { key: reason })
        : reason === "second-pointer"
          ? event("pointerdown", { pointerId: 2, isPrimary: false })
          : event(reason);
    (reason === "lostpointercapture" ? h.node : h.window).dispatchEvent(cancel);
    assert.deepEqual(h.lifecycle, ["started", "ended"]);
    h.clean();
    h.up({ clientX: 400, clientY: 300 });
    assert.deepEqual(h.commits, []);
    assert.equal(h.targets.length, 1);
    if (reason === "Escape" || reason === "Tab")
      assert.equal(cancel.defaultPrevented, reason === "Escape");
  });
}

test("a pending touch hold is cancelled by Escape before it can lift the card", (t) => {
  const h = setup(t);
  h.down({ pointerType: "touch" });
  h.window.dispatchEvent(event("keydown", { key: "Escape" }));
  h.clean();
  h.hold();
  assert.deepEqual(h.body.children, []);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
});

test("another pointer's cancellation and a child losing capture keep the drag", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.window.dispatchEvent(event("pointercancel", { pointerId: 2 }));
  h.node.dispatchEvent(event("lostpointercapture", {}, h.title));
  assert.equal(h.body.children.length, 2);
  h.up();
  assert.equal(h.commits.length, 1);
});

test("native scrolling, context menus and HTML drags are suppressed only as far as the drag needs", (t) => {
  const h = setup(t);
  const prevented = (type, init = { cancelable: true }) => {
    const result = new Event(type, init);
    h.node.dispatchEvent(result);
    return result.defaultPrevented;
  };
  assert.equal(prevented("dragstart"), true);
  assert.equal(prevented("touchmove"), false);
  assert.equal(prevented("contextmenu"), false);
  h.down();
  assert.equal(prevented("touchmove"), false);
  assert.equal(prevented("contextmenu"), false);
  h.move(400, 300);
  assert.equal(prevented("touchmove"), true);
  assert.equal(prevented("touchmove", { cancelable: false }), false);
  assert.equal(prevented("contextmenu"), true);
  assert.equal(prevented("dragstart"), true);
  h.up();
  assert.equal(prevented("touchmove"), false);
  assert.equal(prevented("contextmenu"), false);
});

test("a destroyed card cancels its drag and stops listening", (t) => {
  const h = setup(t);
  h.down();
  h.move(400, 300);
  h.action.destroy();
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  h.clean();
  h.up();
  h.down();
  h.move(400, 300);
  h.up();
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.lifecycle, ["started", "ended"]);
  const dragstart = new Event("dragstart", { cancelable: true });
  h.node.dispatchEvent(dragstart);
  assert.equal(dragstart.defaultPrevented, false);
});

test("a destination without an order is outlined as a whole", (t) => {
  const h = setup(t);
  h.dropAt({
    left: 300,
    top: 40,
    width: 280,
    height: 500,
    key: "paused",
    area: true,
  });
  h.down();
  h.move(400, 300);
  const [, indicator] = h.body.children;
  h.frame();
  assert.equal(indicator.style.display, "block");
  assert.equal(indicator.style.top, "40px");
  assert.equal(indicator.style.height, "500px");
  assert.equal(indicator.style.background, "transparent");
  assert.equal(indicator.style.borderRadius, "var(--radius-panel)");
});

test("a released preview flies to the place the board gives it before it is removed", async (t) => {
  const h = setup(t);
  const order = [];
  let finish;
  h.options.lift = () => order.push("lift");
  h.options.landed = () => order.push("landed");
  h.options.commit = () => {
    order.push("commit");
    return Promise.resolve({ left: 320, top: 140, width: 240, height: 80 });
  };
  h.down();
  h.move(400, 300);
  const [ghost] = h.body.children;
  const flights = [];
  ghost.animate = (frames, timing) => {
    flights.push({ frames, timing });
    return { finished: new Promise((resolve) => (finish = resolve)) };
  };
  h.frame();
  h.up({ clientX: 400, clientY: 300 });
  assert.deepEqual(order, ["lift", "commit"]);
  assert.equal(h.node.captured.size, 0);
  assert.deepEqual(h.body.children, [ghost], "only the slot marker is gone");
  await Promise.resolve();
  assert.equal(flights.length, 1);
  assert.equal(
    flights[0].frames[1].transform,
    "translate3d(320px, 140px, 0) rotate(0.00deg) scale(1.0000)",
  );
  assert.deepEqual(h.body.children, [ghost]);
  // A new drag may begin while the last preview is still landing.
  h.down();
  h.move(400, 300);
  assert.equal(h.body.children.length, 3);
  h.up({ clientX: 400, clientY: 300 });
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [
    "lift",
    "commit",
    "lift",
    "commit",
    "landed",
    "landed",
  ]);
  h.clean();
});

test("a cancelled drag returns its preview to the place the board names", (t) => {
  const h = setup(t);
  const order = [];
  h.options.abort = () => (order.push("abort"), null);
  h.options.landed = () => order.push("landed");
  h.down();
  h.move(400, 300);
  h.dropAt(null);
  h.up();
  assert.deepEqual(order, ["abort", "landed"]);
  assert.equal(h.commits.length, 0);
  h.clean();
  // A press that never lifted has nothing to return.
  h.down();
  h.up();
  assert.deepEqual(order, ["abort", "landed"]);
});
