import type { Plugin } from "vite";

const prefix = "/node_modules/@event-calendar/core/";
const geometry = decodeURIComponent(
  new URL("../src/features/planning/calendar-layout.ts", import.meta.url)
    .pathname,
);
const sources = new Map([
  [
    "src/plugins/day-grid/View.svelte",
    "3e5ebd33149ca8d73b294639b1ee524011f58a8cbf399c980866acb7515fb7b2",
  ],
  [
    "src/plugins/day-grid/Event.svelte",
    "72c510db38c208ce2d7a92ba234253bea4191c68ac8a17d9e7a81380fb7b8a1f",
  ],
  [
    "src/lib/events.js",
    "a4bd282cd3d8fb4f6cae40e7923cc111da65b7f15ece2fd01ade196d4db44fed",
  ],
  [
    "src/lib/components/BaseEvent.svelte",
    "e38213da4808d57c952c29f34be0f47c79d9fd39339387587250732eda8561cb",
  ],
  [
    "src/plugins/day-grid/derived.js",
    "8f2fc6ee93b0503c088c99515378890d9f2b75501e88664a400693b7e66eda07",
  ],
  [
    "src/lib/chunks.js",
    "d0a9450bec10e910e4858cf94d98626c9c79d15b2b08d45d19281c386e38c91a",
  ],
]);

function replace(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2)
    throw new Error("Calendar layout patch requires its reviewed source shape");
  return source.replace(before, after);
}

