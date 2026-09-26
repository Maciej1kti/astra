<script lang="ts">
  import type { Summary } from "../../lib/api/api";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";

  let {
    project,
    projects,
    focus = false,
    folder = "",
    onfolderchange,
    selectable,
    today,
    onprojectchange,
    ongit,
    ondiagnostics,
    onsettings,
    onrefresh,
    logout,
  }: {
    project: string;
    focus?: boolean;
    folder?: string;
    onfolderchange: (folder: string) => void;
    projects: Summary[];
    selectable: boolean;
    today: string;
    onprojectchange: (project: string) => void;
    ongit: () => void;
    ondiagnostics: () => void;
    onsettings: () => void;
    onrefresh: () => void;
    logout: () => void;
  } = $props();
  const folders = $derived(
    [...new Set(projects.flatMap((p) => (p.folder ? [p.folder] : [])))].sort(),
  );
  const projectName = $derived(
    projects.find((item) => item.id === project)?.title ?? "All projects",
  );
</script>

<header class="topbar">
  {#if focus}
    <select
      class="workspace-project"
      aria-label="Folder"
      title={folder || "All folders"}
      value={folder}
      onchange={(event) => onfolderchange(event.currentTarget.value)}
    >
      <option value="">All folders</option>
      {#if folder && !folders.includes(folder)}<option value={folder}
          >{folder}</option
        >{/if}
      {#each folders as item}<option value={item}>{item}</option>{/each}
    </select>
  {:else if selectable}
    <select
      class="workspace-project"
      aria-label="Project"
      title={projectName}
      value={project}
      onchange={(event) => onprojectchange(event.currentTarget.value)}
    >
      <option value="">All projects</option>
      {#each projects as item}<option value={item.id}>{item.title}</option
        >{/each}
    </select>
  {:else}
    <span class="workspace-label">All projects</span>
  {/if}
  <div class="workspace-actions">
    <div class="desktop-workspace-actions">
      {#if project && selectable && !focus}<Button
          variant="quiet"
          onclick={ongit}>Git</Button
        >{/if}
      <span class="date">{today}</span><Button
        variant="quiet"
        aria-label="Host diagnostics"
        onclick={ondiagnostics}><Icon name="info" /></Button
      >
    </div>
    <Button variant="quiet" aria-label="Workspace settings" onclick={onsettings}
      ><Icon name="settings" /></Button
    ><Button variant="quiet" onclick={onrefresh} aria-label="Refresh"
      ><Icon name="refresh" /></Button
    >
    <div class="mobile-workspace-actions">
      <ActionMenu label="Workspace actions">
        {#snippet children(close)}
          {#if project && selectable && !focus}<Button
              variant="quiet"
              onclick={() => {
                close();
                ongit();
              }}>Git</Button
            >{/if}
          <Button
            variant="quiet"
            onclick={() => {
              close();
              ondiagnostics();
            }}>Host diagnostics</Button
          >
          <Button
            variant="quiet"
            onclick={() => {
              close();
              logout();
            }}>Sign out</Button
          >
        {/snippet}
      </ActionMenu>
    </div>
  </div>
</header>
