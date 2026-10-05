<script lang="ts">
  import EmptyState from "../../../lib/ui/EmptyState.svelte";

  import PinnedCard from "./PinnedCard.svelte";
  import type { FocusCounterSnapshot } from "../../cards/focus-counter-controller";
  import type { DailyCounterSummary } from "../../../lib/contracts/api.generated";
  import SectionHeading from "../../../lib/ui/SectionHeading.svelte";
  import Icon from "../../../lib/ui/Icon.svelte";

  import type { Summary } from "../../../lib/api/api";
  import type { FocusOrderState } from "../focus-order-state.svelte";
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
    order,
    attentionRows,
    attentionCursor,
    attentionPaged,
    activeCardCursor,
    activeCardPaged,
    eventCursor,
    eventPaged,
    loadingMore,
    open,
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
    /** The route-independent order command with its proposal and recovery. */
    order: FocusOrderState;
    attentionRows: Attention[];
    attentionCursor: string | null;
    attentionPaged: boolean;
    activeCardCursor: string | null;
    activeCardPaged: boolean;
    eventCursor: string | null;
    eventPaged: boolean;
    loadingMore: boolean;
    open: OpenResource;
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
      fullOrder: () => order.items,
      version: () => order.version,
      scope: () => `${route.project}\n${route.folder}\n${route.search.trim()}`,
      disabled: () =>
        !order.version ||
        order.busy ||
        order.pending ||
        order.canReload ||
        order.reloading,
      active: (active: boolean) => {
        gestureFocus = active ? [...visibleFocus] : null;
      },
      commit: order.reorder,
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
  {#if order.items.length > 1}<p class="sr" id="focus-order-help">
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
        reorderable={order.items.length > 1}
        open={() => open(item)}
      />{:else}<EmptyState>
        {route.project || route.search
          ? "Brak przypiętych kart pasujących do wyboru. Zmień projekt lub wyczyść filtr tytułu."
          : "Brak przypiętych kart. Otwórz kartę i przypnij ją, aby zachować ją tutaj."}
      </EmptyState>{/each}
  </div>
  {#if order.busy}<p role="status" class="focus-order-status">
      Zapisywanie kolejności Focus…
    </p>{/if}
  {#if order.pending && !order.busy}<p role="alert" class="focus-order-status">
      {order.error ||
        "Kolejność Focus oczekuje na potwierdzenie. To samo polecenie zostało zachowane."}
    </p>
    <button onclick={order.retry} disabled={order.reloading}
      >Ponów to samo polecenie</button
    >
    <details class="focus-save-details">
      <summary>Szczegóły zapisu</summary>
      <code>{order.requestId}</code>
      <button onclick={order.copyCommand}>Kopiuj oczekujące polecenie</button>
      {#if order.copyMessage}<p role="status">{order.copyMessage}</p>{/if}
    </details>{/if}
  {#if order.conflict}<p role="alert" class="focus-order-status">
      {order.error ||
        "Kolejność Focus zmieniła się gdzie indziej. Wczytaj ponownie, aby odrzucić tę propozycję."}
    </p>
    <button onclick={order.reload} disabled={order.reloading}>
      {order.reloading
        ? "Wczytywanie kolejności Focus…"
        : "Wczytaj kolejność Focus ponownie"}
    </button>{/if}
  {#if order.error && !order.pending && !order.conflict}<p
      role="alert"
      class="focus-order-status"
    >
      {order.error}
    </p>
    {#if order.canRetry}<button onclick={order.retryRejected}
        >Ponów tę kolejność</button
      >{/if}{#if order.canReload}<button
        onclick={order.reload}
        disabled={order.reloading}
      >
        {order.reloading
          ? "Wczytywanie kolejności Focus…"
          : "Wczytaj kolejność Focus ponownie"}
      </button>{/if}{/if}
  {#if order.reloading && !order.conflict}<p
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
