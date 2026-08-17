// R16's NUMBER rules, locked hard: the ONE formatCount seam abbreviates with a
// floored ladder (a badge never over-claims), renders NOTHING for zero/loading,
// and wears a "+" exactly where counting stopped. The failure that earned it: a
// 24,011-row catalogue advertising "1000" — a capped list's length shown as a total.
//
// AMENDED 2026-08-14. R16 used to say a collection total is ALWAYS exact and can
// never grow a "+". It now says a collection total is exact UP TO TOTAL_COUNT_CAP
// and says "at least" beyond it — because a `COUNT(*)` over a growing table is the
// one read in the product with no ceiling, and the exactness it bought above a
// thousand was precision the ladder immediately threw away (24,011 and 24,499 both
// render "24k").
//
// ONE CAP, NOT TWO. An earlier draft gave a collection its own, lower ceiling
// (50,000) beside the search ceiling (1,000,000). That was rejected: at 100,000
// rows a badge reading "50k+" tells a manager LESS than "100k" does, and two
// numbers that mean "where counting stopped" are two numbers that can drift. So
// both totals stop at TOTAL_COUNT_CAP, and this file proves they agree.

import { describe, expect, it } from "vitest"

import { TOTAL_COUNT_CAP } from "@shared/workers/limits"
import { formatCount, formatSearchTotal } from "@shared/web/format-count"

describe("formatCount — floored abbreviation, no ceiling until the cap", () => {
  it("renders NOTHING for zero and still-loading (never a '0' that reads as empty)", () => {
    expect(formatCount(0)).toBe("")
    expect(formatCount(undefined)).toBe("")
    expect(formatCount(null)).toBe("")
    expect(formatCount(-3)).toBe("")
    expect(formatCount(Number.NaN)).toBe("")
  })

  it("shows exact numbers below 1000", () => {
    expect(formatCount(1)).toBe("1")
    expect(formatCount(42)).toBe("42")
    expect(formatCount(999)).toBe("999")
  })

  it("abbreviates below the cap — the canonical ladder, UNCHANGED", () => {
    expect(formatCount(1_000)).toBe("1k")
    expect(formatCount(1_349)).toBe("1.3k")
    expect(formatCount(24_011)).toBe("24k") // the catalogue that read "1000"
    expect(formatCount(100_000)).toBe("100k") // the owner's question, answered exactly
    expect(formatCount(999_999)).toBe("999k")
  })

  it("always rounds DOWN — a badge never over-claims", () => {
    expect(formatCount(1_999)).toBe("1.9k") // never "2k"
    expect(formatCount(9_999)).toBe("9.9k")
    expect(formatCount(10_999)).toBe("10k")
    expect(formatCount(49_099)).toBe("49k")
  })

  it("BELOW THE CAP NOTHING CHANGED — byte for byte, which is the amendment's premise", () => {
    // The amendment is only allowed to cost what nobody can see. Every value the
    // product actually holds is below the cap by a factor of about four hundred
    // (the largest collection on staging, 14 Aug 2026, is the activity feed at
    // 2,253 rows), so this is the assertion that says the change is invisible today.
    for (const n of [1, 42, 999, 1_000, 2_253, 3_465, 24_011, 24_499, 49_999, 100_000, 999_999])
      expect(formatCount(n), `${n} must render exactly as it always did`).not.toContain("+")
    expect(formatCount(24_011), "and the two that made the case are still one badge").toBe(
      formatCount(24_499)
    )
  })

  it("AT the cap it says 'at least' — the one thing the amendment added", () => {
    expect(formatCount(TOTAL_COUNT_CAP)).toBe("1m+")
    expect(formatCount(TOTAL_COUNT_CAP + 1)).toBe("1m+")
    expect(formatCount(50_000_000)).toBe("1m+")
    // A collection holding EXACTLY the cap wears a "+" it has not quite earned:
    // over-claiming UNCERTAINTY by one row, never over-claiming SIZE. The same
    // direction the ladder already floors in.
  })

  it("the cap is IMPORTED, not restated — one number, every side", () => {
    // A door that stops counting at one number and a badge that starts hedging at
    // another produces the single output this seam exists to prevent: a total that
    // is quietly wrong and looks exact.
    expect(formatCount(TOTAL_COUNT_CAP - 1)).not.toContain("+")
    expect(formatCount(TOTAL_COUNT_CAP)).toContain("+")
  })
})

describe("formatSearchTotal — the same ceiling, a different question", () => {
  it("caps at TOTAL_COUNT_CAP as '1m+'", () => {
    expect(formatSearchTotal(TOTAL_COUNT_CAP)).toBe("1m+")
    expect(formatSearchTotal(TOTAL_COUNT_CAP + 5)).toBe("1m+")
  })

  it("below the cap it is the exact formatted total (and nothing for zero)", () => {
    expect(formatSearchTotal(134)).toBe("134")
    expect(formatSearchTotal(3_465)).toBe("3.4k")
    expect(formatSearchTotal(0)).toBe("")
  })

  it("AGREES WITH formatCount at every magnitude — one ceiling, not two", () => {
    // The amendment's whole safety argument is that there is ONE place in the
    // product where counting stops. Two formatters that could disagree about where
    // that is would reintroduce the drift the single constant exists to prevent —
    // so they are asserted equal rather than merely similar.
    for (const n of [0, 1, 999, 1_000, 24_011, 60_000, 400_000, 999_999, TOTAL_COUNT_CAP, 5_000_000])
      expect(formatSearchTotal(n), `both totals must stop in the same place at ${n}`).toBe(
        formatCount(n)
      )
  })

  it("the ladder is unchanged up to the cap", () => {
    expect(formatSearchTotal(1_000)).toBe("1k")
    expect(formatSearchTotal(24_011)).toBe("24k")
    expect(formatSearchTotal(999_999)).toBe("999k")
    expect(formatSearchTotal(1_999_999), "past the cap, so it hedges").toBe("1m+")
  })

  it("the 'b' rung still exists but nothing in the product can reach it", () => {
    // Worth saying out loud: the ladder still HAS the billions rung, and since both
    // public totals stop at a million, nothing can now produce one. If a third kind
    // of total ever needs it, it gets its own cap and its own function.
    expect(formatCount(2_200_000_000)).toBe("1m+")
  })
})
