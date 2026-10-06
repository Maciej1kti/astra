<script lang="ts">
  import { tick, untrack } from "svelte";
  import { serverMessage } from "../../lib/api/messages.ts";
  import type { AgentRunContext } from "../../lib/contracts/api.generated";
  import Badge from "../../lib/ui/Badge.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import { layerExit, modal } from "../../lib/ui/dialog";
  import DialogHeader from "../../lib/ui/DialogHeader.svelte";
  import Markdown from "../../lib/ui/Markdown.svelte";
  import SessionNotice from "../../lib/ui/SessionNotice.svelte";
  import { formatElapsed, type AgentActivity } from "./agent-chat.ts";
  import { agentSession } from "./agent-session.svelte";
  import { agentMessageLimit } from "./agent-storage.ts";

  let {
    open = $bindable(false),
    view,
    project,
    userId,
    onstate,
    onsettings,
  }: {
    open: boolean;
    view?: AgentRunContext["view"];
    project?: string;
    userId: string;
    /** What the floating button shows, and whether the dialog holds work. */
    onstate: (state: { activity: AgentActivity; holds: boolean }) => void;
    onsettings: () => void;
  } = $props();

  // A tab keeps its profile; the last known one outlives a lost session.
  let user = untrack(() => userId) || "default";
  $effect(() => {
    if (userId) user = userId;
  });
  const chat = agentSession({
    userId: () => user,
    context: () => ({
      ...(view ? { view } : {}),
      ...(project ? { project_id: project } : {}),
    }),
    visible: () => open,
  });
  const labels = { claude: "Claude Code", codex: "Codex" };

  let body = $state<HTMLElement>();
  let composer = $state<HTMLTextAreaElement>();

  $effect(() => {
    onstate({
      activity: chat.active ? "pracuje" : chat.unseen ? "nowa odpowiedź" : "",
      holds: chat.holds,
    });
  });
  $effect(() => {
    if (open) {
      untrack(() => chat.opened());
      void tick().then(() => composer?.focus());
    } else untrack(() => chat.closed());
  });
  // Put back text from a refused message, and keep the caret in the composer.
  $effect(() => {
    void chat.composerRevision;
    if (untrack(() => open)) void tick().then(() => composer?.focus());
  });

  // The newest entry comes into view: its start when it is taller than the list.
  const progress = $derived(
    chat.chat.turns.map((turn) => `${turn.runId}:${turn.state}`).join(),
  );
  $effect(() => {
    void progress;
    void chat.phase;
    if (!open) return;
    void tick().then(() => {
      const last = body?.querySelector<HTMLElement>(
        ".agent-log > li:last-child",
      );
      if (!body || !last) return;
      body.scrollTop =
        last.offsetHeight > body.clientHeight
          ? last.offsetTop
          : last.offsetTop + last.offsetHeight - body.clientHeight;
    });
  });
  // The composer grows with its text, up to the limit set in CSS.
  $effect(() => {
    void chat.draft;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${composer.scrollHeight + composer.offsetHeight - composer.clientHeight}px`;
  });

  function close() {
    open = false;
  }
  function openSettings() {
    open = false;
    onsettings();
  }
  function submit() {
    chat.send();
    composer?.focus();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229)
      return;
    if (event.shiftKey || event.altKey) return;
    // A phone's Enter is a line break; only the button sends. A modifier always sends.
    const explicit = event.ctrlKey || event.metaKey;
    if (!explicit && matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    submit();
  }
</script>

{#if open}
  <dialog
    use:modal={{ onclose: close }}
    out:layerExit|global
    class="app-dialog agent-dialog"
    aria-label="Agent"
  >
    <DialogHeader onclose={close} closeLabel="Zamknij agenta">
      {#snippet heading()}
        <div class="agent-title">
          <h2>Agent</h2>
          {#if chat.provider}<Badge>{labels[chat.provider]}</Badge>{/if}
        </div>
      {/snippet}
      {#snippet actions()}
        <Button
          variant="quiet"
          disabled={chat.active || chat.phase !== "ready"}
          onclick={() => chat.newConversation()}>Nowa rozmowa</Button
        >
      {/snippet}
    </DialogHeader>
    <div class="dialog-body agent-body" bind:this={body}>
      <SessionNotice
        lost={chat.sessionLost}
        message="Sesja wygasła. Rozmowa z agentem została zachowana; połącz przeglądarkę ponownie, aby ją dokończyć."
      />
      {#if chat.phase === "idle" || chat.phase === "loading"}
        <p role="status" class="agent-loading">Łączenie z agentem…</p>
      {:else if chat.phase === "error"}
        <div class="agent-failure">
          <p role="alert">{chat.loadError}</p>
          <Button onclick={chat.retryLoad}>Spróbuj ponownie</Button>
        </div>
      {:else}
        {#if chat.chat.notice === "gone"}
          <p role="status" class="agent-note">
            Poprzednia rozmowa nie jest już dostępna na hoście.
          </p>
        {/if}
        {#if !chat.chat.turns.length}
          <div class="agent-empty">
            <strong>Co mam zrobić?</strong>
            <p>
              Napisz zwykłym zdaniem, na przykład „zrobiłem 10 pompek” albo
              „dodaj komentarz do karty o fakturze”. Agent sam znajdzie projekt
              i kartę.
            </p>
          </div>
        {:else}
          <ol class="agent-log" aria-label="Rozmowa z agentem">
            {#each chat.chat.turns as turn (turn.runId)}
              <li class="entry user">
                <span class="sr">Ty</span>
                <p class="user-text">{turn.message}</p>
              </li>
              <li class="entry agent" data-state={turn.state}>
                <span class="sr">Agent</span>
                <div class="agent-answer" aria-live="polite">
                  {#if turn.state === "sending" || (turn.state === "uncertain" && !turn.exhausted)}
                    <p role="status" class="progress">Wysyłanie…</p>
                    {#if turn.state === "uncertain"}
                      <p role="status" class="hint">
                        Brak połączenia z hostem — ponawiam…
                      </p>
                    {/if}
                  {:else if turn.state === "uncertain"}
                    <div class="notice">
                      <p role="alert">
                        Nie udało się potwierdzić, że wiadomość dotarła do
                        hosta.
                      </p>
                      <div class="actions">
                        <Button onclick={() => chat.retry(turn.runId)}
                          >Ponów</Button
                        >
                      </div>
                    </div>
                  {:else if turn.state === "running"}
                    <p role="status" class="progress">
                      {#if turn.cancel === "none"}Agent pracuje…{:else}Przerywanie…{/if}
                      <span aria-hidden="true" class="elapsed"
                        >{formatElapsed(chat.now - turn.startedAt)}</span
                      >
                    </p>
                    {#if turn.pollFailures > 0}
                      <p role="status" class="hint">
                        Brak połączenia z hostem — ponawiam…
                      </p>
                    {/if}
                    {#if turn.cancel === "none"}
                      <div class="actions">
                        <Button
                          variant="quiet"
                          onclick={() => chat.cancel(turn.runId)}
                          >Przerwij</Button
                        >
                      </div>
                    {/if}
                  {:else if turn.state === "lost"}
                    <div class="notice">
                      <p role="alert">
                        Host został uruchomiony ponownie i nie pamięta tej
                        wiadomości. Nie wiadomo, czy agent ją wykonał — sprawdź
                        dane, zanim wyślesz ją jeszcze raz.
                      </p>
                      <div class="actions">
                        <Button onclick={() => void chat.sendAgain(turn.runId)}
                          >Wyślij ponownie</Button
                        >
                        <Button variant="quiet" onclick={chat.discard}
                          >Odrzuć</Button
                        >
                      </div>
                    </div>
                  {:else if turn.state === "succeeded"}
                    {#if turn.reply}
                      <Markdown source={turn.reply} />
                    {:else}
                      <p role="alert" class="failure">
                        {serverMessage("AGENT_OUTPUT_INVALID")}
                      </p>
                    {/if}
                    {#if turn.replyTruncated}
                      <p class="meta">Odpowiedź została skrócona.</p>
                    {/if}
                  {:else if turn.state === "failed"}
                    <p role="alert" class="failure">
                      {serverMessage(turn.error?.code ?? "")}
                    </p>
                    {#if turn.error?.detail}
                      <details>
                        <summary>Szczegóły</summary>
                        <p class="detail">{turn.error.detail}</p>
                      </details>
                    {/if}
                  {:else if turn.state === "cancelled"}
                    <p role="status">
                      Przerwano. Agent mógł zdążyć wykonać część zmian.
                    </p>
                  {:else}
                    <p role="alert" class="failure">
                      Agent nie skończył w wyznaczonym czasie i został
                      zatrzymany. Mógł wykonać część zmian.
                    </p>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        {/if}
      {/if}
    </div>
    <footer class="dialog-footer agent-composer">
      {#if chat.unavailable}
        <div class="notice agent-unavailable">
          <p role="alert">
            Na hoście nie znaleziono polecenia {chat.unavailable}. Zainstaluj je
            albo wybierz innego dostawcę w Ustawieniach.
          </p>
          <Button onclick={openSettings}>Otwórz ustawienia</Button>
        </div>
      {/if}
      {#if chat.chat.sendError}
        <p class="notice" role="alert">{serverMessage(chat.chat.sendError)}</p>
      {/if}
      {#if chat.problem}
        <p class="notice" role="alert">{chat.problem}</p>
      {/if}
      <form
        class="agent-form"
        onsubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          bind:this={composer}
          bind:value={chat.draft}
          aria-label="Wiadomość do agenta"
          placeholder="Napisz, co zrobić…"
          rows="1"
          maxlength={agentMessageLimit}
          autocomplete="off"
          onkeydown={keydown}></textarea>
        <Button variant="primary" type="submit" disabled={!chat.canSend}
          >Wyślij</Button
        >
      </form>
    </footer>
  </dialog>
{/if}

<style>
  .agent-dialog {
    --agent-height: 680px;
    height: min(80dvh, var(--agent-height));
  }
  /* The floating Agent button lives in the shell; this loads with the dialog. */
  :global(.app .agent-action) {
    position: relative;
  }
  :global(.app .agent-action[data-activity]::after) {
    content: "";
    position: absolute;
    top: calc(-1 * var(--space-1));
    right: calc(-1 * var(--space-1));
    width: var(--space-5);
    height: var(--space-5);
    box-sizing: border-box;
    border: var(--focus-width) solid var(--accent-ink);
    border-radius: var(--radius-pill);
    background: var(--paper);
  }
  :global(.app .agent-action[data-activity="nowa odpowiedź"]::after) {
    border-color: var(--success);
    background: var(--success);
  }
  /* The centered counter bar would sit under the group at some widths. */
  :global(.app.counter-editing .agent-action) {
    display: none;
  }
  .agent-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }
  .agent-title h2 {
    margin: 0;
  }
  .agent-body {
    position: relative;
    flex: 1;
  }
  .agent-loading,
  .agent-note,
  .hint,
  .meta {
    color: var(--muted);
    font-size: var(--text-label);
  }
  .agent-failure {
    display: grid;
    justify-items: start;
    gap: var(--space-4);
  }
  .agent-empty {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-10) var(--space-4);
    text-align: center;
    color: var(--muted);
    font-size: var(--text-label);
  }
  .agent-empty strong {
    color: var(--ink);
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
  }
  .agent-empty p {
    margin: 0;
    line-height: var(--leading-body);
  }
  .agent-log {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .entry.user {
    justify-self: end;
    max-width: 88%;
    padding: var(--space-4) var(--space-6);
    border-radius: var(--radius-control);
    background: var(--soft);
  }
  .entry.agent {
    margin-bottom: var(--space-5);
    border-bottom: var(--stroke) solid var(--line);
    padding-bottom: var(--space-6);
  }
  .entry.agent:last-child {
    margin-bottom: 0;
    border-bottom: 0;
    padding-bottom: 0;
  }
  .user-text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .agent-answer :global(p) {
    margin: 0 0 var(--space-4);
  }
  .agent-answer :global(.markdown p) {
    margin: var(--space-4) 0;
  }
  .progress {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    color: var(--muted);
  }
  .elapsed {
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .failure {
    color: var(--danger);
  }
  .agent-answer .notice p {
    margin: 0 0 var(--space-4);
  }
  .detail {
    white-space: pre-wrap;
    color: var(--muted);
    font-size: var(--text-label);
  }
  .agent-composer {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    flex-wrap: nowrap;
    gap: var(--space-4);
  }
  .agent-composer .notice {
    margin: 0;
    padding: var(--space-4) var(--space-6);
  }
  .agent-composer .notice p {
    margin: 0 0 var(--space-4);
  }
  .agent-form {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
  }
  .agent-form textarea {
    flex: 1;
    min-width: 0;
    max-height: 40dvh;
    resize: none;
    line-height: var(--leading-body);
  }
  @media (max-width: 520px) {
    .agent-dialog {
      height: calc(100dvh - var(--space-8));
    }
    .entry.user {
      max-width: 94%;
    }
  }
</style>
