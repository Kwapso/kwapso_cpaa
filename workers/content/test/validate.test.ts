// The INPUT-BOUNDARY contract (shared/workers/validate.ts). Adversarial probing of
// staging found that the old `body.field?.trim()` pattern threw a TypeError → 500
// on a non-string / over-long / NUL-containing value instead of a clean 400. These
// helpers are the fix; this test locks their behavior so the 500s can't come back.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { GuardError } from "@shared/workers/gating"
import { MENTIONS_LIMIT } from "@shared/workers/limits"
import { dataUrlBytes, MAX_IMAGE_BYTES } from "@shared/workers/image"
import { imageFieldLimit, optionalMark, optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"

const NUL = String.fromCharCode(0)

function thrown(fn: () => unknown): GuardError | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof GuardError ? e : null
  }
}

describe("requireText", () => {
  it("returns the trimmed string for valid input", () => {
    expect(requireText("  hello  ", "Field")).toBe("hello")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [12345, ["a"], { x: 1 }, true, null, undefined]) {
      const err = thrown(() => requireText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
      expect(err?.code).toBe("invalid_input")
    }
  })

  it("throws a 400 for blank / whitespace-only", () => {
    expect(thrown(() => requireText("", "Field"))?.status).toBe(400)
    expect(thrown(() => requireText("   ", "Field"))?.status).toBe(400)
  })

  it("throws a 400 when over the length cap", () => {
    const ok = "a".repeat(TEXT_LIMITS.short)
    expect(requireText(ok, "Field", TEXT_LIMITS.short)).toBe(ok)
    expect(thrown(() => requireText("a".repeat(TEXT_LIMITS.short + 1), "Field", TEXT_LIMITS.short))?.status).toBe(400)
  })

  it("strips embedded NUL bytes (SQLite rejects them → was a 500)", () => {
    expect(requireText(`a${NUL}b`, "Field")).toBe("ab")
  })
})

describe("optionalText", () => {
  it("maps null/undefined/blank to undefined", () => {
    expect(optionalText(undefined, "Field")).toBeUndefined()
    expect(optionalText(null, "Field")).toBeUndefined()
    expect(optionalText("   ", "Field")).toBeUndefined()
  })

  it("returns the trimmed string for a present value, NULs stripped", () => {
    expect(optionalText("  hi  ", "Field")).toBe("hi")
    expect(optionalText(`x${NUL}y`, "Field")).toBe("xy")
  })

  it("throws a 400 GuardError for non-string types (the 500 bug)", () => {
    for (const bad of [5, ["a"], { a: 1 }, true]) {
      const err = thrown(() => optionalText(bad, "Field"))
      expect(err, `non-string ${JSON.stringify(bad)} must be a clean 400`).toBeInstanceOf(GuardError)
      expect(err?.status).toBe(400)
    }
  })

  it("throws a 400 when over the length cap", () => {
    expect(thrown(() => optionalText("a".repeat(TEXT_LIMITS.long + 1), "Field", TEXT_LIMITS.long))?.status).toBe(400)
  })
})

