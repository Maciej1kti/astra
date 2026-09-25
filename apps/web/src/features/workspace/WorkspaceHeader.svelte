<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";

  import Icon from "../../lib/ui/Icon.svelte";

  let {
    tag = "header",
    project,
    projectName,
    today,
    ongit,
    ondiagnostics,
    onsettings,
    onrefresh,
    logout,
  }: {
    tag?: "header" | "footer";
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

<svelte:element this={tag} class="topbar">
  <span class="workspace-label" title={projectName || "All projects"}
    >Workspace <span class="slash">/</span>
    {projectName || "All projects"}</span
  >
  <div>
    {#if project}<Button variant="quiet" onclick={ongit}>Git</Button>{/if}
    <span class="date">{today}</span><Button
      variant="quiet"
      aria-label="Host diagnostics"
      onclick={ondiagnostics}><Icon name="info" /></Button
    ><Button
      variant="quiet"
      aria-label="Workspace settings"
      onclick={onsettings}><Icon name="settings" /></Button
    ><Button variant="quiet" onclick={onrefresh} aria-label="Refresh"
      ><Icon name="refresh" /></Button
    ><Button variant="quiet" class="mobile-signout" onclick={logout}
      >Sign out</Button
    >
  </div>
</svelte:element>
