<script lang="ts">
  import Markdown from "../../lib/ui/Markdown.svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";

  let {
    type,
    body = $bindable(""),
    editing = $bindable(false),
    disabled = false,
    closeButton,
    onfinish,
  }: {
    type: "card" | "project";
    body: string;
    editing?: boolean;
    disabled?: boolean;
    closeButton?: HTMLButtonElement;
    onfinish: () => void;
  } = $props();

  let input = $state<HTMLTextAreaElement>();
  let pointerOutside = false;

  function beginEdit(event: Event) {
    const target = event.target;
    if (target instanceof Element && target.closest("a")) return;
    if (!disabled) editing = true;
  }
  function finishEdit() {
    editing = false;
    pointerOutside = false;
    onfinish();
  }
  function blur() {
    // Keep the clicked control in place until its click has been dispatched.
    if (!pointerOutside) finishEdit();
  }

  $effect(() => {
    if (!editing || !input) return;
    queueMicrotask(() => {
      if (!editing || !input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });
  $effect(() => {
    if (!editing) return;
    const outsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (input?.contains(target)) return;
      if (closeButton?.contains(target)) return;
      pointerOutside = true;
    };
    const finishPointer = () => {
      if (pointerOutside) finishEdit();
    };
    document.addEventListener("pointerdown", outsidePointer, true);
    document.addEventListener("click", finishPointer);
    document.addEventListener("pointercancel", finishPointer);
    return () => {
      document.removeEventListener("pointerdown", outsidePointer, true);
      document.removeEventListener("click", finishPointer);
      document.removeEventListener("pointercancel", finishPointer);
    };
  });
</script>

<section
  class="resource-description-field"
  aria-label={`${resourceLabel(type)} description`}
>
  {#if type === "card"}
    {#snippet formatHint()}
      <span class="description-format">Markdown supported</span>
    {/snippet}
    <SectionHeading
      title="Description"
      level={3}
      visuallyHidden
      actions={editing ? formatHint : undefined}
    />
  {:else}<div class="field-label">
      Description
      {#if editing}<span>Markdown supported</span>{/if}
    </div>{/if}
  {#if editing}
    <textarea
      bind:this={input}
      bind:value={body}
      rows="8"
      aria-label="Description"
      onblur={blur}
      {disabled}></textarea>
  {:else}
    <div
      class="resource-description-rendered"
      role="button"
      tabindex={disabled ? -1 : 0}
      aria-label={`Edit ${type} description`}
      aria-disabled={disabled}
      onclick={beginEdit}
      onkeydown={(event) => {
        if (event.target instanceof Element && event.target.closest("a"))
          return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          beginEdit(event);
        }
      }}
    >
      {#if body.trim()}<Markdown source={body} />{:else}<p
          class="empty-context"
        >
          Add a description…
        </p>{/if}
    </div>
  {/if}
</section>
