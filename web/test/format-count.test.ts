// R16's NUMBER rules, locked hard: the ONE formatCount seam abbreviates at
// EVERY magnitude with no ceiling, always rounds DOWN (a badge never
// over-claims), renders NOTHING for zero/loading, and only a capped SEARCH
// total may ever grow a "+". The failure that earned it: a 24,011-row
// catalogue advertising "1000" — a capped list's length shown as a total.

import { describe, expect, it } from "vitest"

import { formatCount, formatSearchTotal, SEARCH_TOTAL_CAP } from "../lib/format-count"

describe("formatCount — exact totals, floored abbreviation, no ceiling", () => {
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

  it("abbreviates at EVERY magnitude — the canonical ladder", () => {
    expect(formatCount(1_000)).toBe("1k")
    expect(formatCount(1_349)).toBe("1.3k")
    expect(formatCount(24_011)).toBe("24k") // the catalogue that read "1000"
    expect(formatCount(400_000)).toBe("400k")
    expect(formatCount(1_200_000)).toBe("1.2m")
    expect(formatCount(2_200_000_000)).toBe("2.2b")
  })

  it("always rounds DOWN — a badge never over-claims", () => {
    expect(formatCount(1_999)).toBe("1.9k") // never "2k"
    expect(formatCount(9_999)).toBe("9.9k")
    expect(formatCount(10_999)).toBe("10k")
    expect(formatCount(999_999)).toBe("999k")
    expect(formatCount(1_999_999)).toBe("1.9m")
  })

  it("never produces a '+' — a collection total is always exact", () => {
    expect(formatCount(50_000_000)).not.toContain("+")
    expect(formatCount(SEARCH_TOTAL_CAP)).toBe("1m")
  })
})

describe("formatSearchTotal — the ONE place a '+' may appear", () => {
  it("caps at SEARCH_TOTAL_CAP as '1m+'", () => {
    expect(formatSearchTotal(SEARCH_TOTAL_CAP)).toBe("1m+")
    expect(formatSearchTotal(SEARCH_TOTAL_CAP + 5)).toBe("1m+")
  })
  it("below the cap it is the exact formatted total (and nothing for zero)", () => {
    expect(formatSearchTotal(134)).toBe("134")
    expect(formatSearchTotal(3_465)).toBe("3.4k")
    expect(formatSearchTotal(0)).toBe("")
  })
})
