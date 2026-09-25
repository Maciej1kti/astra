<script lang="ts">
  import { tick } from "svelte";

  let {
    value = $bindable(""),
    label = "Title",
    placeholder = "Untitled",
    maxlength = 240,
    disabled = false,
    focus = false,
    onfinish,
  }: {
    value: string;
    label?: string;
    placeholder?: string;
    maxlength?: number;
    disabled?: boolean;
    focus?: boolean;
    onfinish?: () => void;
  } = $props();
  let input: HTMLTextAreaElement;
  function size(node: HTMLTextAreaElement, _value: string) {
    const resize = () => {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    if (focus) void tick().then(() => node.focus());
    return { update: resize, destroy: () => observer.disconnect() };
  }
</script>

<h2 class="editable-title" aria-label={value || placeholder}>
  <textarea
    bind:this={input}
    bind:value
    use:size={value}
    aria-label={label}
    title={`Click to edit ${label.toLowerCase()}`}
    {placeholder}
    {maxlength}
    {disabled}
    required
    rows="1"
    oninput={(event) => {
      event.currentTarget.value = event.currentTarget.value.replace(
        /\r?\n|\r/g,
        " ",
      );
    }}
    onblur={onfinish}
    onkeydown={(event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        input.blur();
      }
    }}></textarea>
</h2>
