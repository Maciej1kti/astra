/** Planning audit regression checks for an already authenticated fixture browser.
 * The fixture month must contain enough overlapping events to produce overflow.
 * Run after the implementation batch, alongside the existing gesture suite.
 */
import {
  setCalendarDate,
  expectCalendarDate,
  expectCalendarLayout,
  setCalendarLayout,
} from "../calendar-controls.mjs";
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
  const dateToggle = page.getByRole("button", {
    name: "Wybierz datę kalendarza",
    exact: true,
  });
  await dateToggle.click();
  await expect(page.getByLabel("Przejdź do daty")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Przejdź do daty")).toHaveCount(0);
  await expect(dateToggle).toBeFocused();
  await setCalendarDate(page, fixtureDate);
  await setCalendarLayout(page, "month");
  await expect(
    page.getByText("Ładowanie kalendarza…", { exact: true }),
  ).toHaveCount(0);

  const calendar = page.locator(".calendar-surface");
  await expect
    .poll(() =>
      calendar.evaluate((element) => {
        const grid = element.querySelector(".ec");
        return grid
          ? Math.abs(element.clientWidth - grid.getBoundingClientRect().width)
          : Infinity;
      }),
    )
    .toBeLessThanOrEqual(2);
  await expect
    .poll(async () =>
      calendar.evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(900);
  const more = calendar.getByRole("button", { name: /^\+\d+ więcej$/ }).first();
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
    .getByRole("button", { name: /zamknij/i })
    .click();
  await expect(calendar.getByRole("dialog")).toHaveCount(0);

  await setCalendarDate(page, "2026-10-13");
  await setCalendarLayout(page, "week");
  const sharedUrl = page.url();
  await page.reload();
  await expectCalendarDate(page, "2026-10-13");
  await expectCalendarLayout(page, "week");
  await expect(page).toHaveURL(sharedUrl);
  await page.getByRole("button", { name: "Następny okres kalendarza" }).click();
  await expectCalendarDate(page, "2026-10-20");
  await page.goBack();
  await expectCalendarDate(page, "2026-10-13");
  await expectCalendarLayout(page, "week");
  await page.goForward();
  await expectCalendarDate(page, "2026-10-20");
  await page.getByRole("button", { name: "Dzisiaj", exact: true }).click();
  await expectCalendarDate(page, workspaceToday);
  const todayCells = calendar.locator('[data-workspace-today="true"]');
  // Hourly views have a day cell in both the all-day and timed lanes.
  await expect(todayCells).toHaveCount(2);
  for (const cell of await todayCells.all())
    await expect(cell).toHaveAttribute("aria-current", "date");
  await onCheckpoint("desktop-calendar-workspace-today", page);

  await setCalendarDate(page, fixtureDate);
  await setCalendarLayout(page, "month");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Agenda miesiąca", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
  await expect(agendaEvents.first()).toHaveCSS("box-shadow", "none");
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
    .getByRole("button", { name: "Siatka miesiąca", exact: true })
    .click();
  await expect(calendar.locator(".ec-day-grid.ec-month-view")).toBeVisible();
  await expect
    .poll(async () =>
      calendar.evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(800);
  await onCheckpoint("mobile-390-calendar-grid", page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        calendar.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    const days = calendar.locator(".ec-header .ec-col-head");
    await expect(days).toHaveCount(7);
    for (const day of await days.all())
      await expect(day).toBeInViewport({ ratio: 1 });
    const overflow = calendar
      .getByRole("button", { name: /^\+\d+ więcej$/ })
      .first();
    await overflow.click();
    const popup = calendar.getByRole("dialog");
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const entry = popup.locator(".ec-event[role=button]").first();
    await entry.click({ trial: true });
    await popup.getByRole("button", { name: /zamknij/i }).click();
  }
  await page
    .getByRole("button", { name: "Agenda miesiąca", exact: true })
    .click();
  await setCalendarLayout(page, "week");
  await expect
    .poll(() =>
      calendar
        .locator(".ec-body .ec-day")
        .first()
        .evaluate((day) => day.getBoundingClientRect().width),
    )
    .toBeGreaterThanOrEqual(100);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await calendar.locator(".ec-main").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(
    calendar.locator(".ec-header .ec-col-head").last(),
  ).toBeInViewport({ ratio: 0.99 });
  await setCalendarLayout(page, "month");

  if (timelineUrl && timelineCardId && timelineCardTitle) {
    await page.goto(timelineUrl);
    const chart = page.locator(".astra-gantt");
    const scroller = chart.locator(".scroller");
    const bar = chart.locator(
      `.timeline-bar[data-card-id="${timelineCardId}"]`,
    );
    await expect(bar).toContainText(timelineCardTitle);
    // The selection bar is gone: a bar is the card, and the view has one toolbar.
    await expect(page.getByLabel("Wybrana karta")).toHaveCount(0);
    for (const name of ["Otwórz element", "Edytuj zaplanowane daty"])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    await expect(page.getByLabel("Miesiąc", { exact: true })).toHaveCount(0);
    // Cards waiting for dates stand above the axis.
    const tray = page.getByRole("region", { name: "Karty bez harmonogramu" });
    await expect(tray.getByRole("button").first()).toBeVisible();
    expect((await tray.boundingBox()).y).toBeLessThan(
      (await chart.boundingBox()).y,
    );
    // Saturdays and Sundays are marked on the day scale, and only they are.
    await expect(chart.locator('[data-day="2026-09-12"]')).toHaveClass(
      /weekend/,
    );
    await expect(chart.locator('[data-day="2026-09-13"]')).toHaveClass(
      /weekend/,
    );
    await expect(chart.locator('[data-day="2026-09-14"]')).not.toHaveClass(
      /weekend/,
    );
    // Titles stay where they are while the days scroll under them.
    const label = chart.locator(`[data-timeline-row="${timelineCardId}"]`);
    const initial = await label.boundingBox();
    const scrolled = await scroller.evaluate((element) => {
      element.scrollLeft += 400;
      return element.scrollLeft;
    });
    expect(scrolled).toBeGreaterThan(0);
    const shifted = await label.boundingBox();
    expect(shifted.x).toBe(initial.x);
    expect(shifted.width).toBe(initial.width);
    const page_ = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(page_.scroll).toBeLessThanOrEqual(page_.width);
    await onCheckpoint("mobile-390-timeline", page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(timelineUrl);
    await expect(bar).toBeVisible();
    await onCheckpoint("desktop-timeline", page);
    // A bar opens its card, not a dialog about dates.
    await bar.getByRole("button", { name: /^Karta: / }).click();
    const editor = page.getByRole("dialog", { name: "Edytuj element" });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel("Tytuł", { exact: true })).toHaveValue(
      timelineCardTitle,
    );
    await page
      .getByRole("button", { name: "Zamknij edytor", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    for (const [scale, tick] of [
      ["Tygodnie", "2026-09-07"],
      ["Miesiące", "2026-09-01"],
      ["Dni", "2026-09-07"],
    ]) {
      await page.getByRole("button", { name: scale, exact: true }).click();
      await expect(
        page.getByRole("button", { name: scale, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(chart.locator(`[data-day="${tick}"]`)).toBeVisible();
      await expect(bar).toBeVisible();
    }
  }

  return {
    calendarHeightBounded: true,
    overflowAccessible: true,
    routeReloadAndHistory: true,
    workspaceToday,
    mobileMonthAgenda: true,
    mobileMonthGridAvailable: true,
    mobileMonthFitsSevenDays: true,
    dateDisclosureKeyboard: true,
    readableMobileWeekColumns: true,
    timelineWithoutSelectionBar: Boolean(
      timelineUrl && timelineCardId && timelineCardTitle,
    ),
  };
}
