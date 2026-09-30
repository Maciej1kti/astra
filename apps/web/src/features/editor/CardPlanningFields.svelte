<script lang="ts">
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import type { CardFields } from "./editor-draft";

  let {
    fields = $bindable(),
    locked,
    timezone,
  }: {
    fields: CardFields;
    locked: boolean;
    timezone: string;
  } = $props();
</script>

<section class="card-schedule" aria-label="Schedule">
  <SectionHeading title="Schedule" level={3} />
  <div class="editor-properties card-properties">
    <label class="schedule-start">
      Start<input type="date" bind:value={fields.start} disabled={locked} />
    </label>
    {#if !fields.time}
      <label class="schedule-end">
        End<input
          type="date"
          bind:value={fields.end}
          min={fields.start}
          disabled={locked}
        />
      </label>
    {/if}
    <label class="schedule-time">
      Start time<input
        type="time"
        oninput={(event) => {
          if (!event.currentTarget.value) fields.end = fields.start;
        }}
        bind:value={fields.time}
        disabled={locked}
      />
    </label>
    {#if fields.time}
      <label class="schedule-duration">
        Duration (minutes)<input
          type="number"
          min="1"
          max="10080"
          step="1"
          bind:value={fields.duration}
          disabled={locked}
        />
      </label>
      <p class="field-hint">Event · {timezone}</p>
    {/if}
  </div>
</section>
