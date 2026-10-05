<script>
  import { getContext } from "svelte";
  import {
    cloneDate,
    createEventTimeText,
    datesEqual,
    keyEnter,
    setMidnight,
    toEventWithLocalDates,
    toViewWithLocalDates,
  } from "astra-calendar-popup-native";
  import { calendarContentArgs } from "./calendar-layout.ts";
  import { calendarPopupEligible } from "./calendar-popup.ts";

  let { chunk, Fallback } = $props();
  const mainState = getContext("state");
  const viewState = getContext("view-state");
  let el = $state();
  const event = $derived(chunk.event);
  const eligible = $derived(
    calendarPopupEligible(
      event,
      chunk.resource,
      mainState.resources,
      mainState.options,
      mainState.snippets.eventContent,
    ),
  );
  const Resizer = $derived(mainState.interaction.resizer);
  const classes = $derived.by(() => {
    const theme = mainState.options.theme;
    const names = [theme.event];
    if (event.allDay) {
      if (!datesEqual(setMidnight(cloneDate(chunk.start)), event.start))
        names.push(theme.startClipped);
      const end1 = cloneDate(chunk.end);
      const end2 = cloneDate(event.end);
      end1.setUTCSeconds(end1.getUTCSeconds() - 1);
      end2.setUTCSeconds(end2.getUTCSeconds() - 1);
      if (!datesEqual(setMidnight(end1), setMidnight(end2)))
        names.push(theme.endClipped);
    } else {
      if (!datesEqual(chunk.start, event.start)) names.push(theme.startClipped);
      if (!datesEqual(chunk.end, event.end)) names.push(theme.endClipped);
    }
    return mainState.iClasses(names, event);
  });
  const margin = $derived(
    event._margin && event._margin[0] > 1 && event._margin[1] === chunk.gridRow
      ? event._margin[0]
      : 1,
  );
  const args = $derived(
    calendarContentArgs(
      toEventWithLocalDates(event),
      () =>
        createEventTimeText(
          chunk,
          mainState.options.displayEventEnd,
          mainState.intlEventTime,
        ),
      () => toViewWithLocalDates(mainState.view),
    ),
  );
  /** @param {MouseEvent | KeyboardEvent} jsEvent */
  function click(jsEvent) {
    mainState.options.eventClick({
      event: toEventWithLocalDates(event),
      el,
      jsEvent,
      view: toViewWithLocalDates(mainState.view),
    });
  }
  const onclick = $derived(
    typeof mainState.options.eventClick === "function" ? click : undefined,
  );
  const onkeydown = $derived(onclick && keyEnter(onclick));
  /** @param {PointerEvent} jsEvent */
  function drag(jsEvent) {
    mainState.interaction.action.drag(
      event,
      jsEvent,
      viewState.popupDay.dayStart,
      [1, chunk.gridRow],
      viewState.snap,
    );
  }
  const onpointerdown = $derived(
    mainState.interaction.action?.draggable(event)
      ? drag
      : mainState.interaction.action?.noAction,
  );
</script>

{#if eligible}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Matches the native event markup: the article takes the button role and focus only when the event can be opened.) -->
  <article
    bind:this={el}
    class={classes}
    style:background-color={event.backgroundColor}
    style:color={event.textColor}
    style:grid-column={`${chunk.gridColumn} / span ${chunk.dates.length}`}
    style:grid-row={chunk.gridRow}
    style:margin-block-start={`${margin}px`}
    role={onclick ? "button" : undefined}
    tabindex={onclick ? 0 : undefined}
    {onclick}
    {onkeydown}
    {onpointerdown}
  >
    {#snippet body()}
      <div class={mainState.options.theme.eventBody}>
        {@render mainState.snippets.eventContent(args)}
      </div>
    {/snippet}
    {#if Resizer}
      <Resizer
        {chunk}
        axis="x"
        forceDate={viewState.popupDay.dayStart}
        forceMargin={[1, chunk.gridRow]}
      >
        {@render body()}
      </Resizer>
    {:else}
      {@render body()}
    {/if}
  </article>
{:else}
  <Fallback {chunk} inPopup />
{/if}
