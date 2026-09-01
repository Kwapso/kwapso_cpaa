import * as React from "react"

/** A RECORD'S OWN NAME, AT THE HEADING STEP, CLAMPED TO TWO LINES.
 *
 * THE FAULT, 1 Sep 2026. A ticket detail opened with roughly 1,800 characters of
 * German prose set at the h3 heading step, filling the whole viewport before a
 * single field of the record. Measured rather than guessed: on staging's Kwapso
 * team database the `help` table holds 2,050 rows, 1,040 of them with no English
 * title and 286 with no title in either language — and the screen falls back to
 * the DESCRIPTION when a ticket has no title. Genuinely long titles barely
 * exist (six over 120 characters in the whole table). So this is a MISSING-TITLE
 * problem wearing a long-title costume, and the two halves get two fixes: the
 * backfill is its own item, and this is the one that stops any record — today's
 * or tomorrow's — from spending a screen on its own first line.
 *
 * THE RULE IT OBEYS: a clamped name stays reachable in full. Two ways, both
 * here rather than argued per screen — the record's own body still renders the
 * whole text (a ticket's description is the conversation's first message), and
 * the clamped node carries the full string as its `title` attribute, so a
 * pointer reveals it and a screen reader still reads the record's own name.
 *
 * WHY A STRING AND NOT EVERY NODE. The record heading slot takes a ReactNode,
 * and a loading screen passes a `<Skeleton>` through the same prop. Clamping
 * that would set `display:-webkit-box` on a sized placeholder and squash it.
 * A record's NAME is a string; anything else in that slot is chrome, so the
 * discriminator is positional exactly as R20's is — no call site has to
 * remember which of the two it is passing.
 *
 * NO KIT EDIT. `shared/ui/` is a pinned dependency (a hand-edit turns the build
 * red), and the kit's `Title` deliberately sets `min-w-0` and does not clamp —
 * a section header is not always a record's name. So the clamp is applied
 * APP-SIDE, on the node the app hands the kit, in the two places the app has a
 * record heading at all: `web/components/record-chrome.tsx` (the twelve bespoke
 * detail screens) and `shared/web/screen-engine/screen-renderer.tsx` (every
 * recipe-driven detail, on both front doors).
 *
 * `line-clamp-2` is a plain Tailwind utility — no colour (R32), no radius
 * (R31), no page width (R29) and no UI package (R39). `break-words` is the
 * companion for the one case a clamp alone cannot hold: a single unbroken token
 * (a pasted URL) longer than the column. */
export function clampRecordHeading(title: React.ReactNode): React.ReactNode {
  if (typeof title !== "string") return title
  return (
    <span className="line-clamp-2 break-words" title={title}>
      {title}
    </span>
  )
}
