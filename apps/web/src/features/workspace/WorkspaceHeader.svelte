<script lang="ts">
  import { controlsLayers, revealLayers } from "../../lib/ui/motion-layers";
  import type { Summary } from "../../lib/api/api";
  import ActionMenu from "../../lib/ui/ActionMenu.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Icon from "../../lib/ui/Icon.svelte";
  import { uiLocale } from "../../lib/ui/locale";

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
    userName = "Właściciel",
    defaultUser = true,
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
    userName?: string;
    defaultUser?: boolean;
  } = $props();
  const folders = $derived(
    [...new Set(projects.flatMap((p) => (p.folder ? [p.folder] : [])))].sort(),
  );
  const dayFormat = new Intl.DateTimeFormat(uiLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const dayLabel = $derived.by(() => {
    const [year, month, day] = today.split("-").map(Number);
    return year && month && day
      ? dayFormat.format(new Date(Date.UTC(year, month - 1, day)))
      : today;
  });
  const projectName = $derived(
    projects.find((item) => item.id === project)?.title ?? "Wszystkie projekty",
  );
</script>

<header class="topbar" use:revealLayers={controlsLayers}>
  {#if focus}
    <select
      class="workspace-project"
      aria-label="Folder"
      title={folder || "Wszystkie foldery"}
      value={folder}
      onchange={(event) => onfolderchange(event.currentTarget.value)}
    >
      <option value="">Wszystkie foldery</option>
      {#if folder && !folders.includes(folder)}<option value={folder}
          >{folder}</option
        >{/if}
      {#each folders as item}<option value={item}>{item}</option>{/each}
    </select>
  {:else if selectable}
    <select
      class="workspace-project"
      aria-label="Projekt"
      title={projectName}
      value={project}
      onchange={(event) => onprojectchange(event.currentTarget.value)}
    >
      <option value="">Wszystkie projekty</option>
      {#each projects as item}<option value={item.id}>{item.title}</option
        >{/each}
    </select>
  {:else}
    <span class="workspace-label">Wszystkie projekty</span>
  {/if}
  <div class="workspace-actions">
    <div class="desktop-workspace-actions">
      {#if project && selectable && !focus}<Button
          variant="quiet"
          onclick={ongit}>Git</Button
        >{/if}
      <time class="date" datetime={today}>{dayLabel}</time><Button
        variant="quiet"
        aria-label="Diagnostyka serwera"
        onclick={ondiagnostics}><Icon name="info" /></Button
      >
    </div>
    <Button
      variant="quiet"
      aria-label="Ustawienia przestrzeni roboczej"
      title={`Użytkownik: ${userName}`}
      onclick={onsettings}
      ><span class="current-user" class:sr={defaultUser}>{userName}</span><Icon
        name="settings"
      /></Button
    ><Button variant="quiet" onclick={onrefresh} aria-label="Odśwież"
      ><Icon name="refresh" /></Button
    >
    <div class="mobile-workspace-actions">
      <ActionMenu label="Działania przestrzeni roboczej">
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
            }}>Diagnostyka serwera</Button
          >
          <Button
            variant="quiet"
            onclick={() => {
              close();
              logout();
            }}>Wyloguj</Button
          >
        {/snippet}
      </ActionMenu>
    </div>
  </div>
</header>

<style>
  .current-user {
    max-width: var(--field-compact);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 700px) {
    .current-user {
      max-width: var(--space-20);
    }
  }
  @media (max-width: 360px) {
    .current-user {
      display: none;
    }
  }
</style>
