/** Content choreography stays inside visible cards and never owns their gestures. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function checkCardLayers({ page, config, cli, runtime, settle }) {
  const project = config.projects[2].id;
  const base = `/api/v1/projects/${project}/cards`;
  const file = join(runtime, "motion-card-command.json");
  const mutate = async (method, path, body, version) => {
    await writeFile(file, JSON.stringify(body));
    return cli(
      "command",
      method,
      path,
      "--json-file",
      file,
      ...(version ? ["--if-version", version] : []),
    ).result.resource;
  };
  let today;
  const projectPath = `/api/v1/projects/${project}`;
  await mutate(
    "PATCH",
    projectPath,
    { set: { folder: "Motion fixture" } },
    cli("get", projectPath).version,
  );
  const focusUrl = `${config.origin}/?view=focus&folder=Motion%20fixture`;
  for (const section of ["Pinned", "Motion", "Events"]) {
    let card = await mutate("POST", base, {
      title: `Soft ${section}`,
      status: "active",
      labels: ["soft", "layers"],
      ...(section === "Motion"
        ? { schedule: { start: today, end: today } }
        : {}),
      ...(section === "Events"
        ? { event: { start: `${today}T23:59`, duration_minutes: 60 } }
        : {}),
    });
    const path = `${base}/${card.metadata.id}`;
    card = await mutate(
      "PATCH",
      path,
      {
        configure_counter: {
          name: "Soft count",
          unit: "reps",
          step: 1,
          archived: false,
        },
      },
      card.version,
    );
    if (section === "Pinned") {
      card = await mutate(
        "PATCH",
        path,
        { set: { pinned: true } },
        card.version,
      );
      today = cli("focus", "get").cards.find(
        (item) => item.id === card.metadata.id,
      ).daily_counters[0].date;
      await mutate(
        "PATCH",
        path,
        { set: { schedule: { start: today, end: today } } },
        card.version,
      );
    }
  }
  const results = [];
  const inspect = async (card, expected, view) => {
    await expect(card).toBeVisible();
    await settle();
    const layers = await card.evaluate((node) =>
      window.motionProbe.animations
        .filter(
          (a) =>
            a.id.startsWith("astra-scene-card-") &&
            node.contains(a.effect?.target),
        )
        .map((a) => {
          const target = a.effect.target;
          const before = target.getBoundingClientRect();
          a.pause();
          a.currentTime = a.effect.getTiming().delay + 150;
          const during = target.getBoundingClientRect();
          a.finish();
          return {
            name: a.id.replace("astra-scene-card-", ""),
            delay: a.effect.getTiming().delay,
            moved: Math.max(
              ...["x", "y", "width", "height"].map((k) =>
                Math.abs(before[k] - during[k]),
              ),
            ),
          };
        }),
    );
    assert.deepEqual(
      layers.map((l) => l.name),
      expected,
      `${view}: all visible content roles must enter (${JSON.stringify({ bounds: await card.boundingBox(), viewport: page.viewportSize(), scenes: await page.evaluate(() => window.motionProbe.scenes) })})`,
    );
    assert(
      layers.every((l) => l.moved < 0.1),
      `${view}: inner effects must retain gesture geometry`,
    );
    assert(layers.every((l, i) => !i || l.delay > layers[i - 1].delay));
    const counts = await page.evaluate(() => ({
      cards: window.motionProbe.scenes.filter((a) =>
        a.id.startsWith("astra-scene-card-"),
      ).length,
      total: window.motionProbe.scenes.length,
      csp: window.motionProbe.csp,
    }));
    assert(counts.cards <= 72 && counts.total <= 96);
    assert.deepEqual(counts.csp, []);
    results.push({ view, layers });
  };
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto(focusUrl);
  for (const section of ["In focus", "In motion", "Events"]) {
    await inspect(
      page
        .getByRole("region", { name: section, exact: true })
        .locator(".focus-card")
        .first(),
      ["context", "title", "metadata", "labels", "counters"],
      section,
    );
  }
  const beforeWrite = await page.evaluate(
    () => window.motionProbe.scenes.length,
  );
  const pin = page
    .getByRole("region", { name: "In focus", exact: true })
    .locator(".focus-card")
    .first();
  await pin
    .getByRole("spinbutton", { name: "Soft count", exact: true })
    .click();
  const bar = page.getByRole("region", {
    name: "Edit focus counter",
    exact: true,
  });
  await bar.getByLabel("Soft count total", { exact: true }).fill("1");
  await bar.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    pin.getByRole("spinbutton", { name: "Soft count", exact: true }),
  ).toHaveAttribute("aria-valuenow", "1");
  await settle();
  assert.equal(
    await page.evaluate(() => window.motionProbe.scenes.length),
    beforeWrite,
    "Counter writes must not replay card content",
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await settle();
  assert.equal(
    await page.evaluate(() => window.motionProbe.scenes.length),
    beforeWrite,
    "Focus refresh must retain content",
  );
  for (const [view, query, selector, expected] of [
    [
      "List",
      `view=list&project=${project}`,
      ".listrow",
      ["context", "title", "metadata", "labels"],
    ],
    [
      "Projects",
      "view=projects",
      "[data-project-board-item]",
      ["title", "metadata"],
    ],
    [
      "Project board",
      `view=board&project=${project}`,
      "[data-board-card]",
      ["title", "metadata", "labels"],
    ],
    [
      "Workspace board",
      "view=board",
      ".resource-card",
      ["context", "title", "metadata", "labels"],
    ],
  ]) {
    await page.goto(`${config.origin}/?${query}`);
    await inspect(page.locator(selector).first(), expected, view);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(focusUrl);
  await inspect(
    page
      .getByRole("region", { name: "In focus", exact: true })
      .locator(".focus-card")
      .first(),
    ["context", "title", "metadata", "labels", "counters"],
    "Narrow Focus",
  );
  return {
    name: "Soft inner card layers across views; geometry and counter writes retained",
    results,
  };
}