// R20, THE CLIENT'S RULING (2026-08-31): a live example reached staging — a
// warning sign saved as the "Issue" ticket kind's mark — because the write door
// used bare `optionalText`, which type-checks and caps length and was never
// asked to refuse a GLYPH. `optionalMark` is the fix; this locks it against the
// exact character that got through, plus the multi-code-point shapes named in
// its own comment (a flag's Regional_Indicator pair, a variation selector).
describe("optionalMark — optionalText plus 'no emoji'", () => {
  // Named by codepoint rather than pasted as a literal character, the same way
  // `optionalMark`'s own comment and UI-RULEBOOK.md name a glyph.
  const warningSign = String.fromCodePoint(0x26a0, 0xfe0f) // the exact glyph that reached staging
  const usFlag = String.fromCodePoint(0x1f1fa, 0x1f1f8) // a Regional_Indicator PAIR, not Extended_Pictographic on its own
  const thumbsUpWithSkinTone = String.fromCodePoint(0x1f44d, 0x1f3fb) // a base glyph + a modifier, two code points, one emoji

  it("throws a 400 for a bare pictograph — the exact bug reported on staging", () => {
    const err = thrown(() => optionalMark(warningSign, "Mark"))
    expect(err).toBeInstanceOf(GuardError)
    expect(err?.status).toBe(400)
    expect(err?.message).toBe("Mark should be a short word or initial, not an emoji.")
  })

  it("throws a 400 for a flag (a Regional_Indicator pair, no Extended_Pictographic code point involved)", () => {
    expect(thrown(() => optionalMark(usFlag, "Mark"))?.status).toBe(400)
  })

  it("throws a 400 for a multi-code-point emoji (base glyph + skin-tone modifier)", () => {
    expect(thrown(() => optionalMark(thumbsUpWithSkinTone, "Mark"))?.status).toBe(400)
  })

  it("throws a 400 for an emoji sitting beside ordinary text, not just a bare one", () => {
    expect(thrown(() => optionalMark(`Issue ${warningSign}`, "Mark"))?.status).toBe(400)
  })

  it("accepts a normal short word or initial", () => {
    expect(optionalMark("IS", "Mark")).toBe("IS")
    expect(optionalMark("Voucher", "Mark", TEXT_LIMITS.short)).toBe("Voucher")
  })

  it("still maps null/undefined/blank to undefined, and still enforces the length cap (both optionalText's jobs)", () => {
    expect(optionalMark(undefined, "Mark")).toBeUndefined()
    expect(optionalMark("   ", "Mark")).toBeUndefined()
    expect(thrown(() => optionalMark("a".repeat(TEXT_LIMITS.tiny + 1), "Mark"))?.status).toBe(400)
  })
})

describe("queryText — the QUERY half of the same boundary", () => {
  it("caps by default at the short limit (an id/cursor/facet is short)", () => {
    const ok = "a".repeat(TEXT_LIMITS.short)
    expect(queryText(ok, "Id")).toBe(ok)
    const err = thrown(() => queryText("a".repeat(TEXT_LIMITS.short + 1), "Id"))
    expect(err, "an over-long query parameter must be a clean 400, not a giant SQL string").toBeInstanceOf(GuardError)
    expect(err?.status).toBe(400)
  })

  it("maps a missing/blank parameter to undefined, and trims + strips NULs", () => {
    expect(queryText(null, "Id")).toBeUndefined()
    expect(queryText("", "Id")).toBeUndefined()
    expect(queryText("   ", "Id")).toBeUndefined()
    expect(queryText("  01H  ", "Id")).toBe("01H")
    expect(queryText(`a${NUL}b`, "Id")).toBe("ab")
  })
})

// THE CAP ON A PICTURE FIELD. This is the one that shipped wrong: the account
// and app logo doors capped a picked image with `TEXT_LIMITS.long`, the PROSE
// cap, so a 512px JPEG — the exact thing the browser's picker produces — was
// refused as "Logo is too long (max 20000 characters)" one line before the seam
// that would have stored it. It survived a green build because the suite that
// proves a logo becomes an object used a ONE-PIXEL PNG, which is 110 characters.
// So the number is locked against the byte cap it must clear, in both
// directions: big enough for a real photo, and NOT big enough to let megabytes
// of something-that-is-not-an-image into a column read on every list row.
describe("imageFieldLimit — a picture is measured as a picture, a path as a link", () => {
  it("clears the store seam's own byte cap for a data URL, so the bytes decide", () => {
    // A data URL carrying MAX_IMAGE_BYTES of image must fit under the character
    // cap — otherwise the refusal happens here, in the wrong units, and
    // `storeImageDataUrl` never sees the picture.
    const biggest = `data:image/jpeg;base64,${"A".repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4)}`
    expect(dataUrlBytes(biggest)).toBeGreaterThanOrEqual(MAX_IMAGE_BYTES)
    expect(biggest.length).toBeLessThanOrEqual(imageFieldLimit(biggest))
    expect(optionalText(biggest, "Logo", imageFieldLimit(biggest))).toBe(biggest)
  })

  it("takes a real picked logo, the size the door actually refused", () => {
    // ~60 KB of base64 — a downsized 512px JPEG, three times over the prose cap.
    const picked = `data:image/jpeg;base64,${"A".repeat(60_000)}`
    expect(picked.length, "the case that was failing must still be over the prose cap").toBeGreaterThan(
      TEXT_LIMITS.long
    )
    expect(optionalText(picked, "Logo", imageFieldLimit(picked))).toBe(picked)
  })

  it("holds a stored path to the link cap — a column is not a place for megabytes", () => {
    expect(imageFieldLimit("/media/T/accounts/01H?v=1")).toBe(TEXT_LIMITS.link)
    // Anything that is not a data URL passes THROUGH the store seam untouched
    // and lands in the column, so a single generous cap for both would have put
    // the row-bloat back that this whole file exists to stop.
    const huge = "x".repeat(TEXT_LIMITS.link + 1)
    expect(thrown(() => optionalText(huge, "Logo", imageFieldLimit(huge)))?.status).toBe(400)
  })

  it("judges the value, never the field it arrived in (a non-string is still a 400)", () => {
    for (const bad of [12345, ["a"], { x: 1 }, true]) {
      expect(imageFieldLimit(bad)).toBe(TEXT_LIMITS.link)
      expect(thrown(() => optionalText(bad, "Logo", imageFieldLimit(bad)))?.status).toBe(400)
    }
  })
})

