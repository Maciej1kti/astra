import test from "node:test";
import assert from "node:assert/strict";

const alex = "12345678-1234-4234-8234-123456789012";
const maria = "abcdef01-2345-4678-9abc-def012345678";
const invalid = [
  "",
  "alex",
  maria.toUpperCase(),
  ` ${alex}`,
  `${alex}0`,
  alex.slice(1),
  // Users are UUIDv4; a UUIDv7 or a non-RFC variant is not a user.
  "0199a000-0000-7000-8000-000000000001",
  "12345678-1234-4234-c234-123456789012",
];

class Storage {
  values = new Map();
  writes = [];
  broken = false;
  constructor(initial) {
    if (initial !== undefined) this.values.set("astra-user", initial);
  }
  check() {
    if (this.broken) throw new Error("SecurityError");
  }
  getItem(name) {
    this.check();
    return this.values.get(name) ?? null;
  }
  setItem(name, value) {
    this.check();
    this.writes.push(["set", name, value]);
    this.values.set(name, String(value));
  }
  removeItem(name) {
    this.check();
    this.writes.push(["remove", name]);
    this.values.delete(name);
  }
  get user() {
    return this.values.get("astra-user");
  }
}

let loads = 0;
/** Each load is one browser tab reading its storage once. */
async function tab(t, { session, browser, broken = [] } = {}) {
  const names = ["sessionStorage", "localStorage"];
  const originals = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const stores = [new Storage(session), new Storage(browser)];
  names.forEach((name, index) => {
    stores[index].broken = broken.includes(name);
    Object.defineProperty(globalThis, name, {
      value: stores[index],
      configurable: true,
      writable: true,
    });
  });
  t.after(() =>
    names.forEach((name, index) => {
      if (originals[index])
        Object.defineProperty(globalThis, name, originals[index]);
      else delete globalThis[name];
    }),
  );
  const load = () =>
    import(`../../apps/web/src/lib/api/user-selection.ts?tab=${++loads}`);
  return {
    module: await load(),
    reload: load,
    session: stores[0],
    browser: stores[1],
  };
}

test("a tab opens its own pinned user before the browser default", async (t) => {
  const { module } = await tab(t, { session: alex, browser: maria });
  assert.equal(module.selectedUserId(), alex);
});

test("a tab without its own selection opens the browser's remembered user", async (t) => {
  const { module } = await tab(t, { browser: maria });
  assert.equal(module.selectedUserId(), maria);
});

test("an explicit default-workspace tab ignores the browser's remembered user", async (t) => {
  const { module } = await tab(t, { session: "", browser: maria });
  assert.equal(module.selectedUserId(), "");
});

test("a corrupt tab selection falls back to the browser's remembered user", async (t) => {
  for (const session of invalid.filter(Boolean)) {
    const { module } = await tab(t, { session, browser: maria });
    assert.equal(module.selectedUserId(), maria, session);
  }
});

test("empty, corrupt or unreadable storage opens the default workspace", async (t) => {
  for (const options of [
    {},
    ...invalid.map((browser) => ({ browser })),
    { session: "nobody", browser: "nobody" },
    { browser: maria, broken: ["localStorage"] },
    {
      session: alex,
      browser: maria,
      broken: ["sessionStorage", "localStorage"],
    },
  ]) {
    const { module } = await tab(t, options);
    assert.equal(module.selectedUserId(), "", JSON.stringify(options));
  }
});

test("a loaded tab keeps its user until reloaded, whatever is remembered meanwhile", async (t) => {
  const { module, reload, session, browser } = await tab(t, { session: alex });
  module.rememberUser(maria);
  assert.equal(module.selectedUserId(), alex);
  assert.equal(session.user, maria);
  assert.equal(browser.user, maria);
  assert.equal((await reload()).selectedUserId(), maria);
  module.rememberDefaultUser();
  assert.equal(module.selectedUserId(), alex);
  assert.equal((await reload()).selectedUserId(), "");
  module.pinUserToTab(alex);
  assert.equal((await reload()).selectedUserId(), alex);
});

test("pinning a user is tab-local, ignores invalid ids and tolerates missing storage", async (t) => {
  const { module, session, browser } = await tab(t, { browser: maria });
  for (const id of invalid) module.pinUserToTab(id);
  assert.deepEqual(session.writes, []);
  module.pinUserToTab(alex);
  assert.deepEqual(session.writes, [["set", "astra-user", alex]]);
  assert.deepEqual(browser.writes, []);
  assert.equal(browser.user, maria);
  session.broken = true;
  assert.doesNotThrow(() => module.pinUserToTab(maria));
  assert.equal(session.user, alex);
});

test("remembering a user rejects invalid ids before touching storage", async (t) => {
  const { module, session, browser } = await tab(t, { session: alex });
  for (const id of invalid)
    assert.throws(() => module.rememberUser(id), {
      message: "Nieprawidłowy użytkownik.",
    });
  assert.deepEqual(session.writes, []);
  assert.deepEqual(browser.writes, []);
});

test("remembering a user needs tab storage but only prefers browser storage", async (t) => {
  const { module, session, browser } = await tab(t);
  browser.broken = true;
  assert.doesNotThrow(() => module.rememberUser(alex));
  assert.equal(session.user, alex);
  assert.equal(browser.user, undefined);
  browser.broken = false;
  session.broken = true;
  assert.throws(
    () => module.rememberUser(maria),
    /Pamięć przeglądarki jest niedostępna/,
  );
  assert.equal(session.user, alex);
  assert.deepEqual(browser.writes, []);
});

test("returning to the default workspace pins the tab and forgets the browser user", async (t) => {
  const { module, session, browser } = await tab(t, {
    session: alex,
    browser: alex,
  });
  module.rememberDefaultUser();
  assert.equal(session.user, "");
  assert.equal(browser.user, undefined);
  assert.deepEqual(browser.writes, [["remove", "astra-user"]]);
});

test("returning to the default workspace needs tab storage but tolerates browser storage loss", async (t) => {
  const { module, reload, session, browser } = await tab(t, {
    session: alex,
    browser: maria,
  });
  browser.broken = true;
  assert.doesNotThrow(() => module.rememberDefaultUser());
  assert.equal(session.user, "");
  browser.broken = false;
  assert.equal(browser.user, maria);
  assert.equal((await reload()).selectedUserId(), "");
  session.values.set("astra-user", alex);
  session.broken = true;
  assert.throws(
    () => module.rememberDefaultUser(),
    /Pamięć przeglądarki jest niedostępna/,
  );
  assert.equal(session.user, alex);
  assert.equal(browser.user, maria);
});
