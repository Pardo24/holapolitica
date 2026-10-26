/**
 * A page title that fits a search result (~60 characters with the
 * " · Hola Política" the layout adds, so 48 here): cut at a word,
 * with an ellipsis. Longer ones were truncated by the search engine
 * anywhere, often mid-word (a vote's title ran to 98 characters).
 */
export function shortTitle(text: string, max = 48): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·-]+$/, '')}…`;
}
