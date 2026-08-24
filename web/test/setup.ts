// jsdom does not implement ResizeObserver, and the design kit's Tabs measure
// their strip with one at mount (controls/tabs). A test that renders any
// screen with a tab strip died on the missing global — so it exists here as a
// no-op: the tests assert rows and words, never measured pixel positions.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver
}

// jsdom has no CSS.escape either, and the kit's Command uses it to scroll the
// active row into view. The identifier-escape here follows the CSSOM rule
// closely enough for test ids (word characters survive, the rest is escaped).
if (typeof (globalThis as { CSS?: unknown }).CSS === "undefined") {
  ;(globalThis as { CSS?: unknown }).CSS = {}
}
const cssNs = (globalThis as { CSS: { escape?: (v: string) => string } }).CSS
if (typeof cssNs.escape !== "function") {
  cssNs.escape = (value: string) => String(value).replace(/[^a-zA-Z0-9_ -￿-]/g, (ch) => `\\${ch}`)
}