/** Patch the reviewed 5.12.2 layout path before Svelte compilation, without editing npm files. */
export async function calendarLayoutSource(
  source: string,
  id: string,
): Promise<string | null> {
  if (id.includes("?")) return null;
  const path = id.replaceAll("\\", "/");
  const position = path.lastIndexOf(prefix);
  if (position < 0) return null;
  const name = path.slice(position + prefix.length);
  const expected = sources.get(name);
  if (!expected) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== expected)
    throw new Error(
      `Review calendar layout optimization before changing ${name}`,
    );
  if (name === "src/lib/chunks.js") return source;
  if (name === "src/lib/components/BaseEvent.svelte") {
    // Astra's snippet reads the event. Defer optional library fields until a
    // consumer reads them, preserving their reactive reads and default content.
    source = replace(
      source,
      "<script>",
      `<script>\n    import {calendarContentArgs} from ${JSON.stringify(geometry)};`,
    );
    return replace(
      source,
      "() => ({event: toEventWithLocalDates(event), timeText, view: toViewWithLocalDates(view)})",
      "() => calendarContentArgs(toEventWithLocalDates(event), () => timeText, () => toViewWithLocalDates(view))",
    );
  }
  if (name === "src/plugins/day-grid/derived.js") {
    source = replace(
      source,
      "bgChunks = bgChunks.concat(createAllDayChunks(event, days));",
      "bgChunks.push(...createAllDayChunks(event, days));",
    );
    source = replace(
      source,
      "chunks = chunks.concat(createAllDayChunks(event, days));",
      "chunks.push(...createAllDayChunks(event, days));",
    );
    return replace(
      source,
      "iChunks = iChunks.concat(createAllDayChunks(event, days, false));",
      "iChunks.push(...createAllDayChunks(event, days, false));",
    );
  }
  if (name === "src/plugins/day-grid/View.svelte") {
    source = replace(
      source,
      "<script>",
      `<script>\n    import {collectHiddenChunks, measureOnce, monthChunkSamples} from ${JSON.stringify(geometry)};`,
    );
    source = replace(
      source,
      "contentFrom, empty, length, resizeObserver, runReposition",
      "contentFrom, empty, height, length, max, repositionEvent, resizeObserver, runReposition, toTime",
    );
    source = replace(
      source,
      "getContext, setContext, tick",
      "getContext, onDestroy, setContext, tick, untrack",
    );
    source = replace(
      source,
      "    let refs = [];",
      `    let refs = [];
    let samples = $derived(dayMaxEvents === true ? monthChunkSamples(chunks) : null);
    let indices = $derived(new Map(chunks.map((chunk, index) => [chunk, index])));
    let placements = $state.raw(new Map());
    let renderedChunks = $derived.by(() => {
        const result = [];
        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];
            if (!samples || samples.representatives.has(chunk) || placements.get(chunk)?.hidden === false) {
                result.push({chunk, index});
            }
        }
        return result;
    });
    let pendingResize = 0;
    function resizeSamples() {
        if (pendingResize) return;
        pendingResize = requestAnimationFrame(() => {
            pendingResize = 0;
            reposition();
        });
    }
    onDestroy(() => cancelAnimationFrame(pendingResize));

    function publish(next) {
        const previous = untrack(() => placements);
        if (previous.size === next.size && [...next].every(([chunk, value]) => {
            const old = previous.get(chunk);
            return old && old.top === value.top && old.height === value.height && old.hidden === value.hidden;
        })) return false;
        placements = next;
        return true;
    }
    function dayElement(chunk) {
        return viewState.gridEl.children.item((chunk.gridRow - 1) * grid[0].length + chunk.gridColumn - 1);
    }
    function isHidden(chunk, measure) {
        const first = dayElement(chunk);
        let day = first, footer = 0;
        for (let i = 0; i < chunk.dates.length && day; i++, day = day.nextElementSibling) {
            footer = max(footer, measure(day.lastElementChild));
        }
        return chunk.bottom > measure(first) - footer;
    }`,
    );
    source = replace(
      source,
      "        runReposition(refs, chunks);",
      `        const measure = measureOnce(height);
        if (samples) {
            const heights = new Map();
            for (const sample of samples.representatives) {
                const ref = refs[indices.get(sample)];
                if (!ref) return;
                heights.set(sample, ref.measureHeight(measure));
            }
            const next = new Map();
            for (const chunk of chunks) {
                const size = heights.get(samples.sample.get(chunk));
                const top = repositionEvent(chunk, size, measure(dayElement(chunk).firstElementChild) || 1, eventGap);
                next.set(chunk, {top, height: size, hidden: isHidden(chunk, measure)});
            }
            if (!publish(next)) return;
        } else {
            runReposition(refs, chunks, measure);
            publish(new Map());
        }`,
    );
    source = replace(
      source,
      "        refs.forEach(ref => ref?.hide());",
      `        const measure = measureOnce(height);
        const hidden = collectHiddenChunks(hiddenChunks);
        if (samples) {
            const next = new Map();
            for (const chunk of chunks) {
                const old = placements.get(chunk);
                if (!old) continue;
                const value = {...old, hidden: isHidden(chunk, measure)};
                next.set(chunk, value);
                if (value.hidden) for (const date of chunk.dates) hidden.add(toTime(date), chunk);
            }
            hidden.publish();
            publish(next);
        } else {
            refs.forEach(ref => ref?.hide(measure, hidden.add));
            hidden.publish();
        }`,
    );
    source = replace(
      source,
      "{#each chunks as chunk, i (chunk.id)}",
      "{#each renderedChunks as {chunk, index: i} (chunk.id)}",
    );
    return replace(
      source,
      "                    <Event bind:this={refs[i]} {chunk}/>",
      `                    <Event bind:this={refs[i]} {chunk} placement={samples && placements.get(chunk)} onSizeChange={samples?.representatives.has(chunk) ? resizeSamples : undefined}/>`,
    );
  }

  if (name === "src/lib/events.js") {
    source = replace(
      source,
      "runReposition(refs, data)",
      "runReposition(refs, data, measure)",
    );
    return replace(source, "ref?.reposition();", "ref?.reposition(measure);");
  }
  source = replace(
    source,
    "let {chunk, inPopup = false}",
    "let {chunk, inPopup = false, placement, onSizeChange}",
  );
  source = replace(
    source,
    "    // Style",
    `    $effect(() => {
        if (!onSizeChange || !el) return;
        const style = getComputedStyle(el);
        let observedHeight = parseFloat(style.height);
        if (style.boxSizing !== 'border-box') {
            for (const value of [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]) {
                observedHeight += parseFloat(value);
            }
        }
        // CSS serialization rounds fractional layout units. Normalize only
        // the notification baseline; layout passes still read actual rects.
        observedHeight = Math.round(observedHeight * 64) / 64;
        const observer = new ResizeObserver(entries => {
            const current = entries[0].borderBoxSize?.[0]?.blockSize;
            if (current === undefined) {
                onSizeChange();
                return;
            }
            if (current === observedHeight) return;
            observedHeight = current;
            onSizeChange();
        });
        observer.observe(el);
        return () => observer.disconnect();
    });

    export function measureHeight(measure = height) {
        return measure(el);
    }

    // Style`,
  );
  source = replace(
    source,
    "let marginTop = inPopup ? 1 : margin;",
    "let marginTop = inPopup ? 1 : (placement?.top ?? margin);",
  );
  source = replace(
    source,
    "if (hidden) {\n            style['visibility'] = 'hidden';",
    "if (placement?.hidden ?? hidden) {\n            style['visibility'] = 'hidden';",
  );
  source = replace(
    source,
    "forceMargin={[margin, chunk.gridRow]}",
    "forceMargin={[placement?.top ?? margin, chunk.gridRow]}",
  );
  source = replace(
    source,
    "export function reposition()",
    "export function reposition(measure = height)",
  );
  source = replace(
    source,
    "repositionEvent(chunk, height(el), height(getDayEl().firstElementChild) || 1, eventGap)",
    "repositionEvent(chunk, measure(el), measure(getDayEl().firstElementChild) || 1, eventGap)",
  );
  source = replace(
    source,
    "export function hide()",
    "export function hide(measure = height, record)",
  );
  source = replace(
    source,
    "let key = toTime(date);",
    "let key = toTime(date);\n                    if (record) {\n                        record(key, chunk);\n                        continue;\n                    }",
  );
  source = replace(
    source,
    "height(dayEl) - footHeight(dayEl)",
    "measure(dayEl) - footHeight(dayEl, measure)",
  );
  source = replace(
    source,
    "function footHeight(dayEl)",
    "function footHeight(dayEl, measure)",
  );
  return replace(
    source,
    "max(h, height(dayEl.lastElementChild))",
    "max(h, measure(dayEl.lastElementChild))",
  );
}

export function calendarLayoutPlugin(): Plugin {
  let productionBuild = false;
  const patched = new Set<string>();
  return {
    name: "astra-calendar-layout",
    enforce: "pre",
    configResolved(config) {
      productionBuild = config.command === "build";
    },
    buildStart() {
      patched.clear();
    },
    async transform(source, id) {
      const code = await calendarLayoutSource(source, id);
      if (code !== null)
        patched.add(id.slice(id.lastIndexOf(prefix) + prefix.length));
      return code === null ? null : { code, map: null };
    },
    buildEnd(error) {
      if (!error && productionBuild) {
        for (const name of sources.keys())
          if (!patched.has(name))
            throw new Error(
              `Calendar build did not include reviewed source ${name}`,
            );
      }
    },
  };
}
