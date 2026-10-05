<script lang="ts">
  import EmptyState from "../../../lib/ui/EmptyState.svelte";

  import PinnedCard from "./PinnedCard.svelte";
  import type { FocusCounterSnapshot } from "../../cards/focus-counter-controller";
  import type { DailyCounterSummary } from "../../../lib/contracts/api.generated";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";
  import Icon from "../../../lib/ui/Icon.svelte";

  import type { Summary } from "../../../lib/api/api";
  import type { FocusRef } from "../../../lib/contracts/api.generated";
  import type { WorkspaceRoute } from "../navigation";
  import { projectLabel, type OpenResource } from "./screen-data";
  import { resourceLabel } from "../../../lib/resources/resource-presentation";
  import type { Attention } from "../view-queries";
  import {
    attentionKey,
    focusSections,
    type FocusAttention,
    type FocusCard,
    focusSectionCount,
  } from "./focus-sections";
  import { focusOrderGesture } from "../focus-order-gesture";

  let {
    today,
    timezone,
    now,
    counterState,
    oncounter,
    route,
    projects,
    cards,
    events,
    focusCards,
    focusCount,
    focusOrder,
    focusVersion,
    focusPending,
    focusBusy,
    focusConflict,
    focusRefreshing,
    focusError,
    focusCopyMessage,
    focusCanRetry,
    focusCanReload,
    focusRequestId,
    attentionRows,
    attentionCursor,
    attentionPaged,
    activeCardCursor,
    activeCardPaged,
    eventCursor,
    eventPaged,
    loadingMore,
    open,
    onreorder,
    onretry,
    onretrynew,
    onreload,
    oncopycommand,
    moreAttention,
    moreActiveCards,
    moreEvents,
  }: {
    today: string;
    timezone: string;
    now: number;
    counterState: FocusCounterSnapshot;
    oncounter: (
      item: Summary,
      counter: DailyCounterSummary,
      value: number,
      focus?: boolean,
    ) => void;
    route: Readonly<WorkspaceRoute>;
    projects: Summary[];
    cards: Summary[];
    events: Summary[];
    focusCards: Summary[];
    focusCount: number;
    focusOrder: FocusRef[];
    focusVersion: string;
    focusPending: boolean;
    focusBusy: boolean;
    focusConflict: boolean;
    focusRefreshing: boolean;
    focusError: string;
    focusCopyMessage: string;
    focusCanRetry: boolean;
    focusCanReload: boolean;
    focusRequestId: string;
    attentionRows: Attention[];
    attentionCursor: string | null;
    attentionPaged: boolean;
    activeCardCursor: string | null;
    activeCardPaged: boolean;
    eventCursor: string | null;
    eventPaged: boolean;
    loadingMore: boolean;
    open: OpenResource;
    onreorder: (
      visible: Summary[],
      fullOrder: FocusRef[],
      version: string,
    ) => void;
    onretry: () => void;
    onretrynew: () => void;
    onreload: () => void;
    oncopycommand: () => void;
    moreAttention: (first?: boolean) => Promise<void>;
    moreActiveCards: (back?: boolean) => Promise<void>;
    moreEvents: (back?: boolean) => Promise<void>;
  } = $props();

  const sections = $derived(
    focusSections(cards, focusCards, attentionRows, route, projects, events),
  );
  let gestureFocus = $state<FocusCard[] | null>(null);
  const visibleFocus = $derived<FocusCard[]>(sections.focusCards);
  const displayedFocus = $derived(gestureFocus ?? visibleFocus);
  const reorderableFocus = $derived(
    visibleFocus.filter((item) => item.availability !== "unavailable"),
  );
  const attention = $derived<FocusAttention[]>(sections.attention);
  const activeCards = $derived(sections.activeCards);

  function focusGestureOptions() {
    return {
      cards: () => reorderableFocus,
      fullOrder: () => focusOrder,
      version: () => focusVersion,
      scope: () => `${route.project}\n${route.folder}\n${route.search.trim()}`,
      disabled: () =>
        !focusVersion ||
        focusBusy ||
        focusPending ||
        focusCanReload ||
        focusRefreshing,
      active: (active: boolean) => {
        gestureFocus = active ? [...visibleFocus] : null;
      },
      commit: onreorder,
    };
  }

  function openAttention(item: FocusAttention) {
    return open({
      project_id: item.project_id,
      type: item.report_id ? "update" : item.target.type,
      id: item.report_id ?? item.target.id,
    });
  }
</script>

<section
  class="focus-section"
  aria-labelledby="focus-section-title"
  data-focus-section="focus"
