// Small pure text helpers (unit-tested), used by the Clamp primitive.

/** Cut a string to at most `maxChars` characters, adding an ellipsis when it
 * was shortened. Trims trailing spaces before the ellipsis. */
export function truncateText(text: string, maxChars: number): string {
  if (maxChars < 0 || text.length <= maxChars) return text
  return text.slice(0, maxChars).trimEnd() + "…"
}
