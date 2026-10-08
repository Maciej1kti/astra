<script lang="ts">
  import PeriodToolbar from "../../lib/ui/PeriodToolbar.svelte";
  import Segments from "../../lib/ui/Segments.svelte";
  import type { TimelineScale } from "./timeline-scale";

  let {
    month,
    title,
    scale,
    today,
    navigate,
    showToday,
    showDate,
    changeScale,
  }: {
    /** The month in view, which the date field opens on. */
    month: string;
    title: string;
    scale: TimelineScale;
    today: string;
    navigate: (delta: number) => void;
    showToday: () => void;
    showDate: (date: string) => void;
    changeScale: (scale: TimelineScale) => void;
  } = $props();
  const scales: { value: TimelineScale; label: string }[] = [
    { value: "days", label: "Dni" },
    { value: "weeks", label: "Tygodnie" },
    { value: "months", label: "Miesiące" },
  ];
</script>

<PeriodToolbar
  {title}
  date={today.startsWith(month) ? today : `${month}-01`}
  menuLabel="Wybierz datę na osi czasu"
  previousLabel="Poprzedni miesiąc"
  nextLabel="Następny miesiąc"
  {navigate}
  today={showToday}
  changeDate={(input) => showDate(input.value)}
>
  <Segments
    label="Skala osi czasu"
    options={scales}
    value={scale}
    onselect={changeScale}
  />
</PeriodToolbar>
