<script lang="ts">
  import type { CardComment } from "../../lib/contracts/api.generated";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import SectionHeading from "../../lib/ui/SectionHeading.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";

  let {
    comments,
    body = $bindable(),
    disabled,
    saved,
    goal = false,
    onadd,
  }: {
    comments: CardComment[];
    body: string;
    disabled: boolean;
    saved: boolean;
    /** The conversation of a goal; a card's is the default. */
    goal?: boolean;
    onadd: () => void;
  } = $props();
</script>

<section
  class="card-comments"
  aria-label={goal ? "Komentarze celu" : "Komentarze karty"}
>
  <SectionHeading
    title="Komentarze"
    level={3}
    count={comments.length}
    visuallyHidden
  />
  <div class="comment-composer">
    <textarea
      aria-label="Napisz komentarz"
      bind:value={body}
      rows="3"
      maxlength="4000"
      placeholder="Napisz komentarz…"
      {disabled}></textarea>
    <div class="comment-composer-actions">
      <Button
        type="button"
        variant="primary"
        onclick={onadd}
        disabled={disabled || !saved || !body.trim() || comments.length >= 200}
        >Dodaj komentarz</Button
      >
    </div>
  </div>
  {#if comments.length >= 200}<p class="field-hint">
      Osiągnięto limit 200 komentarzy {goal ? "tego celu" : "na tej karcie"}.
    </p>{/if}
  {#if comments.length}
    <ol class="comment-history" aria-label="Historia komentarzy">
      {#each comments as comment (comment.id)}
        <li data-comment-id={comment.id}>
          <div class="comment-heading">
            <strong>{comment.author.label}</strong>
            <Badge class={comment.author.kind === "agent" ? "bot" : undefined}>
              {comment.author.kind === "agent" ? "Bot" : "Człowiek"}
            </Badge>
            <time datetime={comment.recorded_at}
              >{formatTimestamp(comment.recorded_at)}</time
            >
          </div>
          <Markdown source={comment.body} />
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .card-comments {
    min-width: 0;
    border-top: var(--stroke) solid var(--line);
  }
  time {
    color: var(--muted);
    font-weight: var(--weight-normal);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .comment-history {
    margin-top: var(--space-10);
  }
  li {
    border-bottom: var(--stroke) solid var(--line);
    padding: var(--space-8) 0;
    overflow-wrap: anywhere;
  }
  .comment-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--text-sm);
  }
  .comment-heading :global(.bot) {
    background: var(--accent);
    color: var(--accent-ink);
  }
  time {
    margin-left: auto;
    font-size: var(--text-sm);
  }
  .comment-composer {
    border: var(--stroke) solid var(--line-strong);
    border-radius: var(--radius-control);
    background: var(--paper);
    overflow: hidden;
  }
  .comment-composer:focus-within {
    outline: var(--focus-width) solid var(--accent-ink);
    outline-offset: var(--focus-offset);
  }
  .comment-composer textarea {
    display: block;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    outline: none;
  }
  .comment-composer-actions {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-4);
  }
  @media (max-width: 520px) {
    time {
      flex-basis: 100%;
      margin-left: 0;
    }
  }
</style>
