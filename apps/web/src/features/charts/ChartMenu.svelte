<script lang="ts" generics="Value extends string | number">
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    label,
    options,
    value,
    text,
    onselect,
  }: {
    label: string;
    options: { value: Value; label: string }[];
    value: Value;
    /** A shorter name for the current choice on the closed control. */
    text?: string;
    onselect: (value: Value) => void;
  } = $props();

  const current = $derived(
    text ?? options.find((option) => option.value === value)?.label ?? "",
  );
</script>

<!-- The phone form of Segments: one choice shown, the rest in a menu. -->
<div class="chart-menu">
  <ActionMenu
    label={`${label}: ${current}`}
    text={current}
    icon="chevronDown"
    align="start"
  >
    {#snippet children(close)}
      {#each options as option (option.value)}
        <button
          type="button"
          class="quiet"
          aria-pressed={option.value === value}
          onclick={() => {
            onselect(option.value);
            close();
          }}
          ><span>{option.label}</span>{#if option.value === value}<Icon
              name="check"
              small
            />{/if}</button
        >
      {/each}
    {/snippet}
  </ActionMenu>
</div>

<style>
  .chart-menu {
    flex: 1 1 auto;
    min-width: 0;
  }
  .chart-menu :global(.action-menu > button) {
    flex-direction: row-reverse;
    justify-content: space-between;
    width: 100%;
    min-height: var(--tap-target);
    padding-inline: var(--space-5) var(--space-3);
    border-color: var(--line);
    background: var(--paper);
    font-weight: var(--weight-medium);
  }
  .chart-menu :global(.action-menu > button > span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chart-menu :global(.action-menu-panel button) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    font-size: var(--text-base);
  }
  .chart-menu :global(.action-menu-panel button[aria-pressed="true"]) {
    font-weight: var(--weight-semibold);
  }
  @container chart (max-width: 330px) {
    .chart-menu :global(.action-menu > button) {
      gap: var(--space-2);
      padding-inline: var(--space-4) var(--space-2);
      font-size: var(--text-sm);
    }
  }
</style>
