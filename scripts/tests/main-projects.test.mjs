import test from "node:test";
import assert from "node:assert/strict";
import {
  canMoveMainProject,
  currentMainProjectSnapshot,
  mainProjectState,
  visibleMainProjects,
} from "../../apps/web/src/features/workspace/screens/main-projects.ts";

const project = (id, status, extra = {}) => ({
  type: "project",
  project_id: id,
  id,
  title: `Project ${id}`,
  version: `version-${id}`,
  availability: "ready",
  status,
  ...extra,
});

test("Main filters titles and folders while retaining archived and unavailable projects", () => {
  const active = project("active", "active", { folder: "Work" });
  const archived = project("archived", "archived", { folder: "Work" });
  const unavailable = project("unavailable", undefined, {
    folder: "Work",
    availability: "unavailable",
  });
  const home = project("home", "paused", { folder: "Home" });
  const unassigned = project("unassigned", "active");
  const projects = [active, archived, unavailable, home, unassigned];

  assert.deepEqual(
    visibleMainProjects(projects, { folder: "Work", search: " PROJECT " }),
    [active, archived, unavailable],
  );
  assert.equal(
    visibleMainProjects(projects, { folder: "", search: "" }).length,
    5,
  );
  assert.deepEqual(
    visibleMainProjects(projects, { folder: "", search: "ARCHIVE" }),
    [archived],
  );
  assert.equal(
    visibleMainProjects(projects, { folder: "Work", search: "" })[0],
    active,
  );
});

test("Main distinguishes all project states without assigning unknown sources a status", () => {
  for (const state of ["active", "paused", "archived"])
    assert.equal(mainProjectState(project(state, state)), state);
  for (const state of [undefined, "", "planned", "invalid"])
    assert.equal(mainProjectState(project("unknown", state)), null);
});

test("Only ready projects with an observed version and known status can move", () => {
  const observed = project("p", "paused");
  assert.equal(canMoveMainProject(observed), true);
  assert.equal(
    canMoveMainProject({ ...observed, availability: undefined }),
    true,
  );
  for (const availability of ["stale", "invalid", "unavailable", "recovering"])
    assert.equal(canMoveMainProject({ ...observed, availability }), false);
  assert.equal(canMoveMainProject({ ...observed, version: "" }), false);
  assert.equal(canMoveMainProject({ ...observed, status: undefined }), false);
});

test("A status gesture cancels when its observed source changes or disappears", () => {
  const observed = project("p", "active");
  assert.equal(currentMainProjectSnapshot(observed, [{ ...observed }]), true);
  assert.equal(currentMainProjectSnapshot(observed, []), false);
  assert.equal(
    currentMainProjectSnapshot(observed, [{ ...observed, version: "new" }]),
    false,
  );
  assert.equal(
    currentMainProjectSnapshot(observed, [{ ...observed, status: "paused" }]),
    false,
  );
  assert.equal(
    currentMainProjectSnapshot(observed, [
      { ...observed, availability: "stale" },
    ]),
    false,
  );
  assert.equal(observed.version, "version-p");
  assert.equal(observed.status, "active");
});
