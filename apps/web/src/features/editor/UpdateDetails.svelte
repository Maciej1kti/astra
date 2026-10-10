<script lang="ts">
  import type { Resource } from "../../lib/api/api";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import {
    resourceLabel,
    formatTimestamp,
  } from "../../lib/resources/resource-presentation";

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

<section class="update-record" aria-label="Treść raportu">
  <dl>
    <div>
      <dt>Rodzaj</dt>
      <dd>{resourceLabel(metadata.kind)}</dd>
    </div>
    <div>
      <dt>Autor</dt>
      <dd>{metadata.author.label}</dd>
    </div>
    <div>
      <dt>Zapisano</dt>
      <dd>
        <time datetime={metadata.recorded_at} title={metadata.recorded_at}
          >{formatTimestamp(metadata.recorded_at)}</time
        >
      </dd>
    </div>
    {#if metadata.observed_at}<div>
        <dt>Zaobserwowano</dt>
        <dd>
          <time datetime={metadata.observed_at} title={metadata.observed_at}
            >{formatTimestamp(metadata.observed_at)}</time
          >
        </dd>
      </div>{/if}
    <div>
      <dt>Dotyczy</dt>
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
        <dt>Poprawia</dt>
        <dd><code>{metadata.supersedes}</code></dd>
      </div>{/if}
    {#if metadata.resolves?.length}<div>
        <dt>Rozstrzyga</dt>
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
        Brak opisu.
      </p>{/if}
  </div>
  {#if metadata.evidence?.length}<section aria-label="Dowody">
      <h3>Dowody</h3>
      <ul>
        {#each metadata.evidence as item}<li>
            {item.label ? `${item.label} · ` : ""}{resourceLabel(item.type)}:
            <code>{item.value}</code>
          </li>{/each}
      </ul>
    </section>{/if}
  {#if extensions.length}<details>
      <summary>Dodatkowe pola</summary>
      <pre>{JSON.stringify(Object.fromEntries(extensions), null, 2)}</pre>
    </details>{/if}
  <p class="update-record-note">
    Aktualizacje są trwałymi zapisami. Dodaj poprawkę lub rozstrzygnięcie, aby
    zmienić poprzednią aktualizację.
  </p>
</section>