/* ------------------------------------------------------------------------- */

const ROOT = join(__dirname, "..", "..", "..") // repo root (workers/content/test → .)

/** Every route-handler source in the workers that own team data. auth / mcp /
 * realtime are excluded on purpose: they parse no team query parameter into a
 * statement, and each is another lane's file — a scan that reaches into them
 * would couple this check to work it doesn't guard. */
const ROUTE_DIRS = [
  "workers/tenancy/src/routes",
  "workers/content/src/routes",
  "workers/data-ops/src/routes",
]

/** The name of the function call `at` sits inside: walk back to the first
 * unmatched `(`, then read the identifier in front of it. "" when nothing encloses. */
function enclosingCall(src: string, at: number): string {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    if (src[i] === ")") depth++
    else if (src[i] === "(") {
      if (depth === 0) return /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(0, i))?.[1] ?? ""
      depth--
    }
  }
  return ""
}

describe("no query parameter reaches a handler uncapped", () => {
  it("every searchParams.get() in a route is wrapped by the queryText seam", () => {
    const offenders: string[] = []
    let seen = 0
    for (const dir of ROUTE_DIRS) {
      for (const { rel: name, source: src } of sourceFiles(join(ROOT, dir), { extensions: [".ts"] })) {
        for (const m of src.matchAll(/searchParams\.get\(/g)) {
          seen++
          // The call this one sits INSIDE must be the seam. `Number(...)` is the one
          // other honest wrapper — a numeric parse can't carry length into a
          // statement. (Read the enclosing name rather than the 120 chars before:
          // `queryText(new URL(request.url).searchParams.get(` has its own parens
          // in between, and a text-window regex quietly mis-reads that as unwrapped.)
          if (["queryText", "Number"].includes(enclosingCall(src, m.index))) continue
          const line = src.slice(0, m.index).split("\n").length
          offenders.push(`${dir}/${name}:${line}`)
        }
      }
    }
    // Tripwire: a scan that finds nothing reports "all clear" like a passing one.
    expect(seen, "the query-parameter scan found no searchParams.get calls — it has gone blind").toBeGreaterThan(10)
    expect(
      offenders,
      `a query parameter is read raw — put it through queryText() so an over-long value is a 400, not a 500: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("a help reply's @mentions are capped (an unbounded list is an unbounded send)", () => {
    const src = readFileSync(join(ROOT, "workers/content/src/routes/help.ts"), "utf8")
    expect(src, "the mention list must be de-duped before it is counted").toMatch(
      /new Set\(body\.taggedUserIds\.filter/
    )
    expect(src, "the mention list must be refused past MENTIONS_LIMIT").toMatch(
      /tagged\.length > MENTIONS_LIMIT/
    )
    expect(MENTIONS_LIMIT).toBeGreaterThan(0)
  })
})
