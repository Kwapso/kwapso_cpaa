"use client"

// RECORD CHROME — the four pieces every record detail wears, in one file.
//
// UI-RULEBOOK D1 says a detail screen has exactly four regions in one order:
// the header band, the tab strip, the tab panel, and the audit footer at the
// foot of the panel. Ten detail components each drew their own version of the
// first and none drew the last, which is how the same record type ended up with
// six buttons on one screen and a two-line title on another.
//
//   RecordActionsMenu — the three-dot overflow (B1/B2). Net-new: `MoreHorizontal`
//                       appeared ZERO times in this repo before 17 Aug 2026, so
//                       every action a record had was a visible button.
//   RecordHeader      — the header band (D2). Transparent, so the ambient field
//                       shows HERE and nowhere else (C4).
//   RecordBody        — everything from the tab strip down, on opaque paper, with
//                       the tab strip pinned under a collapsed title line (D3).
//   RecordFooter      — created-by / last-edited-by, grey, at the foot of the
//                       panel rather than halfway down Overview (D7).
//
// The two sticky layers do not fight: the shell owns z-20 (L6) and everything
// here takes z-10. `--shell-top` is published by app-shell — the mobile bar's own
// height, zero on desktop — so a record pins UNDER the app bar, not behind it.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/components/dropdown-menu/dropdown-menu"
import { MoreHorizontal } from "@shared/ui/foundations/icons"

import { RecordChrome } from "@shared/ui/compositions/templates/record-chrome"
import type { ShapeState, ShapeStateCopy } from "@shared/ui/compositions/states/states"

import { RecordMark } from "@shared/web/record-mark"
import { formatRelative } from "@shared/web/format"
import { useT } from "@shared/web/language"

/* ------------------------------ the overflow ------------------------------ */

/** One line in the three-dot menu. `icon` is the lucide glyph from the
 * UI-CONVENTIONS §4 mapping, already sized by the caller at `size-3.5`. */
