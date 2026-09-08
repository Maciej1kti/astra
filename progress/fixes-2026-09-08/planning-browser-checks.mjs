/** Planning audit regression checks for an already authenticated fixture browser.
 * The fixture month must contain enough overlapping events to produce overflow.
 * Run after the implementation batch, alongside the existing gesture suite.
 */
import { expect } from "@playwright/test";

export async function verifyPlanningFixes(
  page,
  {
    calendarUrl,
    workspaceToday,
    fixtureDate = "2026-09-08",
    timelineUrl,
    timelineCardId,
    timelineCardTitle,
    onCheckpoint = async () => {},
  },
) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(calendarUrl);
  const date = page.getByLabel("Go to date");
  const layout = page.getByLabel("Calendar layout");
  await expect(date).toBeVisible();
  await date.fill(fixtureDate);
  await date.press("Tab");
  await layout.selectOption("month");
  await expect(
    page.getByText("Loading calendar…", { exact: true }),
  ).toHaveCount(0);

  const calendar = page.locator(".calendar-surface");
  await expect
    .poll(async () =>
      calendar.evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(900);
  const more = calendar.getByRole("button", { name: /^\+\d+ more$/ }).first();
  await expect(more).toBeVisible();
  await onCheckpoint("desktop-calendar-month", page);
  await more.focus();
  await more.press("Enter");
  await expect(calendar.getByRole("dialog")).toBeVisible();
  await expect(
    calendar.getByRole("dialog").locator("[data-calendar-item]").first(),
  ).toBeVisible();
  await onCheckpoint("desktop-calendar-overflow", page);
  await calendar
    .getByRole("dialog")
    .getByRole("button", { name: /close/i })
    .click();
  await expect(calendar.getByRole("dialog")).toHaveCount(0);

  await date.fill("2026-10-13");
  await date.press("Tab");
  await layout.selectOption("week");
  const sharedUrl = page.url();
  await page.reload();
  await expect(date).toHaveValue("2026-10-13");
  await expect(layout).toHaveValue("week");
  await expect(page).toHaveURL(sharedUrl);
  await page.getByRole("button", { name: "Next calendar period" }).click();
  await expect(date).toHaveValue("2026-10-20");
  await page.goBack();
  await expect(date).toHaveValue("2026-10-13");
  await expect(layout).toHaveValue("week");
  await page.goForward();
  await expect(date).toHaveValue("2026-10-20");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(date).toHaveValue(workspaceToday);
  await expect(
    calendar.locator('[data-workspace-today="true"]'),
  ).toHaveAttribute("aria-current", "date");
  await onCheckpoint("desktop-calendar-workspace-today", page);

  await date.fill(fixtureDate);
  await date.press("Tab");
  await layout.selectOption("month");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("Month agenda", { exact: true })).toBeVisible();
  await expect(calendar.locator(".ec-list.ec-month-view")).toBeVisible();
  await expect
    .poll(async () =>
      calendar.evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(750);
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  const agendaEvents = calendar.locator(".ec-event[role=button]");
  await expect(
    agendaEvents.first().locator(".calendar-item strong"),
  ).toBeInViewport();
  await agendaEvents.first().click({ trial: true });
  await calendar.locator(".ec-main").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await agendaEvents.last().scrollIntoViewIfNeeded();
  await expect(
    agendaEvents.last().locator(".calendar-item strong"),
  ).toBeInViewport();
  await agendaEvents.last().click({ trial: true });
  await calendar.locator(".ec-main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await onCheckpoint("mobile-390-calendar-agenda", page);
  await page
    .getByRole("button", { name: "Show month grid", exact: true })
    .click();
  await expect(calendar.locator(".ec-day-grid.ec-month-view")).toBeVisible();
  await expect
    .poll(async () =>
      calendar.evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(800);
  await onCheckpoint("mobile-390-calendar-grid", page);
  await page
    .getByRole("button", { name: "Show month agenda", exact: true })
    .click();

  if (timelineUrl && timelineCardId && timelineCardTitle) {
    await page.goto(timelineUrl);
    await page
      .getByLabel("Selected card", { exact: true })
      .selectOption(timelineCardId);
    const summary = page.locator(".selected-summary");
    await expect(summary).toContainText(timelineCardTitle);
    const initial = await summary.boundingBox();
    await page.locator(".chart").evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(summary).toContainText(timelineCardTitle);
    const shifted = await summary.boundingBox();
    expect(shifted.x).toBe(initial.x);
    expect(shifted.width).toBe(initial.width);
    await expect(
      page.getByRole("button", { name: "Open card", exact: true }),
    ).toBeEnabled();
    await onCheckpoint("mobile-390-timeline-selection", page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await onCheckpoint("desktop-timeline-selection", page);
  }

  return {
    calendarHeightBounded: true,
    overflowAccessible: true,
    routeReloadAndHistory: true,
    workspaceToday,
    mobileMonthAgenda: true,
    mobileMonthGridAvailable: true,
    timelineSelection: Boolean(
      timelineUrl && timelineCardId && timelineCardTitle,
    ),
  };
}
