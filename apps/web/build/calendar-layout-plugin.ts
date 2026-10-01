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
      `<script>\n    import {collectHiddenChunks, measureOnce} from ${JSON.stringify(geometry)};`,
    );
    source = replace(
      source,
      "contentFrom, empty, length, resizeObserver, runReposition",
      "contentFrom, empty, height, length, resizeObserver, runReposition",
    );
    source = replace(
      source,
      "runReposition(refs, chunks);",
      "runReposition(refs, chunks, measureOnce(height));",
    );
    return replace(
      source,
      "refs.forEach(ref => ref?.hide());",
      "const measure = measureOnce(height);\n        const hidden = collectHiddenChunks(hiddenChunks);\n        refs.forEach(ref => ref?.hide(measure, hidden.add));\n        hidden.publish();",
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
