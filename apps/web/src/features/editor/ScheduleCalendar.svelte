<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { modal, layerExit } from "../../lib/ui/dialog";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import {
    calendarCells,
    calendarLabel,
    calendarMonth,
    calendarRange,
    calendarShift,
    validCalendarDate,
  } from "../../lib/ui/calendar-dates";
  let {
    start,
    end,
    today,
    weekStart,
    single,
    locked,
    onapply,
    onclose,
  }: {
    start: string;
    end: string;
    today: string;
    weekStart: string;
    single: boolean;
    locked: boolean;
    onapply: (range: { start: string; end: string }) => void;
    onclose: () => void;
  } = $props();
  let selection = $state(
    untrack(() => ({
      start: validCalendarDate(start) ? start : "",
      end: validCalendarDate(end) ? end : "",
    })),
  );
  let cursor = $state(
    untrack(() => (validCalendarDate(start) ? start : today)),
  );
  let month = $state(untrack(() => cursor.slice(0, 7)));
  let target = $state<"start" | "end">("start");
  let hover = $state("");
  let element: HTMLDialogElement;
  const cells = $derived(calendarCells(`${month}-01`, weekStart));
  const weekdays = $derived(
    weekStart === "sunday"
      ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
      : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  );
  const monthLabel = $derived(
    new Intl.DateTimeFormat("en", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }).format(new Date(`${month}-01T12:00:00Z`)),
  );
  const preview = $derived(
    hover && target === "end" && !single
      ? calendarRange(selection.start, selection.end, hover, target, false)
      : selection,
  );
  const length = $derived(
    selection.start && selection.end
      ? Math.round(
          (Date.parse(`${selection.end}T12:00Z`) -
            Date.parse(`${selection.start}T12:00Z`)) /
            86400000,
        ) + 1
      : 0,
  );
  const valid = $derived(
    (!selection.start && !selection.end) ||
      (validCalendarDate(selection.start) &&
        validCalendarDate(selection.end) &&
        selection.start <= selection.end),
  );
  const id = $props.id();
  onMount(() => {
    void focusDay(cursor);
  });
  function choose(day: string) {
    selection = calendarRange(
      selection.start,
      selection.end,
      day,
      target,
      single,
    );
    void focusDay(day);
    if (!single) target = target === "start" ? "end" : "start";
    hover = "";
  }
  async function focusDay(day: string | null) {
    if (!day) return;
    cursor = day;
    month = day.slice(0, 7);
    await tick();
    element
      .querySelector<HTMLButtonElement>(`[data-calendar-day="${day}"]`)
      ?.focus();
  }
  function key(event: KeyboardEvent, day: string) {
    let next: string | null = null;
    const offset = (
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
        string,
        number
      >
    )[event.key];
    if (offset) next = calendarShift(day, offset);
    else if (event.key === "PageUp" || event.key === "PageDown")
      next = calendarMonth(
        day,
        (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
      );
    else if (event.key === "Home" || event.key === "End") {
      const index = cells.indexOf(day) % 7;
      next = calendarShift(day, event.key === "Home" ? -index : 6 - index);
    } else return;
    event.preventDefault();
    event.stopPropagation();
    void focusDay(next);
  }
  function moveMonth(amount: number) {
    const next = calendarMonth(`${month}-01`, amount);
    if (next) {
      month = next.slice(0, 7);
      cursor = next;
      hover = "";
    }
  }
</script>

<dialog
  bind:this={element}
  class="app-dialog schedule-calendar-dialog"
  use:modal
  out:layerExit|global
  aria-label="Choose card dates"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
>
  <DialogHeader
    title={single ? "Event date" : "Plan your card"}
    closeLabel="Close calendar"
    {onclose}
  />
  <div class="dialog-body schedule-calendar-body">
    <div class="calendar-range-fields" class:single>
      <Button
        type="button"
        variant="quiet"
        class={target === "start" ? "selected" : ""}
        aria-pressed={target === "start"}
        onclick={() => {
          target = "start";
          if (selection.start) {
            month = selection.start.slice(0, 7);
            cursor = selection.start;
          }
        }}
      >
        <small>{single ? "Date" : "Start"}</small><strong
          >{selection.start
            ? calendarLabel(selection.start)
            : "Choose a date"}</strong
        >
      </Button>
      {#if !single}<Button
          type="button"
          variant="quiet"
          class={target === "end" ? "selected" : ""}
          aria-pressed={target === "end"}
          onclick={() => {
            target = "end";
            if (selection.end) {
              month = selection.end.slice(0, 7);
              cursor = selection.end;
            }
          }}
        >
          <small>End</small><strong
            >{selection.end
              ? calendarLabel(selection.end)
              : "Choose a date"}</strong
          >
        </Button>{/if}
    </div>
    <div class="calendar-month-heading">
      <Button
        type="button"
        variant="quiet"
        class="calendar-prev"
        aria-label="Previous month"
        disabled={month === "0001-01"}
        onclick={() => moveMonth(-1)}><Icon name="arrow" small /></Button
      >
      <strong id={`${id}-month`} aria-live="polite">{monthLabel}</strong>
      <Button
        type="button"
        variant="quiet"
        aria-label="Next month"
        disabled={month === "9999-12"}
        onclick={() => moveMonth(1)}><Icon name="arrow" small /></Button
      >
    </div>
    <p class="sr" id={`${id}-help`}>
      Use arrow keys for days, Home and End for the week, Page Up and Page Down
      for months. Hold Shift for years. Press Enter to select.
    </p>
    {#key month}<table
        class="schedule-calendar-grid"
        role="grid"
        aria-labelledby={`${id}-month`}
        aria-describedby={`${id}-help`}
        aria-multiselectable={!single}
      >
        <thead
          ><tr
            >{#each weekdays as day}<th scope="col">{day}</th>{/each}</tr
          ></thead
        >
        <tbody>
          {#each [0, 1, 2, 3, 4, 5] as week}<tr>
              {#each cells.slice(week * 7, week * 7 + 7) as day}
                <td
                  class:in-range={day &&
                    !!preview.start &&
                    !!preview.end &&
                    day >= preview.start &&
                    day <= preview.end}
                  class:range-start={day === preview.start}
                  class:range-end={day === preview.end}
                  aria-selected={!!day &&
                    !!selection.start &&
                    !!selection.end &&
                    day >= selection.start &&
                    day <= selection.end}
                >
                  {#if day}<button
                      type="button"
                      data-calendar-day={day}
                      class:outside={day.slice(0, 7) !== month}
                      class:endpoint={day === selection.start ||
                        day === selection.end}
                      class:today={day === today}
                      aria-label={calendarLabel(day, true)}
                      aria-current={day === today ? "date" : undefined}
                      tabindex={day === cursor ? 0 : -1}
                      disabled={locked}
                      onpointerenter={(event) => {
                        if (event.pointerType === "mouse") hover = day;
                      }}
                      onpointerleave={() => {
                        hover = "";
                      }}
                      onfocus={() => {
                        cursor = day;
                      }}
                      onkeydown={(event) => key(event, day)}
                      onclick={() => choose(day)}
                      >{Number(day.slice(-2))}</button
                    >{/if}
                </td>
              {/each}
            </tr>{/each}
        </tbody>
      </table>{/key}
    <div class="calendar-shortcuts">
      <Button
        type="button"
        variant="quiet"
        onclick={() => {
          selection = { start: today, end: today };
          cursor = today;
          month = today.slice(0, 7);
          target = single ? "start" : "end";
        }}>Today</Button
      >
      <span aria-live="polite"
        >{single
          ? "Choose the event day"
          : target === "end"
            ? "Choose an end date"
            : length
              ? `${length} ${length === 1 ? "day" : "days"} planned`
              : "Choose a start date"}</span
      >
      <Button
        type="button"
        variant="quiet"
        onclick={() => {
          selection = { start: "", end: "" };
          target = "start";
        }}>Clear</Button
      >
    </div>
  </div>
  <footer class="dialog-footer">
    <Button type="button" variant="quiet" onclick={onclose}>Cancel</Button
    ><Button
      type="button"
      variant="primary"
      disabled={locked || !valid}
      onclick={() => onapply(selection)}
      >{selection.start ? "Apply dates" : "Remove schedule"}</Button
    >
  </footer>
</dialog>
