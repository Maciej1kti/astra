import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../../apps/web/src/lib/markdown.ts";

test("Markdown renders formatting while disabling executable HTML and remote images", () => {
  const html = renderMarkdown('# Heading\n\n**Strong**\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![tracking](https://tracker.invalid/pixel)\n\n[unsafe](javascript:alert(1))\n\n[data](data:text/html;base64,PHNjcmlwdD4=)\n\n[local](file:///etc/passwd)\n\n[safe](https://example.com/)');
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>Strong<\/strong>/);
  assert.doesNotMatch(html, /<(script|img|iframe|object|svg)\b/i);
  assert.doesNotMatch(html, /href="(?:javascript|data|file):/i);
  assert.match(html, /href="https:\/\/example.com\/" rel="noopener noreferrer" target="_blank"/);
});
