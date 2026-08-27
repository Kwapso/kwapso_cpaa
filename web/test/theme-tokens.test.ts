// THE TWO DARK BLOCKS SAY THE SAME THING, OR THE BUILD GOES RED.
//
// The design kit's `tokens/tokens.css` defines dark twice, on purpose, and the
// kit's own build script enforces the same thing upstream — but that script
// runs in the kit's repo, not this one, and a vendored copy is exactly the
// place a hand-edit or a bad sync could split them. So the APP asserts it too:
//
//   :root[data-theme="dark"]              an explicit choice
//   @media (prefers-color-scheme: dark)   a viewer who never chose
//
// One block cannot be dropped. `data-theme` is what the kit's ModeToggle
// writes, so it is what decides the theme in practice; the media query is what
// makes an explicit LIGHT choice survive a dark operating system, because of
// its `:not()` guard.
//
// WHY IT NEEDS A TEST RATHER THAN A CAREFUL DEVELOPER. A token defined in only
// one of them renders differently for "system dark" than for "I picked dark" —
// two states nobody tests side by side, on a machine that is usually in one of
// them. The kit's own words for that class of bug: "miserable to find by eye".
// The failure is silent, it is per-token, and it survives every screenshot taken
// by somebody whose laptop is set the way theirs is set.
//
// It compares DECLARATIONS, not text, so re-ordering or re-commenting either
// block is free and only a changed VALUE is a failure.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const CSS = readFileSync(join(ROOT, "shared", "ui", "foundations", "tokens", "tokens.css"), "utf8")

/** Every `--token: value` inside one brace-balanced block, as a sorted map. */
function declarations(startAt: number): Map<string, string> {
  const open = CSS.indexOf("{", startAt)
  let depth = 0
  let i = open
  for (; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++
    else if (CSS[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  const body = CSS.slice(open + 1, i)
  const out = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.replace(/\/\*[\s\S]*?\*\//g, "").trim())
  }
  return out
}

describe("the theme's two dark blocks", () => {
  it("theme-tokens: an explicit dark choice and a dark system resolve identically", () => {
    const explicit = declarations(CSS.indexOf(':root[data-theme="dark"]'))
    const media = declarations(CSS.indexOf(':root:not([data-theme="light"])'))

    // Neither may go blind: a selector that stopped matching would leave both
    // maps empty and this test would pass by finding nothing.
    expect(explicit.size, "the explicit dark block was not found — has its selector changed?").toBeGreaterThan(20)
    expect(media.size, "the prefers-color-scheme dark block was not found — has its selector changed?").toBeGreaterThan(20)

    const onlyExplicit = [...explicit.keys()].filter((k) => !media.has(k))
    const onlyMedia = [...media.keys()].filter((k) => !explicit.has(k))
    expect(
      onlyExplicit,
      `these are set for an explicit dark choice but NOT for a dark system, so a viewer who never chose gets the light value:\n  ${onlyExplicit.join("\n  ")}`
    ).toEqual([])
    expect(
      onlyMedia,
      `these are set for a dark system but NOT for an explicit dark choice, so picking dark on a light machine gets the light value:\n  ${onlyMedia.join("\n  ")}`
    ).toEqual([])

    const differ = [...explicit].filter(([k, v]) => media.get(k) !== v).map(([k, v]) => `${k}: ${v} vs ${media.get(k)}`)
    expect(
      differ,
      `these resolve to DIFFERENT values in the two dark blocks:\n  ${differ.join("\n  ")}`
    ).toEqual([])
  })

  it("theme-tokens: light is defined on bare :root, never only in a media query", () => {
    // The kit's second standing rule. A colour whose only definition sits inside
    // `@media (prefers-color-scheme: dark)` has no light value at all, so it
    // falls back to whatever it inherits and the light theme quietly loses a
    // token. Checked by asserting every dark token has a light counterpart.
    // The kit spreads its light declarations across SEVERAL bare `:root`
    // blocks (surfaces, type, spacing, per-section), so light is the union of
    // every `:root {` that sits OUTSIDE a media query.
    const light = new Map<string, string>()
    for (let at = CSS.indexOf(":root {"); at !== -1; at = CSS.indexOf(":root {", at + 1)) {
      // inside a media query? count unbalanced braces before this point that
      // belong to an @media wrapper.
      const before = CSS.slice(0, at)
      const opens = (before.match(/@media[^{]*\{/g) ?? []).length
      let depth = 0
      for (const ch of before) {
        if (ch === "{") depth++
        else if (ch === "}") depth--
      }
      if (opens > 0 && depth > 0) continue
      for (const [k, v] of declarations(at)) if (!light.has(k)) light.set(k, v)
    }
    const dark = declarations(CSS.indexOf(':root[data-theme="dark"]'))
    expect(light.size, "the light blocks were not found — has the selector changed?").toBeGreaterThan(20)

    const darkOnly = [...dark.keys()].filter((k) => !light.has(k))
    expect(
      darkOnly,
      `these are defined for dark and never for light, so they have no value at all on a light screen:\n  ${darkOnly.join("\n  ")}`
    ).toEqual([])
  })
})
