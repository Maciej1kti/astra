<script lang="ts">
  import type { Resource } from "../../lib/api/api";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import { resourceLabel } from "../../lib/resources/resource-presentation";

  let {
    resource,
    projectName,
    project,
  }: {
    resource: Extract<Resource, { type: "update" }>;
    projectName: string;
    project: string;
  } = $props();
  const metadata = $derived(resource.metadata);
  const extensions = $derived(
    Object.entries(metadata).filter(([key]) => key.startsWith("x-")),
  );
</script>

<section class="update-record" aria-label="Report content">
  <p class="update-record-note">
    Updates are permanent records. Add a correction or resolution to change a
    previous update.
  </p>
  <dl>
    <div>
      <dt>Kind</dt>
      <dd>{resourceLabel(metadata.kind)}</dd>
    </div>
    <div>
      <dt>Author</dt>
      <dd>{metadata.author.label}</dd>
    </div>
    <div>
      <dt>Recorded</dt>
      <dd>{metadata.recorded_at}</dd>
    </div>
    {#if metadata.observed_at}<div>
        <dt>Observed</dt>
        <dd>{metadata.observed_at}</dd>
      </div>{/if}
    <div>
      <dt>Target</dt>
      <dd>
        {resourceLabel(metadata.target.type)} · {metadata.target.type ===
          "project" &&
        metadata.target.id === project &&
        projectName
          ? projectName
          : metadata.target.id}
      </dd>
    </div>
    {#if metadata.supersedes}<div>
        <dt>Corrects</dt>
        <dd><code>{metadata.supersedes}</code></dd>
      </div>{/if}
    {#if metadata.resolves?.length}<div>
        <dt>Resolves</dt>
        <dd>
          {#each metadata.resolves as id, index}{#if index},
            {/if}<code>{id}</code>{/each}
        </dd>
      </div>{/if}
  </dl>
  <div class="update-record-body">
    {#if resource.body.trim()}<Markdown source={resource.body} />{:else}<p
        class="empty-context"
      >
        No description.
      </p>{/if}
  </div>
  {#if metadata.evidence?.length}<section aria-label="Evidence">
      <h3>Evidence</h3>
      <ul>
        {#each metadata.evidence as item}<li>
            {item.label ? `${item.label} · ` : ""}{resourceLabel(item.type)}:
            <code>{item.value}</code>
          </li>{/each}
      </ul>
    </section>{/if}
  {#if extensions.length}<details>
      <summary>Additional fields</summary>
      <pre>{JSON.stringify(Object.fromEntries(extensions), null, 2)}</pre>
    </details>{/if}
</section>
