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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- editing can end before this microtask runs
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
  aria-label={`${resourceLabel(type)} — opis`}
>
  {#if type === "card"}
    {#snippet formatHint()}
      <span class="description-format">Obsługuje Markdown</span>
    {/snippet}
    <SectionHeading
      title="Opis"
      level={3}
      visuallyHidden
      actions={editing ? formatHint : undefined}
    />
  {:else}<div class="field-label">
      Opis
      {#if editing}<span>Obsługuje Markdown</span>{/if}
    </div>{/if}
  {#if editing}
    <textarea
      bind:this={input}
      bind:value={body}
      rows="8"
      aria-label="Opis"
      onblur={blur}
      {disabled}></textarea>
  {:else}
    <div class="resource-description-view">
      <!-- The text is ordinary content, so its links and wording reach assistive
           technology. Clicking it is only a pointer shortcut for the labelled
           button below, which is the keyboard and screen-reader control. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Pointer shortcut only; the button below is the control.) -->
      <div class="resource-description-rendered" onclick={beginEdit}>
        {#if body.trim()}<Markdown source={body} />{:else}<p
            class="empty-context"
          >
            Dodaj opis…
          </p>{/if}
      </div>
      <button
        type="button"
        class="description-edit"
        aria-label={`Edytuj opis: ${resourceLabel(type)}`}
        {disabled}
        onclick={() => (editing = true)}>Edytuj opis</button
      >
    </div>
  {/if}
</section>
