<script lang="ts">
  let {
    project,
    projectName,
    today,
    ongit,
    ondiagnostics,
    onsettings,
    onrefresh,
    logout,
  }: {
    project: string;
    projectName?: string;
    today: string;
    ongit: () => void;
    ondiagnostics: () => void;
    onsettings: () => void;
    onrefresh: () => void;
    logout: () => void;
  } = $props();
</script>

<header class="topbar">
  <span class="workspace-label" title={projectName || "All projects"}
    >Workspace <span class="slash">/</span>
    {projectName || "All projects"}</span
  >
  <div>
    {#if project}<button class="quiet" onclick={ongit}>Git</button>{/if}
    <span class="date">{today}</span><button
      class="quiet"
      aria-label="Host diagnostics"
      onclick={ondiagnostics}>ⓘ</button
    ><button class="quiet" aria-label="Workspace settings" onclick={onsettings}
      >⚙</button
    ><button class="quiet" onclick={onrefresh} aria-label="Refresh">↻</button
    ><button class="quiet mobile-signout" onclick={logout}>Sign out</button>
  </div>
</header>