>
  <SectionHeading
    id="focus-section-title"
    title="W Focus"
    count={`Widoczne karty: ${displayedFocus.length}`}
  />
  {#if focusCount > 1}<p class="sr" id="focus-order-help">
      Przeciągnij kartę, aby zmienić kolejność, lub zaznacz ją i naciśnij Alt+↑
      / Alt+↓ / Alt+Home / Alt+End. Escape anuluje przeciąganie. Kliknij kartę,
      aby ją otworzyć.
    </p>{/if}
  <div class="focus-stack" use:focusOrderGesture={focusGestureOptions()}>
    {#each displayedFocus as item (item.project_id + ":" + item.id)}
      <PinnedCard
        {item}
        {today}
        {timezone}
        {now}
        {counterState}
        {oncounter}
        projectName={projectLabel(projects, item.project_id)}
        reorderable={focusCount > 1}
        open={() => open(item)}
      />{:else}<EmptyState>
        {route.project || route.search
          ? "Brak przypiętych kart pasujących do wyboru. Zmień projekt lub wyczyść filtr tytułu."
          : "Brak przypiętych kart. Otwórz kartę i przypnij ją, aby zachować ją tutaj."}
      </EmptyState>{/each}
  </div>
  {#if focusBusy}<p role="status" class="focus-order-status">
      Zapisywanie kolejności Focus…
    </p>{/if}
  {#if focusPending && !focusBusy}<p role="alert" class="focus-order-status">
      {focusError ||
        "Kolejność Focus oczekuje na potwierdzenie. To samo polecenie zostało zachowane."}
    </p>
    <button onclick={onretry} disabled={focusRefreshing}
      >Ponów to samo polecenie</button
    >
    <details class="focus-save-details">
      <summary>Szczegóły zapisu</summary>
      <code>{focusRequestId}</code>
      <button onclick={oncopycommand}>Kopiuj oczekujące polecenie</button>
      {#if focusCopyMessage}<p role="status">{focusCopyMessage}</p>{/if}
    </details>{/if}
  {#if focusConflict}<p role="alert" class="focus-order-status">
      {focusError ||
        "Kolejność Focus zmieniła się gdzie indziej. Wczytaj ponownie, aby odrzucić tę propozycję."}
    </p>
    <button onclick={onreload} disabled={focusRefreshing}>
      {focusRefreshing
        ? "Wczytywanie kolejności Focus…"
        : "Wczytaj kolejność Focus ponownie"}
    </button>{/if}
  {#if focusError && !focusPending && !focusConflict}<p
      role="alert"
      class="focus-order-status"
    >
      {focusError}
    </p>
    {#if focusCanRetry}<button onclick={onretrynew}>Ponów tę kolejność</button
      >{/if}{#if focusCanReload}<button
        onclick={onreload}
        disabled={focusRefreshing}
      >
        {focusRefreshing
          ? "Wczytywanie kolejności Focus…"
          : "Wczytaj kolejność Focus ponownie"}
      </button>{/if}{/if}
  {#if focusRefreshing && !focusConflict}<p
      role="status"
      class="focus-order-status"
    >
      Wczytywanie kolejności Focus…
    </p>{/if}
</section>

<section
  aria-labelledby="attention-section-title"
  data-focus-section="attention"
>
  <SectionHeading
    id="attention-section-title"
    title="Potrzebuje mojej uwagi"
    count={focusSectionCount.attention(attention.length)}
  />
  {#each attention as item (attentionKey(item))}<button
      class="listrow"
      onclick={() => openAttention(item)}
      ><span class="priority"><Icon name="flag" /></span>
      <div>
        <strong>{item.label}</strong><small
          >{projectLabel(projects, item.project_id)}</small
        >
      </div>
      <span class="attention-reasons" aria-label="Powody wymagające uwagi"
        >{#each item.reasons as reason}<span class="badge"
            >{resourceLabel(reason)}</span
          >{/each}</span
      ><Icon name="arrow" /></button
    >{:else}<EmptyState>
      <strong>Chwila oddechu.</strong>
      <p>Żadne dodatkowe elementy na tej stronie nie wymagają uwagi.</p>
    </EmptyState>{/each}
  {#if attentionCursor}<button
      disabled={loadingMore}
      onclick={() => moreAttention()}>Następna strona wymagająca uwagi</button
    >{/if}
  {#if attentionPaged}<button
      disabled={loadingMore}
      onclick={() => moreAttention(true)}
      >Pierwsza strona wymagająca uwagi</button
    >{/if}
</section>

<section aria-labelledby="motion-section-title" data-focus-section="motion">
  <SectionHeading
    id="motion-section-title"
    title="W toku"
    count={focusSectionCount.motion(activeCards.length)}
  />
  <div class="focus-stack">
    {#each activeCards as item (item.project_id + ":" + item.id)}<PinnedCard
        {item}
        {today}
        {timezone}
        {now}
        {counterState}
        {oncounter}
        pinned={false}
        projectName={projectLabel(projects, item.project_id)}
        open={() => open(item)}
      />{:else}<EmptyState>
        Brak innych planów na dzisiaj na tej stronie.
      </EmptyState>{/each}
  </div>
  {#if activeCardCursor}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards()}>Następne plany</button
    >{/if}
  {#if activeCardPaged}<button
      disabled={loadingMore}
      onclick={() => moreActiveCards(true)}>Poprzednie plany</button
    >{/if}
</section>

<section aria-labelledby="events-section-title" data-focus-section="events">
  <SectionHeading
    id="events-section-title"
    title="Wydarzenia"
    count={focusSectionCount.events(sections.eventCards.length)}
  />
  <div class="focus-stack">
    {#each sections.eventCards as item (item.project_id + ":" + item.id)}
      <PinnedCard
        {item}
        {today}
        {timezone}
        {now}
        {counterState}
        {oncounter}
        pinned={false}
        projectName={projectLabel(projects, item.project_id)}
        open={() => open(item)}
      />
    {:else}<EmptyState
        >Brak innych wydarzeń na dzisiaj na tej stronie.</EmptyState
      >{/each}
  </div>
  {#if eventCursor}<button disabled={loadingMore} onclick={() => moreEvents()}
      >Następne wydarzenia</button
    >{/if}
  {#if eventPaged}<button
      disabled={loadingMore}
      onclick={() => moreEvents(true)}>Poprzednie wydarzenia</button
    >{/if}
</section>
