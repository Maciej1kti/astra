<script lang="ts">
  import type { CardComment } from "../../lib/contracts/api.generated";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";

  let {
    comments,
    body = $bindable(),
    disabled,
    saved,
    onadd,
  }: {
    comments: CardComment[];
    body: string;
    disabled: boolean;
    saved: boolean;
    onadd: () => void;
  } = $props();
</script>

<section class="card-comments" aria-label="Card comments">
  <h3>Comments <span>{comments.length}</span></h3>
  <textarea
    aria-label="Write a comment"
    bind:value={body}
    rows="3"
    maxlength="4000"
    placeholder="Write a comment…"
    {disabled}></textarea>
  <button
    type="button"
    class="primary"
    onclick={onadd}
    disabled={disabled || !saved || !body.trim() || comments.length >= 200}
    >Add comment</button
  >
  {#if comments.length >= 200}<p class="field-hint">
      This card has reached its 200-comment limit.
    </p>{/if}
  {#if comments.length}
    <ol class="comment-history" aria-label="Comment history">
      {#each comments as comment (comment.id)}
        <li data-comment-id={comment.id}>
          <div class="comment-heading">
            <strong>{comment.author.label}</strong>
            <span class="badge" class:bot={comment.author.kind === "agent"}>
              {comment.author.kind === "agent" ? "Bot" : "Human"}
            </span>
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
    margin-top: var(--space-10);
    padding-top: var(--space-8);
    border-top: var(--stroke) solid var(--line);
  }
  h3 {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-section);
  }
  h3 span,
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
    margin-top: var(--space-8);
    border-top: var(--stroke) solid var(--line);
  }
  li {
    border-bottom: var(--stroke) solid var(--line);
    padding: var(--space-7) 0;
    overflow-wrap: anywhere;
  }
  .comment-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--text-sm);
  }
  .bot {
    background: var(--accent);
    color: var(--accent-ink);
  }
  time {
    flex-basis: 100%;
  }
  textarea {
    margin-bottom: var(--space-5);
    resize: vertical;
  }
</style>
