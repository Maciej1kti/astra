import test from "node:test";
import assert from "node:assert/strict";
import {
  repositoryLink,
  repositoryStatus,
} from "../../apps/web/src/lib/api/repository.ts";

const state = (name, url = null, error = null) => ({ state: name, url, error });

test("only an HTTPS remote becomes a link, without its .git suffix", () => {
  assert.equal(
    repositoryLink(state("published", "https://github.com/octo/astra.git")),
    "https://github.com/octo/astra",
  );
  for (const url of [
    null,
    "file:///srv/remotes/octo/astra.git",
    "javascript:alert(1)",
    "http://github.com/octo/astra.git",
  ])
    assert.equal(repositoryLink(state("published", url)), "", String(url));
  assert.equal(repositoryLink(null), "");
});

test("every repository state has its own Polish description", () => {
  const texts = ["absent", "unpushed", "publishing", "published", "failed"].map(
    (name) => repositoryStatus(state(name)),
  );
  assert.equal(new Set(texts).size, 5);
  for (const text of texts) assert.match(text, /\.$|…$/);
});
