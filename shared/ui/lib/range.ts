// Range — the compact "min..max" string a `control:"range"` FilterFacet reports.
// It rides the collection's existing `facetValues` (one plain string per field),
// so a numeric range needs NO new plumbing through CollectionFrame.
//
// Either side may be empty: "10..20" = both · "10.." = min only · "..20" = max
// only · "" = cleared. Pure + unit-tested, and shared by two callers that live in
// different layers: the FilterBar control (a primitive) and `selectRows` (lib),
// which compiles it to inclusive `gte`/`lte` rules. That shared use is why this
// lives in lib — a primitive may import lib, but lib may never import a primitive.

export interface NumericRange {
  min: number | null
  max: number | null
}

const SEP = ".."

function toNum(raw: string): number | null {
  const t = raw.trim()
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Parse "10..20" → { min: 10, max: 20 }. A missing or non-numeric side → null. */
export function parseRange(value: string): NumericRange {
  if (!value || !value.includes(SEP)) return { min: null, max: null }
  const [rawMin = "", rawMax = ""] = value.split(SEP)
  return { min: toNum(rawMin), max: toNum(rawMax) }
}

/** Format { min, max } → "10..20". Both null → "" (the cleared value). */
export function formatRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return ""
  return `${min ?? ""}${SEP}${max ?? ""}`
}
