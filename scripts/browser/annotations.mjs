/** Workflow annotations: a failed suite is readable without opening its log. */
const LIMIT = 3000;

function escape(text) {
  return text
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

/** One `::error` command naming the suite and the part of its output that failed. */
export function failureAnnotation(suite, output) {
  let detail = String(output).trimEnd();
  if (detail.length > LIMIT) {
    // Keep failing scenarios, then the end of the log, where a crash is.
    const failed = detail
      .split("\n")
      .filter((line) => line.includes('"status":"fail"'))
      .join("\n")
      .slice(0, LIMIT / 2);
    const tail = detail.slice(failed.length - LIMIT);
    detail = failed ? `${failed}\n…${tail}` : `…${tail}`;
  }
  return `::error title=Browser suite ${suite} failed::${escape(detail)}`;
}

export function annotateFailure(suite, output) {
  if (process.env.GITHUB_ACTIONS) console.log(failureAnnotation(suite, output));
}
