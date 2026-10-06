/** The Chart view arrives in layers and its marks rise without moving the plot. */
import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function checkChartLayers({ page, config, settle }) {
  // The card-layer scenario left counters with a recorded value in this project.
  const project = config.projects[2].id;
  const dashboard = page.getByRole("region", {
    name: "Panel liczników",
    exact: true,
  });
  const marks = dashboard.locator(".plot-marks");
  const layers = (selector) =>
    page.evaluate(
      (selector) =>
        window.motionProbe.animations.filter(
          (animation) =>
            animation.id.startsWith("astra-layer-") &&
            animation.effect?.target?.matches?.(selector),
        ).length,
      selector,
    );
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${config.origin}/?view=chart&project=${project}`);
  const options = dashboard.locator(".counter-option input");
  await expect(options.first()).toBeVisible();
  for (let index = 0; index < (await options.count()); index++)
    await options.nth(index).check();
  await expect(marks).toHaveCount(1);
  // The selection is stored in this browser; reload to observe a full arrival.
  await page.reload();
  await expect(marks).toHaveCount(1);
  await settle();
  const arrived = {};
  for (const selector of [
    ".chart-options > *",
    ".counter-picker",
    ".counter-option",
    ".chart-panel",
    ".plot-heading",
    ".plot-legend > li",
    ".plot-marks",
  ]) {
    arrived[selector] = await layers(selector);
    assert(arrived[selector] > 0, `Chart: ${selector} must enter as a layer`);
  }
  const rise = await page.evaluate(() => {
    const animation = window.motionProbe.animations.findLast((animation) =>
      animation.effect?.target?.matches?.(".plot-marks"),
    );
    const target = animation.effect.target;
    const panel = target.closest(".chart-panel").getBoundingClientRect();
    animation.pause();
    animation.currentTime = animation.effect.getTiming().delay + 1;
    const start = target.getBoundingClientRect();
    const during = target.closest(".chart-panel").getBoundingClientRect();
    animation.finish();
    const settled = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      shorter: settled.height - start.height,
      baseline: Math.abs(settled.bottom - start.bottom),
      panelMoved: Math.max(
        ...["x", "y", "width", "height"].map((key) =>
          Math.abs(panel[key] - during[key]),
        ),
      ),
      opacity: style.opacity,
      scale: style.scale,
      filter: style.filter,
    };
  });
  assert(rise.shorter > 0.5, `Marks start lower: ${JSON.stringify(rise)}`);
  assert(
    rise.baseline < 0.5,
    `Marks keep their baseline: ${JSON.stringify(rise)}`,
  );
  assert(rise.panelMoved < 0.1, "The plot surface keeps its geometry");
  assert.deepEqual(
    [rise.opacity, rise.scale, rise.filter],
    ["1", "none", "none"],
    "Nothing remains on settled marks",
  );

  await page.getByRole("button", { name: "Odśwież", exact: true }).click();
  await expect(dashboard.locator('[aria-busy="true"]')).toHaveCount(0);
  await settle();
  assert.equal(
    await layers(".chart-panel"),
    arrived[".chart-panel"],
    "A refresh must not replay the chart surfaces",
  );
  assert.equal(
    await layers(".plot-marks"),
    arrived[".plot-marks"],
    "A refresh must not replay the marks",
  );

  await dashboard
    .getByRole("button", { name: "Tygodnie", exact: true })
    .click();
  await settle();
  assert.equal(
    await layers(".plot-marks"),
    arrived[".plot-marks"] + 1,
    "Changing what is plotted lets the marks rise again",
  );
  assert.equal(
    await layers(".chart-panel"),
    arrived[".chart-panel"],
    "Changing the grouping must not replay the surfaces",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await dashboard.getByRole("button", { name: "Dni", exact: true }).click();
  await expect(marks).toHaveCount(1);
  await settle();
  assert.equal(
    await layers(".plot-marks"),
    arrived[".plot-marks"] + 1,
    "Reduced motion starts no chart effect",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  return {
    name: "Chart controls, counter list, plot surfaces and rising marks; refresh retained",
    arrived,
    rise,
  };
}
