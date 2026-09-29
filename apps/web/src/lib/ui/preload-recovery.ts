import { mapReads } from "../api/read-requests";

const failed = new Set<string>();

/** Observe only local build assets; document content cannot supply fetch targets. */
export function observePreloadFailures() {
  const error = (event: Event) => {
    const link = event.target;
    if (
      !(link instanceof HTMLLinkElement) ||
      !["modulepreload", "stylesheet"].includes(link.rel)
    )
      return;
    const url = new URL(link.href);
    if (
      url.origin === location.origin &&
      /^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname) &&
      failed.size < 16
    )
      failed.add(url.href);
  };
  window.addEventListener("error", error, true);
  return () => window.removeEventListener("error", error, true);
}

/** Called only by the user's reload action; existing beforeunload guards apply. */
export async function reloadAfterPreloadFailure() {
  // WebKit can retain a failed modulepreload across reloads (bug 270357).
  // Revalidating those few assets evicts the failed response before a new page
  // creates its module map. This never reloads automatically over a draft.
  const signal = AbortSignal.timeout(5_000);
  try {
    await mapReads(
      [...failed],
      async (url) => {
        try {
          const response = await fetch(url, { cache: "reload", signal });
          if (response.ok) await response.arrayBuffer();
        } catch {
          // A new document may name newer assets even if an old one is gone.
        }
      },
      signal,
    );
  } catch {
    // The bounded attempt can time out; a reload is still the requested action.
  } finally {
    location.reload();
  }
}
