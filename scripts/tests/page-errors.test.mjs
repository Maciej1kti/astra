import assert from "node:assert/strict";
import test from "node:test";
import { navigationCancelledRead } from "../browser/page-errors.mjs";

test("WebKit's report of a read cancelled by navigation is not a page failure", () => {
  // Playwright turns WebKit's console line into an error split at its first colon.
  assert.equal(
    navigationCancelledRead({
      name: "Fetch API cannot load https",
      message:
        "/localhost:49739/api/v1/views/focus-cards?section=events&limit=200 due to access control checks.",
    }),
    true,
  );
});

test("the same report for the event stream is not a page failure either", () => {
  assert.equal(
    navigationCancelledRead({
      name: "EventSource cannot load https",
      message:
        "/localhost:49739/api/v1/events?cursor=a%3A1 due to access control checks.",
    }),
    true,
  );
});

test("script failures and other load errors still count", () => {
  for (const error of [
    new TypeError("undefined is not an object"),
    {
      name: "Error",
      message: "Something failed due to access control checks.",
    },
    {
      name: "Fetch API cannot load https",
      message: "/localhost:1/x timed out.",
    },
    {
      name: "Refused to connect to https",
      message:
        "/example.test/ because it does not appear in the connect-src directive.",
    },
  ])
    assert.equal(navigationCancelledRead(error), false, error.message);
});