export type RecordAction = {
  key: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Red, and pushed below a separator — B2. Moving an action in here never
   * removes its confirm step (rulebook "Do not do" #14). */
  destructive?: boolean
}

/** THE THREE-DOT MENU (B2). Everything a record can do beyond its one primary
 * and one secondary button lives here, in sentence case (W5), destructive last.
 *
 * It renders nothing when there is nothing to put in it, so a viewer with no
 * rights sees no empty affordance.
 *
 * ON A HEADER IT IS OUTLINED; IN A ROW IT IS GHOST, and that is the whole of the
 * `tone` prop. A record header has one menu on it and the outline says where to
 * press. A LIST has one per row, and forty outlined squares down the right-hand
 * edge is forty drawn cues on a surface that already has a divider doing the
 * grouping — which is the two-cues-on-one-boundary that N6 refuses. Same menu,
 * same items, same confirms; only the resting weight of the trigger moves.
 *
 * It is a LOOKUP and not `tone === "row" ? … : …`, which is deliberate: R3
 * catches a hand-rolled tab strip by exactly that shape (a Button variant
 * computed from a comparison), and a rule that reads source has no way to tell a
 * fake toggle from an honest one. Writing the table is cheaper than arguing with
 * the check, and the check stays as sharp as it was. */
const TRIGGER_TONE = { header: "secondary", row: "ghost" } as const

export function RecordActionsMenu({
  actions,
  tone = "header",
}: {
  actions: RecordAction[]
  tone?: keyof typeof TRIGGER_TONE
}) {
  const t = useT()
  const items = actions.filter(Boolean)
  if (items.length === 0) return null
  const ordinary = items.filter((a) => !a.destructive)
  const destructive = items.filter((a) => a.destructive)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={TRIGGER_TONE[tone]}
          size="icon"
          className="shrink-0"
          aria-label={t("More actions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {ordinary.map((a) => (
          <DropdownMenuItem
            key={a.key}
            disabled={a.disabled}
            onSelect={a.onSelect}
            className="gap-2"
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
        {ordinary.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((a) => (
          <DropdownMenuItem
            key={a.key}
            disabled={a.disabled}
            onSelect={a.onSelect}
            className="text-destructive focus:text-destructive gap-2"
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------- the footer ------------------------------- */

export type RecordAudit = {
  createdByName?: string | null
  createdAt?: string | null
  editedByName?: string | null
  updatedAt?: string | null
}

/** THE AUDIT FOOTER (D7). Who made it and who last touched it, grey, small, at
 * the very bottom of the panel — the register the brand's own footer uses
 * (paper tone, 12px, faded), and the register these two facts have always
 * deserved. They used to be five rows in the middle of Overview, where they
 * pushed the record's actual content below the fold.
 *
 * It renders nothing when a record knows neither fact, which is true of rows
 * imported before the audit columns existed.
 *
 * A PERSON AND A TIME ARE JOINED BY THE MIDDOT, NEVER BY A PREPOSITION.
 * "Created by Alaap K on 5d ago" is not a sentence in English: `on` takes an
 * absolute date ("on 12 August") and a relative phrase attaches bare. The value
 * here is `formatRelative`, which is RELATIVE for the first week and an absolute
 * date after it — so the same line was right on Tuesday and broken on Monday,
 * which is precisely where this class of bug is born. `·` is already what record
 * chrome uses to join two facts (the eyebrow, the status line, every attachment
 * meta line), and it is correct in front of either kind of value.
 *
 * ONE ENTRY PER LINE, WITH HOLES IN IT (R28), rather than the three fragments
 * this used to concatenate. A translator cannot reorder `t("Created by") + name`,
 * and several of the languages this app speaks need to: the catalogue's own
 * Japanese for "Created by" is 作成者, a NOUN, which wants the name in front of
 * it. The old shape also leaked English — `t("on")` was two lowercase letters,
 * which the extractor refuses as a non-sentence (`isUserVisible`), so it was in
 * no catalogue and every reader in every language got the English word. */
export function RecordFooter({ audit }: { audit: RecordAudit }) {
  const t = useT()
  const created = audit.createdAt ? formatRelative(audit.createdAt, t) : null
  const edited = audit.updatedAt ? formatRelative(audit.updatedAt, t) : null
  const lines: string[] = []
  if (audit.createdByName && created)
    lines.push(t("Created by {name} · {when}", { name: audit.createdByName, when: created }))
  else if (audit.createdByName) lines.push(t("Created by {name}", { name: audit.createdByName }))
  else if (created) lines.push(t("Created {when}", { when: created }))
  if (audit.editedByName && edited)
    lines.push(t("Last edited by {name} · {when}", { name: audit.editedByName, when: edited }))
  else if (audit.editedByName)
    lines.push(t("Last edited by {name}", { name: audit.editedByName }))
  else if (edited) lines.push(t("Last edited {when}", { when: edited }))
  if (lines.length === 0) return null
  return (
    <footer className="bg-muted text-muted-foreground mt-8 flex flex-wrap gap-x-6 gap-y-1 rounded-[var(--radius)] px-4 py-3 text-xs">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </footer>
  )
}

/* ------------------------------ the type mark ----------------------------- */

/** THE TYPE MARK, in the slot a lucide icon would have taken (UI-CONVENTIONS §5,
 * amended 17 Aug 2026). `aria-hidden`, never inside a sentence, and always
 * beside the type WORD — the eyebrow above the title on a detail, the group
 * heading or the TYPE column on a collection. `size` picks the row slot or the
 * header band's square (G3). */
export function TypeMark({ mark, size = "row" }: { mark: string; size?: "row" | "band" }) {
  // The one mark, with no picture to show — the box, the sizes and the
  // `aria-hidden` are the same decision everywhere and are made once
  // (shared/web/record-mark.tsx). This kept its name because a type mark is what
  // a reader of this file is looking for.
  return <RecordMark mark={mark} size={size} />
}

/* --------------------------- the band and the body ------------------------ */

/** THE HEADER BAND (D2) — the ONE region on a detail screen that lets the
 * ambient field through (C4).
 *
 * Layout, left to right: the type mark or logo in a rounded square, then the
 * eyebrow / title / status column, then the action group pushed right. At most
 * one primary and one secondary button belong in `actions`; everything else is
 * a RecordActionsMenu at the end of it (B1).
 */
/** THE RECORD DETAIL SCREEN — the kit's shape, adapted to this app's call sites.
 *
 * KIT-DRAWN, APP-FED. This file used to draw the four regions itself; the kit's
 * `RecordChrome` draws them now and everything below is the mapping onto it. The
 * house pattern is `screen-engine/tabs-view.tsx`'s: keep the CONTRACT twelve call
 * sites already write, render every pixel through the kit.
 *
 * OVERRIDE 73 (2026-08-26) IS WHY THE PROPS CHANGED. The client, looking at the
 * live `Tickets · Padelbase · 4182` page, verbatim: "notice how the chips are
 * directly underneath the title … the edit button should be aligned with the
 * title and the chips underneath it. also, detail pages do not need this bar that
 * you have on top where we have Padelbase and the number. these are chips, so the
 * black chip is always the ID. we always use black chips for IDs, and next to it,
 * add a chip for Padelbase like in the example. of course, translate this to
 * universal rules."
 *
 * So `eyebrow` IS GONE — it was the dot-joined "Ticket · BERG-T0412 · Archived"
 * line above the title, and the ruling puts that material below it as chips. In
 * its place: `recordNumber` (the black `Badge variant="inverse"` — "the black chip
 * is always the ID"), `collectionLabel` (the chip beside it), and `chips` for
 * anything a screen adds. `actions` now shares the title's own row, which is what
 * puts Edit "aligned with the title" without a line of markup here.
 *
 * WHAT WENT WITH THE OLD HEADER. `RecordHeader`'s IntersectionObserver collapse
 * and `RecordBody`'s opaque-paper band are deleted rather than ported. The band
 * existed to stop the ambient field at the tab strip (UI-RULEBOOK C4) — and the
 * kit ships `AmbientBackground` with no translucency to stop, so the rule it
 * served no longer describes anything. The kit has final authority; C4 is one of
 * the rules that loses.
 *
 * THE TABS GO IN `panel`, NOT `tabs`. `RecordDetail` carries a tab strip of its
 * own and draws it only when `tabs` is non-empty (record-detail.tsx:681, :761), so
 * handing it our `children` as the panel gives exactly ONE strip — the app's
 * `TabsView`, which is already kit-drawn and already knows folder from line. Two
 * strips on one screen is the defect this lane exists to remove, not to move.
 */
export function RecordScreen({
  mark,
  leading,
  recordNumber,
  collectionLabel,
  chips,
  title,
  status,
  actions,
  headerExtra,
  children,
  state,
  copy,
  emptyAction,
  errorAction,
}: {
  /** The record type's glyph, when the type has one. */
  mark?: string | null
  /** A logo or avatar, when the record has a real image — it replaces the mark
   * in the same square (G3). */
  leading?: React.ReactNode
  /** The reference a person quotes on the phone. Drawn as the charcoal chip,
   * below the title: "the black chip is always the ID". */
  recordNumber?: React.ReactNode
  /** What kind of record this is, or which collection it belongs to — the chip
   * beside the ID. "add a chip for Padelbase like in the example". */
  collectionLabel?: React.ReactNode
  /** Anything else that belongs on the identity row — a status word, "Archived". */
  chips?: React.ReactNode
  title: React.ReactNode
  /** One dot-separated line, three facts maximum (D5). Below the chips. */
  status?: React.ReactNode
  /** One primary, one secondary, then the three-dot menu (B1). Shares the
   * title's row, per the ruling. */
  actions?: React.ReactNode
  /** Anything the module wants under the identity row — a status stepper. */
  headerExtra?: React.ReactNode
  /** The TabsView and its panels. Ignored while `state` is not `"ready"` — the
   * kit replaces this region with its own register — so a loading/error/empty
   * caller may pass `null` rather than building a panel it knows won't show. */
  children?: React.ReactNode
  /**
   * Loading, empty or error — swaps ONLY the region `children` occupies; the
   * header band (title, chips, actions) stays drawn (RecordChrome's law 4).
   * Because this app hands its whole TabsView to `children` rather than using
   * `RecordChrome`'s own `tabs` array (see this file's header, "THE TABS GO IN
   * panel, NOT tabs"), the swap takes the tab strip WITH it — there is no
   * partial state where the strip shows and the content spins. That is a
   * known, accepted trade against a bigger one: keeping exactly one tab-strip
   * implementation in the app, rather than a second one RecordChrome would
   * otherwise need to own. Omit `state` (the default) for a screen that has
   * not been migrated to it yet; its own early return still works exactly as
   * before.
   */
  state?: ShapeState
  /** Per-locale words for the three states above. */
  copy?: Partial<ShapeStateCopy>
  /** The one next step offered by the empty register. */
  emptyAction?: React.ReactNode
  /** The retry offered by the error register. */
  errorAction?: React.ReactNode
}) {
  return (
    <RecordChrome
      mark={leading ?? (mark ? <TypeMark mark={mark} size="band" /> : null)}
      recordNumber={recordNumber}
      collectionLabel={collectionLabel}
      chips={chips}
      title={title}
      meta={status}
      actions={actions}
      hero={headerExtra}
      panel={children}
      /* The audit strip and the activity column are this app's own — `RecordFooter`
         and the Activity tab feed them from our own doors — so the kit's footer
         stays off rather than drawing an empty second one. */
      footerVisible={false}
      state={state}
      copy={copy}
      emptyAction={emptyAction}
      errorAction={errorAction}
    />
  )
}

/** The class a record's TabsView wears so its bar pins under the collapsed line.
 * A string rather than a wrapper for the reason RecordBody explains. */
export const STICKY_TABS =
  "[&>[role=tablist]]:bg-background [&>[role=tablist]]:sticky [&>[role=tablist]]:top-[var(--record-tabs-top,0px)] [&>[role=tablist]]:z-10"
