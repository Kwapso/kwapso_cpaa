// THE TYPE MARK, LOOKED UP — one glyph per record type, read off the team's own
// dropdown values (UI-CONVENTIONS §5, amended 17 Aug 2026; UI-RULEBOOK G2).
//
// The fourth condition a type mark has to meet is that it is SET AS DATA rather
// than written into a component, so there is no map in this file: the glyph lives
// on the `selectable_data` row beside the word it marks, and a team changes it on
// the Dropdown values screen without a deploy. The starting glyphs are seeded in
// workers/tenancy/src/team-schema.ts, where every other starting vocabulary is.
//
// This is the read side, and it is deliberately forgiving. A team that has
// retired a type, typed a word of its own, or cleared a glyph gets no mark and
// the WORD carries the meaning on its own — which is condition three, and the
// reason a missing mark is never a missing fact.

import type { SelectableValue } from "@shared/types"

/** The groups a record type can come from. Written out so a caller cannot pass a
 * group that carries no marks and quietly get nothing back for ever. */
export const MARK_GROUP = {
  ticket: "Ticket type",
  story: "Story type",
  sprint: "Sprint type",
} as const

export type MarkGroup = (typeof MARK_GROUP)[keyof typeof MARK_GROUP]

/** The mark for one value in one group, or null. `value` is the word stored on
 * the record ("Question", "Fix", "Implementation"). */
export function typeMark(
  values: SelectableValue[] | undefined,
  group: MarkGroup,
  value: string | null | undefined
): string | null {
  if (!value) return null
  // ACTIVE ROWS ONLY. `Ticket type` in the live data holds ELEVEN rows for five
  // live words — retired duplicates of Bug, Extra, Feedback and Question, left by
  // a seed whose duplicate guard only ever checked live rows. So "the row with
  // this value" is not one row, and an unfiltered find answers from whichever
  // came first: a retired row with no glyph, hiding the live one that has one.
  const row = values?.find((v) => v.type === group && v.value === value && v.active)
  return row?.mark || null
}

/** Every mark in one group, keyed by its word — for a screen that renders a
 * whole collection and would otherwise scan the vocabulary once per row. */
export function markMap(
  values: SelectableValue[] | undefined,
  group: MarkGroup
): Map<string, string> {
  const out = new Map<string, string>()
  for (const v of values ?? []) {
    // Active only, for the reason `typeMark` gives — and last-write-wins here
    // would be the same coin flip in a different shape.
    if (v.type === group && v.active && v.mark) out.set(v.value, v.mark)
  }
  return out
}
