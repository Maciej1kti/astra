import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

// The widget's host parser is a plain script shared with QML, so load it the
// way the shell does instead of importing it as a module.
const hosts = {};
vm.runInNewContext(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../integrations/omarchy/astra.focus/hosts.js",
    ),
    "utf8",
  ),
  hosts,
);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("a bare address gets the manual host port", () => {
  assert.deepEqual(plain(hosts.parseHosts("100.64.0.7")), [
    { name: "100.64.0.7", host: "100.64.0.7", url: "https://100.64.0.7:47832" },
  ]);
});

test("explicit ports, origins and names are kept", () => {
  assert.deepEqual(
    plain(
      hosts.parseHosts(
        "mini=100.64.0.7:9443, https://astra.example.ts.net/\nHTTPS://Other.Example:443",
      ),
    ),
    [
      { name: "mini", host: "100.64.0.7", url: "https://100.64.0.7:9443" },
      {
        name: "astra.example.ts.net",
        host: "astra.example.ts.net",
        url: "https://astra.example.ts.net",
      },
      {
        name: "other.example",
        host: "other.example",
        url: "https://other.example",
      },
    ],
  );
});

test("unsafe or malformed entries are dropped", () => {
  for (const entry of [
    "http://100.64.0.7",
    "https://host/path",
    "https://user@host",
    "host:0",
    "host:70000",
    "-host",
    "bad/name=host",
    "$(reboot)",
    "host;rm",
  ])
    assert.deepEqual(plain(hosts.parseHosts(entry)), [], entry);
});

test("a repeated origin yields one row", () => {
  assert.equal(
    hosts.parseHosts("100.64.0.7 mini=https://100.64.0.7:47832").length,
    1,
  );
});

test("the stored form parses back to the same hosts", () => {
  const parsed = hosts.parseHosts("mini=100.64.0.7, astra.example.ts.net:443");
  assert.equal(
    hosts.formatHosts(parsed),
    "mini=https://100.64.0.7:47832, https://astra.example.ts.net",
  );
  assert.deepEqual(
    plain(hosts.parseHosts(hosts.formatHosts(parsed))),
    plain(parsed),
  );
});

test("the selection falls back to the first host", () => {
  const parsed = hosts.parseHosts("a.example b.example");
  assert.equal(hosts.activeIndex(parsed, "https://b.example:47832"), 1);
  assert.equal(hosts.activeIndex(parsed, "https://gone.example"), 0);
  assert.equal(hosts.activeIndex([], ""), -1);
});
