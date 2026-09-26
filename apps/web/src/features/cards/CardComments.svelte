<script lang="ts">
  import type { CardComment } from "../../lib/contracts/api.generated";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import { formatTimestamp } from "../../lib/resources/resource-presentation";

  let {
    comments,
    body = $bindable(),
    author = $bindable(),
    authorKind = $bindable(),
    disabled,
    saved,
    onadd,
  }: {
    comments: CardComment[];
    body: string;
    author: string;
    authorKind: "human" | "agent";
    disabled: boolean;
    saved: boolean;
    onadd: () => void;
  } = $props();
</script>

<section class="card-comments" aria-label="Card comments">
  <h3>Comments <span>{comments.length}</span></h3>
  {#if comments.length}
    <ol aria-label="Comment history">
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
  {:else}
    <p class="field-hint">No comments yet.</p>
  {/if}
  <div class="comment-author">
    <label
      >Comment author<input
        bind:value={author}
        maxlength="120"
        {disabled}
      /></label
    >
    <label
      >Author type<select bind:value={authorKind} {disabled}>
        <option value="human">Human</option>
        <option value="agent">Bot</option>
      </select></label
    >
  </div>
  <label
    >New comment<textarea
      bind:value={body}
      rows="3"
      maxlength="4000"
      placeholder="Write a comment…"
      {disabled}></textarea></label
  >
  <p class="field-hint">
    Markdown supported. {saved
      ? "Comments are saved when you add them."
      : "Save the card title to add a comment."}
  </p>
  <button
    type="button"
    class="primary"
    onclick={onadd}
    disabled={disabled ||
      !saved ||
      !body.trim() ||
      !author.trim() ||
      comments.length >= 200}>Add comment</button
  >
  {#if comments.length >= 200}<p class="field-hint">
      This card has reached its 200-comment limit.
    </p>{/if}
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
  .comment-author {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-6);
  }
  .comment-author label {
    min-width: 0;
    margin-bottom: 0;
  }
  textarea {
    resize: vertical;
  }
</style>
