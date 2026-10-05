import test from "node:test";
import assert from "node:assert/strict";
import { checklistOrderGesture } from "../../apps/web/src/features/cards/checklist-order-gesture.ts";

/** Enough of an element for ancestry selectors, cloning, capture and geometry. */
class El extends EventTarget {
  parentElement = null;
  children = [];
  style = {};
  captured = new Set();
  scrollTop = 0;
  offsetWidth = 0;
  offsetHeight = 0;
  constructor(tag = "div", attributes = {}, children = []) {
    super();
    this.tag = tag;
    this.attributes = new Map(Object.entries(attributes));
    this.append(...children);
  }
  get dataset() {
    const name = (key) =>
      `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    return new Proxy({}, { get: (_, key) => this.attributes.get(name(key)) });
  }
  get classes() {
    return (this.attributes.get("class") ?? "").split(" ").filter(Boolean);
  }
  get classList() {
    return {
      add: (value) =>
        this.attributes.set("class", [...this.classes, value].join(" ")),
      remove: (value) =>
        this.attributes.set(
          "class",
          this.classes.filter((name) => name !== value).join(" "),
        ),
    };
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
    return selector === "*"
      ? true
      : selector.startsWith(".")
        ? this.classes.includes(selector.slice(1))
        : selector.startsWith("[")
          ? this.attributes.has(selector.slice(1, -1))
          : this.tag === selector;
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
  focus(options) {
    this.focused = options;
  }
  // Laid-out elements carry bounds; fixed overlays sit where their style says.
  getBoundingClientRect() {
    return (
      this.bounds ?? {
        left: parseFloat(this.style.left) || 0,
        top: parseFloat(this.style.top) || 0,
        width: this.offsetWidth,
        height: this.offsetHeight,
      }
    );
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
    pointerId: 3,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: 60,
    clientY: 140,
    ...properties,
  });
  if (target) Object.defineProperty(result, "target", { value: target });
  return result;
}

const environments = new WeakMap();
/** One window per test; every list mounted in it is destroyed before it goes. */
function environment(t) {
  if (environments.has(t)) return environments.get(t);
  const names = [
    "window",
    "document",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const originals = Object.fromEntries(
    names.map((name) => [name, globalThis[name]]),
  );
  const window = new EventTarget();
  window.clearTimeout = () => {};
  const frames = new Map(),
    actions = [];
  let sequence = 0;
  const body = new El("body");
  globalThis.window = window;
  globalThis.document = { body, createElement: (tag) => new El(tag) };
  globalThis.getComputedStyle = (element) => ({
    overflowY: element.overflowY ?? "visible",
  });
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++sequence, callback);
    return sequence;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  t.after(() => {
    actions.forEach((action) => action.destroy());
    for (const name of names) {
      if (originals[name] === undefined) delete globalThis[name];
      else globalThis[name] = originals[name];
    }
  });
  environments.set(t, { window, body, frames, actions });
  return environments.get(t);
}

/**
 * dialog? > .scroller (y 100..400) > section.checklist > ul (x 20..280) > li*
 * Rows are 50px high from y 120: a 120..170, b 170..220, c 220..270.
 */
function setup(
  t,
  { ids = ["a", "b", "c"], dialog = false, scroll = true } = {},
) {
  const { window, body, frames, actions } = environment(t);

  const rows = ids.map((id, index) => {
    const row = new El("li", { "data-checklist-item": id, id: `row-${id}` }, [
      new El("textarea"),
      new El(
        "button",
        { class: "handle", "data-checklist-handle": id, id: `handle-${id}` },
        [new El("svg")],
      ),
    ]);
    row.bounds = box(20, 120 + index * 50, 260, 50);
    return row;
  });
  const list = new El("ul", {}, rows);
  list.bounds = box(20, 120, 260, ids.length * 50);
  const section = new El("section", { class: "checklist" }, [list]);
  const scroller = new El("div", { class: "scroller" }, [section]);
  scroller.bounds = box(0, 100, 300, 300);
  if (scroll) scroller.overflowY = "auto";
  const layer = dialog ? new El("dialog", {}, [scroller]) : body;
  if (!dialog) body.append(scroller);

  let items = ids.map((id) => ({ id, text: id, completed: false })),
    disabled = false;
  const log = [],
    commits = [],
    announcements = [];
  const options = {
    items: () => items,
    disabled: () => disabled,
    // The component marks the picked-up row; the preview must not inherit it.
    pickedUp: (id) => {
      log.push(["pickedUp", id]);
      rows
        .find((row) => row.dataset.checklistItem === id)
        .classList.add("dragging");
    },
    released: () => log.push("released"),
    commit: (...args) => commits.push(args),
    announce: (message) => announcements.push(message),
  };
  const action = checklistOrderGesture(list, options);
  actions.push(action);
  const handle = (id) => rows[ids.indexOf(id)].children[1];
  const overlays = () =>
    layer.children.filter((child) => !child.matches(".scroller"));
  return {
    window,
    body,
    list,
    rows,
    scroller,
    action,
    options,
    log,
    commits,
    announcements,
    frames,
    handle,
    overlays,
    setItems: (next) => (items = next),
    disable: () => (disabled = true),
    // Presses land 20px below the top edge of the row.
    down(id = "a", target = handle(id), properties = {}) {
      const result = event(
        "pointerdown",
        { clientY: 140 + ids.indexOf(id) * 50, ...properties },
        target,
      );
      list.dispatchEvent(result);
      return result;
    },
    move(y, x = 60) {
      const result = event("pointermove", { clientX: x, clientY: y });
      window.dispatchEvent(result);
      return result;
    },
    up(y, x = 60) {
      window.dispatchEvent(event("pointerup", { clientX: x, clientY: y }));
    },
    frame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    drag(id, y, x = 60) {
      this.down(id);
      this.move(y, x);
      this.frame();
      this.up(y, x);
    },
    clean() {
      assert.deepEqual(overlays(), []);
      assert.equal(list.captured.size, 0);
      assert.equal(frames.size, 0);
    },
  };
}

test("pressing a handle picks up its row and captures the pointer without scrolling focus", (t) => {
  const h = setup(t);
  const down = h.down("b");
  assert.equal(down.defaultPrevented, true);
  assert.deepEqual([...h.list.captured], [3]);
  assert.deepEqual(h.handle("b").focused, { preventScroll: true });
  assert.deepEqual(h.log, [["pickedUp", "b"]]);
  assert.deepEqual(h.overlays(), []);
  assert.deepEqual(h.announcements, []);
  h.up(190);
  assert.deepEqual(h.log, [["pickedUp", "b"], "released"]);
  assert.equal(h.handle("b").attributes.get("aria-pressed"), "false");
  assert.deepEqual(h.commits, []);
  h.clean();
});

test("a press released within the drag threshold changes nothing", (t) => {
  const h = setup(t);
  h.down("a");
  assert.equal(h.move(142, 63).defaultPrevented, false);
  h.up(142, 63);
  assert.deepEqual(h.overlays(), []);
  assert.deepEqual(h.announcements, []);
  assert.deepEqual(h.commits, []);
});

test("dragging lifts an inert anonymous copy of the row and announces its position", (t) => {
  const h = setup(t);
  h.down("b");
  assert.equal(h.move(193, 64).defaultPrevented, true);
  const [preview, indicator] = h.overlays();
  assert.equal(h.overlays().length, 2);
  assert.equal(preview.tag, "section");
  assert.deepEqual(preview.classes, ["checklist"]);
  assert.equal(preview.inert, true);
  assert.equal(preview.attributes.get("aria-hidden"), "true");
  assert.equal(preview.attributes.has("data-checklist-drag-preview"), true);
  assert.equal(preview.style.position, "fixed");
  assert.equal(preview.style.pointerEvents, "none");
  assert.equal(preview.style.width, "260px");
  assert.equal(preview.style.left, "20px");
  const [contents] = preview.children;
  assert.equal(contents.tag, "ul");
  assert.equal(contents.children.length, 1);
  const [copy] = contents.children;
  assert.equal(copy.inert, true);
  assert.equal(copy.attributes.get("aria-hidden"), "true");
  assert.deepEqual(copy.classes, []);
  for (const element of [copy, ...copy.querySelectorAll("*")])
    for (const name of ["id", "data-checklist-item", "data-checklist-handle"])
      assert.equal(element.attributes.has(name), false, name);
  assert.deepEqual(
    copy.querySelectorAll("*").map((element) => element.tag),
    ["textarea", "button", "svg"],
  );
  assert.equal(indicator.attributes.has("data-checklist-drop-indicator"), true);
  assert.equal(indicator.attributes.get("aria-hidden"), "true");
  assert.equal(indicator.style.pointerEvents, "none");
  assert.equal(h.handle("b").attributes.get("aria-pressed"), "true");
  assert.deepEqual(h.announcements, [
    "Podniesiono pozycję listy kontrolnej 2.",
  ]);
  // The source row keeps its identity for the list.
  assert.equal(h.rows[1].dataset.checklistItem, "b");
  assert.deepEqual(h.rows[1].classes, ["dragging"]);
});

test("overlays live inside the enclosing dialog's top layer when there is one", (t) => {
  const h = setup(t, { dialog: true });
  h.down("a");
  h.move(200);
  assert.equal(h.overlays().length, 2);
  assert.deepEqual(h.body.children, []);
  h.up(200);
  h.clean();
  assert.equal(h.commits.length, 1);
});

test("each frame keeps the copy under the grip and marks the insertion edge", (t) => {
  const h = setup(t);
  h.down("a");
  h.move(200);
  const [preview, indicator] = h.overlays();
  // Remaining rows: b 170..220 and c 220..270.
  for (const [y, top] of [
    [194, 170],
    [195, 220],
    [244, 220],
    [245, 270],
    [270, 270],
  ]) {
    h.move(y);
    h.frame();
    assert.equal(preview.style.top, `${y - 20}px`);
    assert.equal(preview.style.left, "20px");
    assert.equal(indicator.hidden, false);
    assert.equal(indicator.style.top, `${top}px`, `y=${y}`);
    assert.equal(indicator.style.left, "20px");
    assert.equal(indicator.style.width, "260px");
  }
  assert.equal(h.frames.size, 1);
  for (const [y, x] of [
    [200, 19],
    [200, 281],
    [119, 60],
    [271, 60],
  ]) {
    h.move(y, x);
    h.frame();
    assert.equal(indicator.hidden, true, `${x},${y}`);
    assert.equal(preview.style.top, `${y - 20}px`);
  }
  assert.deepEqual(h.commits, []);
});

test("a drop commits the captured order with the row at the indicated position", (t) => {
  for (const [id, y, expected] of [
    ["a", 200, ["b", "a", "c"]],
    ["a", 260, ["b", "c", "a"]],
    ["c", 130, ["c", "a", "b"]],
    ["c", 190, ["a", "c", "b"]],
    ["b", 130, ["b", "a", "c"]],
    ["b", 250, ["a", "c", "b"]],
  ]) {
    const h = setup(t);
    h.drag(id, y);
    assert.deepEqual(h.commits, [[expected, id]], `${id} to ${y}`);
    assert.deepEqual(h.log, [["pickedUp", id], "released"]);
    assert.equal(h.handle(id).attributes.get("aria-pressed"), "false");
    assert.deepEqual(h.announcements.length, 1);
    h.clean();
    h.action.destroy();
  }
});

test("a row dropped back on its own position is not a change", (t) => {
  for (const [id, y] of [
    ["a", 150],
    ["a", 194],
    ["b", 146],
    ["b", 244],
    ["c", 246],
  ]) {
    const h = setup(t);
    h.drag(id, y);
    assert.deepEqual(h.commits, [], `${id} to ${y}`);
    assert.deepEqual(h.log, [["pickedUp", id], "released"]);
    h.clean();
    h.action.destroy();
  }
});

test("a drop outside the list keeps the order", (t) => {
  for (const [y, x] of [
    [200, 19],
    [200, 281],
    [119, 60],
    [271, 60],
  ]) {
    const h = setup(t);
    h.drag("a", y, x);
    assert.deepEqual(h.commits, [], `${x},${y}`);
    assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
    h.clean();
    h.action.destroy();
  }
});

test("a single-item list can be picked up and released without a proposal", (t) => {
  const h = setup(t, { ids: ["a"] });
  h.down("a");
  h.move(160);
  h.frame();
  const [, indicator] = h.overlays();
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.style.top, "170px");
  h.up(160);
  assert.deepEqual(h.commits, []);
  h.clean();
});

test("the part of a list scrolled out of its viewport is not a drop target", (t) => {
  // Eight rows span y 120..520; the scroll viewport ends at 400.
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const hidden = setup(t, { ids });
  hidden.down("a");
  hidden.move(450);
  hidden.frame();
  assert.equal(hidden.overlays()[1].hidden, true);
  hidden.up(450);
  assert.deepEqual(hidden.commits, []);
  hidden.action.destroy();
  const visible = setup(t, { ids });
  visible.drag("a", 399);
  assert.deepEqual(visible.commits, [
    [["b", "c", "d", "e", "f", "a", "g", "h"], "a"],
  ]);
  visible.action.destroy();
  // Without a scrolling ancestor the whole list accepts the drop.
  const unclipped = setup(t, { ids, scroll: false });
  unclipped.drag("a", 450);
  assert.deepEqual(unclipped.commits, [
    [["b", "c", "d", "e", "f", "g", "a", "h"], "a"],
  ]);
});

test("holding the copy near a viewport edge scrolls the enclosing container at a bounded pace", (t) => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const h = setup(t, { ids });
  h.down("a");
  h.move(250);
  // Viewport spans y 100..400 with 48px edge bands and a 12px step limit.
  for (const [y, x, delta] of [
    [250, 60, 0],
    [352, 60, 0],
    [356, 60, 4],
    [390, 60, 12],
    [460, 60, 12],
    [148, 60, 0],
    [142, 60, -6],
    [105, 60, -12],
    [390, 301, 0],
    [390, -1, 0],
  ]) {
    h.scroller.scrollTop = 100;
    h.move(y, x);
    h.frame();
    assert.equal(h.scroller.scrollTop, 100 + delta, `${x},${y}`);
  }
  h.action.destroy();
  const unclipped = setup(t, { ids, scroll: false });
  unclipped.down("a");
  unclipped.move(390);
  unclipped.frame();
  assert.equal(unclipped.scroller.scrollTop, 0);
});

test("only a handle of a listed item starts a reorder", (t) => {
  const h = setup(t);
  const stray = new El("button", { "data-checklist-handle": "x" });
  h.list.append(stray);
  for (const target of [h.list, h.rows[0], h.rows[0].children[0], stray]) {
    const down = h.down("a", target);
    assert.equal(down.defaultPrevented, false);
    h.move(200);
    h.up(200);
  }
  h.setItems([{ id: "b" }, { id: "c" }]);
  h.down("a");
  h.move(200);
  h.up(200);
  for (const properties of [{ button: 2 }, { isPrimary: false }])
    h.down("b", h.handle("b"), properties);
  h.disable();
  h.down("b");
  assert.deepEqual(h.log, []);
  assert.deepEqual(h.commits, []);
  assert.equal(h.list.captured.size, 0);
  assert.equal(h.handle("a").focused, undefined);
});

test("the grip icon inside a handle starts the same reorder", (t) => {
  const h = setup(t);
  h.down("a", h.handle("a").children[0]);
  h.move(200);
  h.up(200);
  assert.deepEqual(h.commits, [[["b", "a", "c"], "a"]]);
});

test("edits that keep every item's identity do not interrupt the drag", (t) => {
  const h = setup(t);
  h.down("a");
  h.move(200);
  h.setItems([
    { id: "a", text: "edited", completed: true },
    { id: "b", text: "b", completed: false },
    { id: "c", text: "c", completed: true },
  ]);
  h.frame();
  h.action.update({ ...h.options });
  h.up(200);
  assert.deepEqual(h.commits, [[["b", "a", "c"], "a"]]);
  assert.deepEqual(h.announcements, [
    "Podniesiono pozycję listy kontrolnej 1.",
  ]);
});

for (const [change, items] of [
  ["a removed item", ["a", "c"]],
  ["an added item", ["a", "b", "c", "d"]],
  ["a competing order", ["b", "a", "c"]],
]) {
  for (const moment of ["the next frame", "release"]) {
    test(`${change} cancels the drag at ${moment} instead of rebasing it`, (t) => {
      const h = setup(t);
      h.down("a");
      h.move(200);
      h.setItems(items.map((id) => ({ id })));
      if (moment === "release") h.up(200);
      else h.frame();
      assert.deepEqual(h.commits, []);
      assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
      assert.deepEqual(h.announcements, [
        "Podniesiono pozycję listy kontrolnej 1.",
        "Przywrócono kolejność listy kontrolnej.",
      ]);
      assert.equal(h.handle("a").attributes.get("aria-pressed"), "false");
      h.clean();
      h.up(200);
      assert.deepEqual(h.commits, []);
    });
  }
}

test("a list disabled by an update cancels the drag and restores the order", (t) => {
  const h = setup(t);
  h.down("a");
  h.move(200);
  h.action.update({ ...h.options, disabled: () => true });
  assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
  assert.equal(
    h.announcements.at(-1),
    "Przywrócono kolejność listy kontrolnej.",
  );
  h.clean();
  h.up(200);
  assert.deepEqual(h.commits, []);
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
  test(`${reason} cancels a checklist drag and announces the restored order`, (t) => {
    const h = setup(t);
    h.down("a");
    h.move(200);
    h.frame();
    const cancel =
      reason === "Escape" || reason === "Tab"
        ? event("keydown", { key: reason })
        : reason === "second-pointer"
          ? event("pointerdown", { pointerId: 4, isPrimary: false })
          : event(reason);
    (reason === "lostpointercapture" ? h.list : h.window).dispatchEvent(cancel);
    h.clean();
    h.up(200);
    assert.deepEqual(h.commits, []);
    assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
    assert.deepEqual(h.announcements, [
      "Podniesiono pozycję listy kontrolnej 1.",
      "Przywrócono kolejność listy kontrolnej.",
    ]);
    assert.equal(h.handle("a").attributes.get("aria-pressed"), "false");
    if (reason === "Escape" || reason === "Tab")
      assert.equal(cancel.defaultPrevented, reason === "Escape");
  });
}

test("cancelling a press that never became a drag releases it silently", (t) => {
  const h = setup(t);
  h.down("a");
  h.window.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
  assert.deepEqual(h.announcements, []);
  assert.equal(h.handle("a").attributes.get("aria-pressed"), "false");
  h.move(200);
  h.up(200);
  assert.deepEqual(h.commits, []);
  h.clean();
});

test("the click synthesized after a drag is consumed once", (t) => {
  const h = setup(t);
  const click = () => {
    const result = event("click");
    h.list.dispatchEvent(result);
    return result.defaultPrevented;
  };
  h.down("a");
  h.up(140);
  assert.equal(click(), false);
  h.drag("a", 200);
  assert.equal(click(), true);
  assert.equal(click(), false);
});

test("a destroyed list removes its overlays, releases the row and stops listening", (t) => {
  const h = setup(t);
  h.down("a");
  h.move(200);
  h.action.destroy();
  assert.deepEqual(h.log, [["pickedUp", "a"], "released"]);
  assert.equal(h.handle("a").attributes.get("aria-pressed"), "false");
  h.clean();
  h.up(200);
  h.down("b");
  h.move(130);
  h.up(130);
  assert.deepEqual(h.commits, []);
  assert.equal(h.log.length, 2);
});
