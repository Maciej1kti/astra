<script lang="ts">
  import PeriodToolbar from "../../lib/ui/PeriodToolbar.svelte";
  import Segments from "../../lib/ui/Segments.svelte";
  import type { CalendarLayout } from "./planning-navigation";
  import { widgetDate } from "./widget-dates";

  let {
    date,
    mode,
    compact,
    monthGrid,
    navigate,
    today,
    changeDate,
    changeLayout,
    changeMonthGrid,
  }: {
    date: string;
    mode: CalendarLayout;
    compact: boolean;
    monthGrid: boolean;
    navigate: (delta: number) => void;
    today: () => void;
    changeDate: (input: HTMLInputElement) => void;
    changeLayout: (mode: CalendarLayout) => void;
    changeMonthGrid: (grid: boolean) => void;
  } = $props();
  const monthFormat = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  });
  const title = $derived(monthFormat.format(widgetDate(date)));
  const layouts: { value: CalendarLayout; label: string }[] = [
    { value: "day", label: "Dzień" },
    { value: "week", label: "Tydzień" },
    { value: "month", label: "Miesiąc" },
    { value: "agenda", label: "Agenda" },
  ];
</script>

<PeriodToolbar
  {title}
  {date}
  menuLabel="Wybierz datę kalendarza"
  previousLabel="Poprzedni okres kalendarza"
  nextLabel="Następny okres kalendarza"
  {navigate}
  {today}
  {changeDate}
>
  <Segments
    label="Układ kalendarza"
    options={layouts}
    value={mode}
    onselect={changeLayout}
  />
  {#if compact && mode === "month"}
    <Segments
      label="Widok miesiąca"
      options={[
        { value: "list", label: "Agenda miesiąca", icon: "list" },
        { value: "grid", label: "Siatka miesiąca", icon: "calendar" },
      ]}
      value={monthGrid ? "grid" : "list"}
      onselect={(value) => changeMonthGrid(value === "grid")}
    />
  {/if}
</PeriodToolbar>
