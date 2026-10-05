import MarkdownIt from "markdown-it";

// No raw HTML, image fetching, plugins or executable syntax highlighting.
const parser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  maxNesting: 20,
});
parser.disable("image");
parser.validateLink = (url: string) => /^https?:\/\//i.test(url);
parser.renderer.rules.link_open = (
  tokens,
  index,
  options,
  _environment,
  renderer,
) => {
  const link = tokens[index];
  link?.attrSet("rel", "noopener noreferrer");
  link?.attrSet("target", "_blank");
  return renderer.renderToken(tokens, index, options);
};
export function renderMarkdown(source: string): string {
  return parser.render(source);
}
