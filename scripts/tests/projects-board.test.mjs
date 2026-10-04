import test from "node:test";
import assert from "node:assert/strict";
import {
  canMoveProject,
  currentProjectSnapshot,
  projectState,
  visibleProjects,
} from "../../apps/web/src/features/workspace/screens/projects-board.ts";

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

test("Projects filters titles and folders while retaining archived and unavailable projects", () => {
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
    visibleProjects(projects, { folder: "Work", search: " PROJECT " }),
    [active, archived, unavailable],
  );
  assert.equal(visibleProjects(projects, { folder: "", search: "" }).length, 5);
  assert.deepEqual(
    visibleProjects(projects, { folder: "", search: "ARCHIVE" }),
    [archived],
  );
  assert.equal(
    visibleProjects(projects, { folder: "Work", search: "" })[0],
    active,
  );
});

test("Projects distinguishes all project states without assigning unknown sources a status", () => {
  for (const state of ["active", "paused", "archived"])
    assert.equal(projectState(project(state, state)), state);
  for (const state of [undefined, "", "planned", "invalid"])
    assert.equal(projectState(project("unknown", state)), null);
});

test("Only ready projects with an observed version and known status can move", () => {
  const observed = project("p", "paused");
  assert.equal(canMoveProject(observed), true);
  assert.equal(canMoveProject({ ...observed, availability: undefined }), true);
  for (const availability of ["stale", "invalid", "unavailable", "recovering"])
    assert.equal(canMoveProject({ ...observed, availability }), false);
  assert.equal(canMoveProject({ ...observed, version: "" }), false);
  assert.equal(canMoveProject({ ...observed, status: undefined }), false);
});

test("A status gesture cancels when its observed source changes or disappears", () => {
  const observed = project("p", "active");
  assert.equal(currentProjectSnapshot(observed, [{ ...observed }]), true);
  assert.equal(currentProjectSnapshot(observed, []), false);
  assert.equal(
    currentProjectSnapshot(observed, [{ ...observed, version: "new" }]),
    false,
  );
  assert.equal(
    currentProjectSnapshot(observed, [{ ...observed, status: "paused" }]),
    false,
  );
  assert.equal(
    currentProjectSnapshot(observed, [{ ...observed, availability: "stale" }]),
    false,
  );
  assert.equal(observed.version, "version-p");
  assert.equal(observed.status, "active");
});
