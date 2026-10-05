/**
 * WebKit logs "Fetch API cannot load <url> due to access control checks." when
 * a navigation or reload cancels a read that is still in flight, and Playwright
 * reports that console line as a page error split at its first colon. The
 * application handled the cancelled read; nothing failed. Chromium tears the
 * page down silently.
 */
export function navigationCancelledRead(error) {
  return (
    /^Fetch API cannot load https?$/.test(error?.name ?? "") &&
    /due to access control checks\.$/.test(error?.message ?? "")
  );
}

/** Deliver page errors to a suite's listeners without that one report. */
export function withoutCancelledReads(context) {
  const newPage = context.newPage.bind(context);
  context.newPage = async (...options) => {
    const page = await newPage(...options);
    const on = page.on.bind(page);
    page.on = (event, listener) =>
      on(
        event,
        event === "pageerror"
          ? (error) => {
              if (!navigationCancelledRead(error)) listener(error);
            }
          : listener,
      );
    return page;
  };
  return context;
}
