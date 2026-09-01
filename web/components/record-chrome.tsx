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
//   RecordScreen's `audit`/`activity` — created-by / last-edited-by and the
//                       recent-activity summary, D7, now drawn by the KIT's
//                       own ink footer card instead of a hand-rolled grey one
//                       (see "the footer" section below, fixed 2026-08-31).
//
// The two sticky layers do not fight: the shell owns z-20 (L6) and everything
// here takes z-10. `--shell-top` is published by app-shell — the mobile bar's own
// height, zero on desktop — so a record pins UNDER the app bar, not behind it.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
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
import type { RecordDetailAuditEntry } from "@shared/ui/components/record-detail/record-detail"
import type { ActivityFeedItem } from "@shared/ui/components/activity-feed/activity-feed"

import { InAppLink } from "@/components/in-app-link"
import { safeHref } from "@shared/web/rich-text"
import { RecordMark } from "@shared/web/record-mark"
import { clampRecordHeading } from "@shared/web/record-heading"
import { formatRelative } from "@shared/web/format"
import { useLanguage, useT } from "@shared/web/language"
import type { Language } from "@shared/i18n"
import { defaultTabsConfig, type TabsConfig } from "@shared/web/screen-engine/tabs-view"
import type { ActivityFeedRow } from "@/lib/use-record-activity"
import { useCondensedTitle, CondensedTitleBar, usePublishCondensedHeight } from "@/components/condensed-title"

/* -------------------------- the record tab strip --------------------------
   Client ruling, 2026-08-31, verbatim: "Detail screens are using the
   folder-tab design, but that style belongs to main screens only. Detail
   screens should use the line (underline) tabs." Concrete case: the App
   detail screen (Overview / Sprints / Stories / Stakeholders) was drawing
   folder tabs, because every detail screen's own `TabsView` config spreads
   `defaultTabsConfig` (tabs-view.tsx) with no `variant` override, and that
   default is `"folder"` — correct for a COLLECTION's own strip (a main
   screen switching between records, or between collections), wrong for a
   RECORD's own top-level strip switching between the SAME record's sections.
   `RecordDetail`'s own internal tab prop already draws `variant="line"` for
   exactly this reason (record-detail.tsx: "client ruling E … a record IS the
   detail screen, so `line` is stated rather than inherited"); every detail
   screen in this app hands its tabs to `RecordScreen`'s `children` instead
   (see this file's own header, "THE TABS GO IN panel, NOT tabs"), so that kit
   default never reached them. ONE constant, spread by every record's own
   tabsConfig, is the fix — not a per-file `variant: "line"` written twelve
   times, which is how the folder default drifted onto every one of them in
   the first place. A strip that filters WITHIN one collection (Open/Done,
   Overdue/List/Calendar) is a different case and keeps `defaultTabsConfig`
   untouched — this constant is only for a RECORD's own section strip. */
export const RECORD_TABS_CONFIG: TabsConfig = { ...defaultTabsConfig, variant: "line" }

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

/** THE TRIGGER'S BOX. Client feedback, 2026-08-31, on the sm-everywhere pass:
 * "buttons (you made them way too small!!!)". A record header's actions are a
 * row of STANDING (40) pills — the primary/secondary buttons beside this menu,
 * and `RecordTimerButton` where one is offered — so `size="icon"` alone, with
 * no override, is already the right box: it draws the kit's standing height,
 * matching every sibling in the row rather than a shorter one. A ROW menu
 * reads the same way for a different reason — a list row's own height is set
 * by its cells, not by this trigger — so `header` and `row` land on the same
 * size and neither needs a lookup any more. */

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

/* ------------------------------- the footer -------------------------------
   FIXED 2026-08-31. This used to draw its OWN grey `<footer>` box, hand-rolled,
   below the tab panel — the client's own words, comparing a live record
   against the kit's mockup: "the footer of detail page is completely
   different than in the design." It was: a flat grey strip inside the panel,
   never the kit's ch27.8 charcoal two-column card (`RecordDetail`'s region 4,
   `Latest activity` / `Record`), because this file predates that card and was
   never rebuilt onto it.

   `RecordChrome`'s `footerVisible={false}` (below, on `RecordScreen`) is what
   this app used to say instead of drawing the kit's ink card at all — it was
   right, not because the card was rejected, but because nothing here fed it
   yet. It is fixed by feeding it, not by turning it back on with nothing
   behind it: `audit` and `activity` — the same data this app already had for
   the OLD grey footer and the existing Activity tab, respectively — now go
   straight into the kit's `audit` / `activity` props on `RecordChrome`
   (record-chrome.tsx §"the ink footer"), and `footerVisible` is left to the
   kit's own default (true; `RecordDetail` shows the card only when one of the
   two columns actually has something to draw).

   THE DATE NOW RIDES THE LABEL SLOT, RIGHT-ALIGNED — CLIENT RULING, 2026-08-31,
   verbatim: "on the footer, on the record section also have the dates aligned
   right", pointing at Latest activity's own trailing time column beside it.
   `RecordDetailAuditEntry.label` is not new (record-detail.tsx already draws
   it at the row's inline start with `children` pushed to the inline end via
   `justify-between` — the same trailing-edge idea `ActivityFeed`'s own time
   column uses, there via a trailing `auto` grid track rather than a flex
   `justify-between`, but the same result: the date sits flush at the row's
   end), it was simply unfed here. So when BOTH a name and a
   date are known, `label` takes "Created by {name}" / "Last edited by {name}"
   and `children` takes the bare `formatRelative` value, which lands it hard
   right the same way the Latest activity column's timestamps already sit.
   NO NEW CATALOGUE STRING: "Created by {name}" and "Last edited by {name}"
   already exist (the name-only fallback below has always called them), so
   this reuses them rather than inventing a fourth. The middot-joined
   "Created by {name} · {when}" sentence retires — checked against every
   configured language (`shared/i18n-seed.ts`: de/es/ca all keep {name} before
   {when} in that exact order, none reorders across the middot), so splitting
   the join into two DOM nodes at the same seam changes no language's reading,
   it only lets the second half sit at the row's own end instead of inline.
   The name-only and date-only fallbacks (no `label`) are untouched: with only
   one fact to show, there is nothing to put on a second column and the old
   single-phrase reading is exactly right there. Run `npm run lang` after this
   change — it prunes the two now-orphaned join sentences from the catalogue,
   per R28. */

export type RecordAudit = {
  createdByName?: string | null
  createdAt?: string | null
  editedByName?: string | null
  updatedAt?: string | null
}

/** `audit` → the ink footer's Record column, two rows: Created, Last edited.
 * A PERSON AND A TIME ARE TWO COLUMNS, NEVER A PREPOSITION —
 * "Created by Alaap K on 5d ago" is not a sentence in English: `on` takes an
 * absolute date and a relative phrase attaches bare, and `formatRelative` is
 * relative for the first week and absolute after it, so a preposition would be
 * right on Tuesday and wrong on Monday. That is why the date is never glued
 * onto the name with a word — it rides `label`/`children` instead (see this
 * file's "the footer" section, "THE DATE NOW RIDES THE LABEL SLOT"), which
 * also right-aligns it to match Latest activity's own trailing time. Renders
 * no row for a fact the record doesn't know (true of rows imported before the
 * audit columns existed). */
function recordAuditEntries(
  audit: RecordAudit,
  t: ReturnType<typeof useT>,
  lang: Language
): RecordDetailAuditEntry[] {
  const created = audit.createdAt ? formatRelative(audit.createdAt, t, lang) : null
  const edited = audit.updatedAt ? formatRelative(audit.updatedAt, t, lang) : null
  const rows: RecordDetailAuditEntry[] = []
  if (audit.createdByName && created)
    rows.push({ id: "created", label: t("Created by {name}", { name: audit.createdByName }), children: created })
  else if (audit.createdByName) rows.push({ id: "created", children: t("Created by {name}", { name: audit.createdByName }) })
  else if (created) rows.push({ id: "created", children: t("Created {when}", { when: created }) })
  if (audit.editedByName && edited)
    rows.push({ id: "edited", label: t("Last edited by {name}", { name: audit.editedByName }), children: edited })
  else if (audit.editedByName)
    rows.push({ id: "edited", children: t("Last edited by {name}", { name: audit.editedByName }) })
  else if (edited) rows.push({ id: "edited", children: t("Last edited {when}", { when: edited }) })
  return rows
}

/** `activity` → the ink footer's Latest activity column. The SAME rows
 * `useRecordActivity` already fetches for this record's Activity tab (the one
 * generic (table, id) read path, R18-gated at the door) — never a second
 * fetch. CH27.8: "short … the footer is a summary, not the Activity tab", so
 * this takes only the newest few; `useRecordActivity`'s rows already arrive
 * newest-first (the Activity tab pages the same order), so nothing is
 * re-sorted here. */
function footerActivityItems(items: readonly ActivityFeedRow[]): ActivityFeedItem[] {
  return items.slice(0, 3).map((item) => ({
    id: item.id,
    description: item.description,
    actor: item.actor,
    initials: item.initials,
    time: item.timestamp,
  }))
}

/* ------------------------------ the type mark ----------------------------- */

/** THE TYPE MARK, in the slot a lucide icon would have taken (UI-CONVENTIONS §5,
 * amended 17 Aug 2026). `aria-hidden`, never inside a sentence, and always
 * beside the type WORD — the group heading or the TYPE column on a
 * collection.
 *
 * NOT CALLED FROM THIS FILE'S OWN HEADER BAND ANY MORE — client ruling,
 * 2026-09-01, verbatim: "for now there are no - under no case - images on
 * title. remove it everywhere" (see `RecordScreen`'s own `mark`/`leading`
 * prop docs, below, and "THE MARK IS GONE FROM THIS HEADER TOO" further down
 * this file). Left defined and exported rather than deleted: it is a general
 * "a type word may carry a glyph" primitive (UI-CONVENTIONS §5's own scope
 * says a collection's own group heading or TYPE column, neither of them a
 * title), not itself a violation of "no images on title" — only a CALLER
 * putting it beside a title would be, and this file no longer has one. */
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
 * CURRENT LAYOUT, top to bottom (the overrides below this comment carry the
 * full history): the identity pills row, then the title, then the subtitle
 * where one exists, with `actions` sharing the title's own row, pushed to the
 * inline end. No mark and no eyebrow draw here any more — both removed by
 * later client rulings quoted below ("THE EYEBROW LEAVES AGAIN…" and "THE
 * MARK IS GONE FROM THIS HEADER TOO…"). At most one primary and one secondary
 * button belong in `actions`; everything else is a RecordActionsMenu at the
 * end of it (B1).
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
 *
 * THE EYEBROW COMES BACK, NARROWER — CLIENT RULING, 2026-08-31, REFINING
 * OVERRIDE 73 RATHER THAN REVERSING IT. Reviewing the live detail pages again,
 * verbatim: "in eyebrow what this is (f.e. App, Account, etc) - as it is right
 * now, the title - underneath the pills: the first one is always the id …". So
 * a bare eyebrow returns, but it is ONLY the record-TYPE word ("App",
 * "Account", "Ticket") — never the ID and never the status, which override 73
 * was right to put below as chips and stay there untouched.
 *
 * WHY THIS IS APP-SIDE AND NOT A NEW KIT PROP. `RecordDetail` (the vendored
 * primitive one layer down, shared/ui/components/record-detail/record-detail.tsx)
 * already has a real `eyebrow` slot and forwards it straight into `Title`
 * (shared/ui/components/title/title.tsx), which draws it exactly this way —
 * `text-micro` uppercase, `text-ink-tertiary`, sitting over the heading inside
 * the SAME block `actions` bottom-aligns against. But the kit's own `RecordChrome`
 * template (shared/ui/compositions/templates/record-chrome.tsx) is override 73's
 * own file and never forwards `eyebrow` into `RecordDetail` — the comment there
 * is explicit: "nothing here draws above `title` any more". `shared/ui/` is
 * vendored and pinned (CLAUDE.md, `web/test/vendored-kit.test.ts`), so that
 * template cannot be hand-edited here; the fix belongs upstream in
 * Kwapso/kwapso-ui-ux, logged as a gap (a real prop this template drops on the
 * floor). Until that lands, `title` itself carries the eyebrow, styled with the
 * exact three classes `Title` uses for its own — so the day the kit grows the
 * real slot, swapping this block for a plain `eyebrow` prop is a one-line change
 * with no visual difference. Nesting it inside `title` rather than drawing a
 * second node beside it is deliberate: `Title`'s row is `items-end`, so `actions`
 * bottom-aligns to whatever `title` renders as a whole, and stacking the eyebrow
 * above the real heading INSIDE one node is what keeps the buttons "aligned with
 * the title" (the client's own words, item 4 of this same ruling) rather than
 * with the eyebrow above it.
 *
 * THE EYEBROW LEAVES AGAIN, THIS TIME FOR GOOD, AND THE PILLS MOVE ABOVE THE
 * TITLE — CLIENT RULING, 2026-09-01, REVERSING BOTH OF THE ABOVE, against a
 * real screenshot of a live Ticket detail screen. New order for the FULL
 * (non-scrolled) header, top to bottom: the mark where the type has one, then
 * the pills row (black ID chip, status pill, parent-record chip), then the
 * title, then the subtitle where one exists — never an eyebrow, anywhere,
 * because the breadcrumb sitting above this whole header already names the
 * record type and the collection ("Tickets · Kids training missing from the
 * website menu"), which is what "THE EYEBROW COMES BACK" answered before a
 * breadcrumb existed to answer it instead. This paragraph originally went on
 * to say the condensed sticky bar (`condensed-title.tsx`, `CondensedTitleBar`)
 * "keeps BOTH the eyebrow and the pills" and disagrees with this header on
 * purpose — that was true for a few hours the same day and the two notes
 * below are what replaced it.
 *
 * THE MARK IS GONE FROM THIS HEADER TOO, AND FOR GOOD — CLIENT RULING,
 * 2026-09-01, LATER THE SAME DAY, OVERRIDING ANY EARLIER NUANCE, VERBATIM:
 * "for now there are no - under no case - images on title. remove it
 * everywhere." So "the mark where the type has one" a few lines up is no
 * longer this file's own behaviour: `mark`/`leading` still arrive on
 * `RecordScreen`'s own signature (every `*-detail.tsx` call site still passes
 * one) but neither is read into anything rendered near a title any more,
 * here or in the condensed bar — see the two props' own doc comments below
 * for why the signature keeps them anyway.
 *
 * THE CONDENSED BAR NO LONGER DISAGREES WITH THIS ONE — same ruling,
 * verbatim: "for the detail replicate the main: turn the breadcrumb + title
 * in eyebrow title. do not include image nor pills." A detail screen's
 * condensed bar now hands `CondensedTitleBar` only `eyebrow` and `title`,
 * dropping the `pills` it briefly carried — the exact shape `CollectionHeading`
 * (the main screen's own header) already used, so the two callers finally
 * agree and `CondensedTitleBar` itself no longer has a `pills` (or `mark`)
 * prop to disagree with (condensed-title.tsx).
 *
 * MECHANICALLY: `eyebrow` is dropped from the node this file builds for the
 * kit's `title` slot (never rendered in the full header again), and the
 * identity row moves from being read alongside `title` at the same level
 * (override 73's own file, `RecordChrome`'s `chips` prop, which the kit
 * places in a `meta` region BELOW the title) to being the FIRST child inside
 * that same `title` node — the exact trick this file already used for the
 * eyebrow and still uses for the subtitle, because the kit's own template
 * cannot be hand-edited (R39) to swap which of its two regions comes first.
 * See `RecordScreen`'s own body — the comment above `identityChips` — for the
 * current mechanics in full.
 */

/** A CHIP THAT NAVIGATES — the client's third pill, "the most relevant parent
 * container" (an app's account, a ticket's app, a story's sprint…): "when I
 * click it takes me to it." `Badge` already draws whatever node it is given
 * (it always has), so the chip itself needs no new shape — only a real in-app
 * link inside it, R37's `InAppLink` rather than a hand-rolled `onClick`, so the
 * chip is a genuine anchor (middle-click, copy-address, a screen reader) and
 * not a button pretending to be one.
 *
 * NO UNDERLINE, A HOVER COLOUR INSTEAD — client ruling, 2026-08-31, verbatim:
 * "on pills, when they have link, do not underline but give hover color." A
 * plain `Badge` (this one's default `variant="secondary"`) reads at
 * `text-ink-secondary`; `hover:text-foreground` steps it up to the full-strength
 * ink on touch, the same convention the app's other cross-reference links
 * already use for exactly this — `account-detail.tsx`'s "Part of {account}",
 * `sprint-detail.tsx`'s Wave field, `story-detail.tsx`'s App/Ticket links,
 * `contact-detail.tsx`'s company list — all `hover:text-foreground`, never an
 * underline. `InAppLink` carries no styling of its own, so that stayed the
 * only override on the link itself — but the ink step was the whole hover
 * treatment, and this is a PILL, not a text link: the fill never moved.
 *
 * THE FILL NOW MOVES TOO — bug fix, 2026-08-31, client: "the hover color
 * change [should be] applied to the PILL ITSELF (its background/fill), not
 * only to the text inside it." `has-[a:hover]:!bg-[var(--btn-secondary-hover)]`
 * on the `Badge` itself is the trigger (`:has()` reaches UP from the inner
 * `InAppLink` to this pill, the opposite direction `group`/`peer` reach).
 *
 * NOT `--accent` — MEASURED, not guessed. The kit's generic "neutral hover"
 * wash (`filter-bar.tsx`'s chip label uses it) is `rgba(…, .05)`, a 5% tint
 * meant to sit OVER an already-opaque backdrop (a popover, a card). This
 * badge's resting fill IS the backdrop — `bg-surface-quiet`, itself opaque —
 * so `background-color: var(--accent)` does not tint it, it REPLACES it,
 * and the 5% wash then composites against whatever is behind the badge
 * instead. Read live against this row's own transparent header band (dark
 * palette): resting `#3A3833` hovered to a computed `rgb(32, 31, 28)` —
 * DARKER than resting and barely off the near-black page underneath, i.e.
 * the pill nearly disappearing, the opposite of "a real, visible fill-color
 * shift." `--btn-secondary-hover` is the kit's other neutral-hover token —
 * OPAQUE, not alpha (`Button`'s own law: "hover is a named token, never an
 * opacity") — and lighter than `--surface-quiet` in both palettes (measured:
 * `#F1ECE4` over `#E2DDD4` light, `#454239` over `#3A3833` dark), so it reads
 * as a real brightening in both, regardless of what sits behind the pill.
 * Borrowed from `Button`, not invented: this badge's own variant is already
 * named `"secondary"`, and no `Badge`-specific hover token exists because
 * the kit's law is that a badge never hovers at all (this file's own note
 * two paragraphs up) — this is the one call site earning an exception to
 * that law, and it reaches for the nearest already-real neutral-hover token
 * rather than adding a new one to tokens.css for a single pill.
 *
 * THE RESTING COLOUR IS THE NAMED TOKEN, NOT A SWAP — client, 1 Sep 2026,
 * pointing at this exact pill a second time: "use this color #F7F2EB (the
 * main token for beige)" for the RESTING fill, unambiguously — the same
 * instruction that repointed every OTHER plain badge app-wide (`--surface-
 * panel`, `web/app/layout.tsx`'s `<body>` rule, above). An earlier pass here
 * read a prior "the two states are backwards" note as license to swap this
 * pill's two EXISTING tokens (`--btn-secondary-hover` / the quiet fallback)
 * between the resting and hover slots — which never lands on #F7F2EB at all,
 * on either state, because neither of those two tokens IS `--surface-panel`.
 * Measured: `--btn-secondary-hover` is `#F1ECE4`, `--surface-quiet` is
 * `#E2DDD4` (tokens.css) — the client's own quoted hex belongs to a THIRD
 * token, `--surface-panel`, that this pill had never actually drawn from.
 * So the fix reaches for that token by name rather than reshuffling the
 * other two: resting is `bg-surface-panel` — the identical class every other
 * plain badge in the app already carries after the layout-level repoint, so
 * this pill finally reads as the SAME beige, not a look-alike.
 *
 * THE HOVER STEP NEEDS REAL CONTRAST, NOT THE NEAR-TWIN. `--btn-secondary-
 * hover` (`#F1ECE4`) sits only 8-14 RGB points from `--surface-panel`
 * (`#F7F2EB`) — the "measured, not guessed" note above already logged that
 * pairing as barely distinguishable — so reusing it as the hover step would
 * repeat the same "no real fill-color shift" defect this file already fixed
 * once, just one token over. `--surface-quiet` (`#E2DDD4`) is a full step
 * darker (the same neutral `Badge`'s own kit-native "secondary" variant
 * draws everywhere it is NOT repointed to the panel tone), so hovering this
 * pill visibly darkens it — a real, legible fill change in both palettes.
 *
 * `!` because the app-wide rule in `web/app/layout.tsx`'s `<body>` repoints
 * every OTHER plain badge's fill to `--surface-panel` unconditionally, and
 * that rule doesn't know about this one, so this badge has to out-rank it by
 * importance rather than by specificity. `IDENTITY_ROW` (below) no longer
 * enters into this at all: it now rebinds the `--badge-quiet-fill` custom
 * property rather than matching a literal class (see that constant's own
 * comment for why), and this pill's own literal `!bg-surface-panel` /
 * `has-[a:hover]:!bg-surface-quiet` classes replace `secondary`'s
 * `bg-[var(--badge-quiet-fill,…)]` class outright in `cn()`'s merge — so
 * there was never a rebound property for this badge to read, and no gate is
 * needed on either side. NO OUTLINE: the
 * app's absolute rule for a hover indicator on a pill is a fill change,
 * never a border — the hover token replaces the fill outright rather than
 * adding a ring around it. Never an underline either — this chip already
 * reads as one from the `hover:text-foreground` ink step above, and the
 * pill's own fill change lives inside the pill, not around it. */
export function RecordChipLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Badge className="!bg-surface-panel has-[a:hover]:!bg-surface-quiet">
      <InAppLink href={safeHref(href) ?? "/home"} className="hover:text-foreground">
        {children}
      </InAppLink>
    </Badge>
  )
}

/** THE FOOTER-TO-THE-BOTTOM CHAIN, LAST LINK. Client, verbatim, 2026-08-31:
 * "i want that the footer is always at the bottom, even if there's not
 * 'enough content on the screen to push it down'. however i dont want that
 * its all the time visible if there's content, should come when scrolling
 * down" — the ordinary sticky-footer flex trick, explicitly NOT
 * `position: sticky`/`fixed` (that is the second behaviour, the one the
 * client just ruled out, and it is `STICKY_TABS`'s own job below, on a
 * different region for a different reason).
 *
 * `app-shell.tsx`'s content div and `deep-link-screen.tsx`'s two wrappers
 * (see their own notes) float this component a real, resolved height —
 * `AppShell`'s body pane's own height, on a short record, rather than this
 * component's own short content. Two things then have to happen with that
 * height, both from OUT HERE, because `shared/ui/` is vendored and pinned
 * (CLAUDE.md, R39) and neither `RecordChrome` nor `RecordDetail` can be
 * hand-edited to do them itself:
 *
 * 1. `flex-1 min-h-0`, applied to `RecordChrome`'s OWN root (this class,
 *    where it is spent, on the component below) and reached again onto
 *    `data-slot=record-detail` (`RecordDetail`'s own root, one level
 *    inside `RecordChrome` — a plain `<div>` this file never touches
 *    directly) by a descendant selector, exactly `STICKY_TABS`'s own
 *    technique below for the same reason: nothing here draws that div, so a
 *    class is the only way to reach it. Both need the claim — `RecordChrome`
 *    is `flex flex-col` with `RecordDetail` as its one real child, so
 *    `RecordDetail` only grows to fill it if it ALSO claims the space.
 * 2. `margin-top: auto` on `[data-record-region=footer]` — `RecordDetail`'s
 *    OWN ink-footer card (record-detail.tsx: `data-record-region="footer"`,
 *    always the LAST child of its flex column). A flex column's last child
 *    with `margin-top: auto` consumes every pixel of slack above itself and
 *    is pushed to the column's own bottom edge — the same arithmetic as
 *    giving the PANEL `flex-grow` instead, without reaching past
 *    `RecordDetail`'s tabless case (this app hands its tabs through `panel`,
 *    never `RecordChrome`'s own `tabs` prop — this file's header, "THE TABS
 *    GO IN panel, NOT tabs" — so the sibling before the footer is always the
 *    one `panelBody` `Card`, never a `<Tabs>` wrapper; `margin-top: auto`
 *    reaches the footer directly and never has to name that sibling at all).
 *
 * NEITHER LINE TOUCHES SCROLLING. The document stays the one scroller
 * (this file's own header, and `app-shell.tsx`'s `overflow-x-clip` note) —
 * nothing here sets `overflow`, so a record long enough to exceed the
 * viewport just keeps growing this flex column past it, and the footer
 * scrolls into view at the end of the document exactly as an ordinary last
 * element would. Short content is the only case either line changes
 * anything for. */
const FOOTER_TO_BOTTOM =
  "flex-1 min-h-0 " +
  "[&_[data-slot=record-detail]]:flex-1 [&_[data-slot=record-detail]]:min-h-0 " +
  "[&_[data-record-region=footer]]:mt-auto"

/** THE RECORD'S OWN TITLE STEP — CLIENT CORRECTION, 2026-08-31, verbatim:
 * "title on main screens still way too small! it's currently smaller than in
 * detail screens. makes no sense." True, and the reference "Kwapso UI Kit.dc.html"
 * scale says exactly why: display-m/56 is named "Page title" (a main screen's
 * own heading, collection-heading.tsx's own note) and h1/44 is named "Record
 * heading" — a MAIN screen's title is meant to be the LARGER of the two.
 *
 * THIS IS A VENDORED KIT BUG, NOT AN APP CHOICE, AND IT GOES DEEPER THAN
 * `SHAPE_HEADING_SIZE` (states.tsx). `RecordChrome` (the vendored template,
 * compositions/templates/record-chrome.tsx) feeds `RecordDetail` a
 * `titleSize` capped at `SHAPE_HEADING_SIZE`'s own "h2" | "h3" union — but the
 * REAL ceiling is one layer down: `RecordDetail` renders the title through the
 * kit's `Title` primitive (components/title/title.tsx), and `Title`'s own
 * `size` ladder has ONLY THREE RUNGS — h2 (32), h3 (24), h4 (20) — with no h1
 * (44) and no display-m (56) rung AT ALL. `Headline` (components/typography/
 * typography.tsx), the OTHER kit primitive this app already uses for every
 * main-screen title, has both — so the same 44/56 steps exist in the token
 * system and in one kit component, and are simply unreachable from the other.
 * Filed upstream (kwapso-design / kwapso-ui-ux): `Title` needs an `h1` (and
 * ideally `display-m`) rung added to its own `size` variant, matching
 * `Headline`'s ladder exactly, so `RecordDetail` can ask for one directly.
 *
 * `shared/ui/` is vendored and pinned (CLAUDE.md, R39) and cannot be
 * hand-edited here, so this reaches the kit's OWN rendered heading from
 * outside — `[data-slot=title-heading]` is `Title`'s own stable hook — the
 * exact precedent `auth-card.tsx` sets for the sign-in screen's centring: a
 * descendant selector targeting the kit's own data-slot, never a class edited
 * into the vendored file. `text-4xl` is the h1 step's OWN Tailwind utility —
 * tokens.css's `@theme inline` block bridges its font-size, line-height AND
 * letter-spacing together (the same bridge `text-3xl` already gets), so one
 * class is the whole step, not a raw `text-[length:…]` that would silently
 * drop the other two (typography.tsx's own warning). No `!` needed: the
 * attribute-selector descendant this compiles to already outweighs `Title`'s
 * own bare `.text-3xl`/`.text-2xl` class on specificity alone. */
const RECORD_TITLE_SIZE = "[&_[data-slot=title-heading]]:text-4xl"

/** THE IDENTITY ROW'S OWN GEOMETRY — see `RecordScreen`'s own note at its
 * `identityChips`, below, for why this exists (a bigger, better-spaced pill
 * row, and a coloured-dot pill that finally has a visible fill) and why it
 * lives here instead of the vendored kit. Module-level, like `STICKY_TABS`
 * below it, because it closes over nothing.
 *
 * REVERSED, 2026-09-01 — CLIENT SCOPE CORRECTION. `RecordChipLink` (below)
 * was fixed to rest at exactly `#F7F2EB` (`--surface-panel`), and the client's
 * next word was that this is not one pill's rule, it is the ROW's: "every
 * pill in the record header EXCEPT the black ID chip" rests at that same
 * beige, the coloured STATUS pill (the dot + label one, e.g. "In progress")
 * included — only its dot keeps its status colour, the pill's own fill
 * follows the rest. That supersedes the contrast reasoning two paragraphs
 * down (`--surface-quiet` chosen because this row sits on the transparent
 * band rather than a card): the client has now seen `#F7F2EB` on this exact
 * row and asked for it anyway, so the rebind below reads `--surface-panel`,
 * matching the app-wide plain-badge tone instead of stepping one further
 * down the neutral ladder. `recordNumber` is untouched — it is always
 * `variant="inverse"`, which never reads `--badge-quiet-fill` at all, so it
 * stays the black chip the rest of this rule was never going to touch.
 *
 * THE HAIRLINE CAME BACK OUT, 2026-08-31 — CLIENT RULING, VERBATIM: "pills no
 * border!" This row briefly drew a `shadow-[var(--hairline)]` inset stroke
 * around its pills (both the plain ones, via the app-wide rule on `<body>`
 * in `web/app/layout.tsx`, and the coloured-dot ones, via this file's own
 * rule below) to answer the same contrast problem this comment already
 * named: `--surface-panel` (#F7F2EB) sits one faint step off `--background`
 * (#FFFEF9) — 8-14 points a side in RGB — and this row sits on the
 * transparent header band, which shows the ambient field through rather
 * than a card, so that faint step read as no pill shape at all. An inset
 * hairline answers a contrast problem with an outline, and BUILD-A-SCREEN.md
 * §6.1 is absolute: "separation is a fill or an inset shadow, never a
 * stroke" — the hairline traced a pill's WHOLE edge, which is a stroke by
 * any other name the moment it outlines a shape rather than shading one flat
 * surface, so it is gone, here and from the app-wide rule.
 *
 * THE REAL FIX IS A DIFFERENT FILL, SCOPED TO THIS ONE ROW. Every ordinary
 * pill elsewhere in the app (list badges, table badges, Contact's "Contact"
 * pill, the assistant's quota pill) keeps the client's own named colour,
 * `--surface-panel`, because each of those sits on a card or a list row —
 * genuine fill contrast against `--background` there. This row is the one
 * place a plain pill sits directly on the transparent band instead, so it
 * reaches one step further down the same neutral ladder to `--surface-quiet`
 * (#E2DDD4) — a FULL step darker than `--surface-panel`, not a faint one,
 * and the kit's own pre-existing "quiet chip" tone (`TOKENS.md` §2) rather
 * than an invented value.
 *
 * REBINDS THE KIT'S OWN ESCAPE HATCH, NOT A MATCHED CLASS — design-kit resync
 * 2026-09-01, `shared/ui/VERSION.json` v1.2.13 → v1.2.15. `secondary`
 * (badge.tsx) used to draw the literal `bg-surface-quiet` utility, which is
 * what let an earlier version of this rule reach it by class selector
 * (`[data-slot=badge].bg-surface-quiet`) with `!` to outrank the app-wide
 * `<body>` repoint on tied specificity. That resync turned it into
 * `bg-[var(--badge-quiet-fill,var(--surface-quiet))]` (badge.tsx's own
 * comment there, "THE FILL IS A CUSTOM PROPERTY WITH A FALLBACK") — a
 * different generated class string, so the class-selector rule silently
 * stopped matching ANY badge; nothing censuses whether an app-side override
 * selector like this still matches something real, so it went quiet instead
 * of red. Re-guessing Tailwind's new arbitrary-value string would only
 * repeat the same failure the next time the kit's class shape moves, so this
 * instead rebinds the custom property the kit built for exactly this case —
 * its own comment: "a caller rebinds `--badge-quiet-fill` locally to a
 * darker quiet tone." `[--badge-quiet-fill:var(--surface-quiet)]` on this
 * row's own root inherits into every plain badge inside it; `secondary`'s
 * class already reads that property, so this needs no descendant selector,
 * no class match and no `!important` — and it only ever touches the
 * `secondary` variant, since that is the one variant that reads
 * `--badge-quiet-fill` at all (every coloured, destructive, status-dot or
 * outline badge draws its fill from its own token, untouched). It wins over
 * `web/app/layout.tsx`'s `<body>` repoint (also aimed at the same now-dead
 * literal class, so currently inert too — flagged separately, out of this
 * row's scope) by ordinary CSS custom-property inheritance once that rule is
 * fixed the same way: this row's rebind sits on a descendant closer to the
 * badge than `<body>`, and the nearer declaration wins with no importance
 * war needed. The dot pill's own rule below is unrelated — `[data-dot]` is
 * an attribute this file's own JSX sets, not a kit-generated class, so it
 * never goes stale the way the class match did.
 *
 * `RecordChipLink`'s own badge (above) needs no gate against this rebind.
 * It carries its own literal `!bg-surface-panel has-[a:hover]:!bg-surface-
 * quiet` className, and `cn()`'s tailwind-merge setup (`shared/ui/lib/
 * utils.ts`) groups an arbitrary `bg-[...]` class and a literal `bg-*` class
 * as the same background-color conflict — so that badge's own background
 * class always replaces `secondary`'s `bg-[var(--badge-quiet-fill,…)]`
 * outright rather than sitting beside it and reading the rebound property.
 * A dropped class can't race a custom property it never reads. */
const IDENTITY_ROW =
  "flex flex-wrap items-center gap-3 [--badge-quiet-fill:var(--surface-panel)] " +
  "[&_[data-slot=badge]]:h-[var(--control-height-pill)] [&_[data-slot=badge]]:gap-2 [&_[data-slot=badge]]:px-[var(--space-3h)] " +
  "[&_[data-dot]]:bg-surface-panel"

/* PULLING THE PILLS FLUSH WITH THE MARK'S OWN LEFT EDGE used to be a
   module-level constant here (`PILLS_UNDER_MARK`), reaching the kit's own
   `[data-slot=record-detail-meta]` span from outside with a descendant
   selector — needed because the pills used to render INSIDE that vendored
   span, below the title, which this file cannot hand-edit (R39).
   2026-09-01: the pills moved above the title, inside a node this file
   builds itself (`identityChips`, in `RecordScreen`'s own body), and a plain
   conditional class on that node did the same pull without the descendant
   selector.
   LATER THE SAME DAY: the mark itself was removed from every title, full
   stop ("THE MARK IS GONE FROM THIS HEADER TOO", above) — so there is no
   mark edge left to pull the pills flush WITH, and `identityChips` (below)
   no longer computes any such offset at all. This note stays only as the
   pointer to why an offset class briefly existed here and does not any
   more. */

export function RecordScreen({
  eyebrow,
  recordNumber,
  collectionLabel,
  chips,
  title,
  subtitle,
  status,
  actions,
  headerExtra,
  children,
  audit,
  activity,
  onAddNote,
  notePlaceholder,
  state,
  copy,
  emptyAction,
  errorAction,
}: {
  /**
   * The record type's glyph, when the type has one.
   *
   * NO LONGER READ BY THIS COMPONENT — CLIENT RULING, 2026-09-01, verbatim:
   * "for now there are no - under no case - images on title. remove it
   * everywhere." `RecordScreen` used to fold this into `headerMark` and hand
   * it to both the kit's own `RecordChrome` (`mark`) and the condensed bar
   * (`CondensedTitleBar`'s own former `mark` prop, now deleted outright,
   * condensed-title.tsx); neither happens any more, so a value here renders
   * nowhere. The PROP survives on this signature, unlike `eyebrow`'s own
   * "the condensed bar still reads it" reason: here it is simply that every
   * `*-detail.tsx` call site still passes one (`mark={appStageMark(app.stage)}`,
   * `mark={kindMark}`…) and none of the thirteen of them needs to change for
   * a ruling stated "for now" — removing the prop from this type would force
   * a matching edit at every one of them to delete an argument that is
   * already inert. `RecordMark`/`TypeMark`, the components a caller builds
   * this value FROM, are untouched: they still draw a mark in every list row,
   * tile and picker that isn't a title, which this ruling never reached.
   */
  mark?: string | null
  /**
   * A logo or avatar, when the record has a real image — it used to replace
   * the mark in the same square (G3). NO LONGER READ, for the exact reason
   * `mark`'s own doc comment above gives — same ruling, same signature-
   * survives-anyway logic, same thirteen call sites (`leading={<AppMark …/>}`,
   * `leading={<RecordMark …/>}`) left untouched.
   */
  leading?: React.ReactNode
  /**
   * The bare record-TYPE word — "App", "Account", "Ticket". The glossary's own
   * term for the concept (`shared/glossary.ts`), never a screen-invented
   * synonym (R34).
   *
   * REMOVED FROM THE FULL HEADER, PERMANENTLY — CLIENT RULING, 2026-09-01,
   * against a real screenshot of a Ticket detail screen: no eyebrow anywhere
   * on a detail screen's full header, full stop, because the breadcrumb above
   * it already says the same thing ("Tickets · Kids training missing from the
   * website menu"). This reverses "THE EYEBROW COMES BACK, NARROWER" (this
   * file's header) rather than refining it — that ruling's own reasoning (a
   * bare eyebrow reads as "what kind of record is this") is now answered by
   * the breadcrumb instead, so the eyebrow is redundant, not merely
   * relocated. The PROP survives on this signature, and every call site keeps
   * passing it, because `CondensedTitleBar` below is a SEPARATE header (the
   * small sticky bar that appears once scrolled past this one) with its OWN
   * spec, reached only after scrolling — and that bar keeps an eyebrow even
   * though this full header does not (it dropped its own `pills`, the other
   * thing it briefly carried, the same day — condensed-title.tsx). Do not
   * delete this prop or its call sites while chasing "no eyebrow, anywhere"
   * — the condensed bar is the one remaining, intentional reader of it.
   */
  eyebrow?: React.ReactNode
  /** The reference a person quotes on the phone. Drawn as the charcoal chip,
   * now ABOVE the title (client ruling, 2026-09-01, reversing "below the
   * title" below): "the black chip is always the ID". */
  recordNumber?: React.ReactNode
  /** What kind of record this is, or which collection it belongs to — the chip
   * beside the ID. "add a chip for Padelbase like in the example". Pass a
   * clickable node (an `InAppLink` or a `Button variant="link"` wrapped around
   * the label) to make it a real cross-reference — `Badge` draws whatever node
   * it is given, so nothing about the chip itself needs to change for that. */
  collectionLabel?: React.ReactNode
  /**
   * Anything else that belongs on the identity row — a status word, "Archived",
   * or any number of further chips. Already `React.ReactNode`, so a caller with
   * several related records wraps each one in its own `<Badge>` (a colour-coded
   * `dot` for a status, a plain one for a link) and hands the whole run in as a
   * fragment; nothing about this prop changes to support more than one.
   *
   * THE WHOLE ROW MOVED ABOVE THE TITLE, 2026-09-01 — see `identityChips`'s
   * own comment inside `RecordScreen`'s body for the mechanics (it rides
   * inside `title` now, same trick as the eyebrow used to and the subtitle
   * still does, because the kit's own `RecordChrome` renders `title` before
   * this bundle and cannot be hand-edited, R39).
   */
  chips?: React.ReactNode
  title: React.ReactNode
  /**
   * A GENUINE SUBTITLE — client ruling, 2026-08-31, verbatim: "consider that
   * some titles (header section from every page) may have 'subtitles'. place
   * it directly under the title and on top of the pills. f.e. in a meeting,
   * the time." UNMOVED by the 2026-09-01 reorder that put the pills ABOVE the
   * title instead of below it — the client never re-ruled on the subtitle, so
   * it keeps the one relationship it was given: directly under `title`,
   * wherever `title` itself now sits. Reserved for a fact that is NOT already
   * said by a chip: a meeting's start time is the confirmed case
   * (meeting-detail.tsx).
   *
   * WHY THIS LIVES INSIDE `title` RATHER THAN AS A THIRD KIT SLOT. Same
   * constraint the pills row hits (see `identityChips`'s own comment):
   * `RecordChrome` (the kit's own template) has no slot between the title and
   * its `chips`/`recordNumber`/`collectionLabel`/`tags`/`meta` bundle, so this
   * rides inside the `title` node itself, immediately after the real heading.
   */
  subtitle?: React.ReactNode
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
   * Fed into the kit's own ink footer (record-detail.tsx region 4), Record
   * column — see this file's "the footer" section above. Absent, that column
   * is absent; `RecordDetail` renders no card at all when neither column has
   * anything (its own rule, not redrawn here).
   */
  audit?: RecordAudit
  /**
   * The Latest activity column — the SAME rows `useRecordActivity` already
   * fetched for this record's Activity tab. Pass `activity.items` straight
   * through (`ActivityFeedRow[]`); the slice to "short" and the shape
   * conversion to the kit's `ActivityFeedItem` happen here, once.
   */
  activity?: { items: readonly ActivityFeedRow[] }
  /**
   * CH27.8's add-a-note field on the ink footer, backed by `useRecordActivity`'s
   * `addNote` (web/lib/use-record-activity.ts) over `POST
   * /api/tenancy/activity/note`. A caller passes its own `activity.addNote`
   * ONLY when the viewer holds that module's create right — omit the prop
   * entirely for a viewer who lacks it, never a no-op function, because the kit
   * draws the composer whenever this is supplied at all, rights aside.
   */
  onAddNote?: (value: string) => void
  /** The field's placeholder, forwarded as-is. */
  notePlaceholder?: string
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
  const { t, lang } = useLanguage()
  // THE CONDENSED STICKY TITLE (see condensed-title.tsx). `titleRef` watches
  // the real title block below — the moment it scrolls out of the viewport,
  // `condensed` flips and the small stand-in takes the sticky slot above the
  // tab strip instead.
  const { titleRef, condensed } = useCondensedTitle<HTMLSpanElement>()

  // THE FULL HEADER'S ORDER, REVERSED — CLIENT RULING, 2026-09-01, against a
  // real screenshot of a Ticket detail screen. New order, top to bottom: the
  // pills row (the black ID chip, the status pill, the parent-record chip),
  // THEN the title, with no eyebrow anywhere in this block — see `eyebrow`'s
  // own doc comment above for why the prop still exists (the condensed bar
  // still wants it) while this block never reads it again. This reverses
  // "THE EYEBROW COMES BACK, NARROWER" (this file's header comment) rather
  // than refining it, and reverses override 73's "chips sit below the title"
  // for the identity row specifically. THE MARK NEVER APPEARS IN THIS ORDER
  // AT ALL, as of later the same day — "THE MARK IS GONE FROM THIS HEADER
  // TOO", this file's header comment — so the order is pills, title, subtitle
  // and nothing above them.
  //
  // `min-w-0` + `break-words` on the title's own span is item 4 of an earlier
  // ruling: "set a max width of the title so there's a minimum margin between
  // the title and the buttons in case the title is long." `Title`'s row
  // (shared/ui/components/title/title.tsx) is already `flex flex-wrap gap-4`,
  // which wraps a normal title onto its own line and keeps the `gap-4` clear of
  // `actions` — but that alone still overflows on ONE long unbreakable token (a
  // URL-shaped app name, say), because nothing tells the browser it may break
  // one. `min-w-0` lets the title's flex item shrink below its content's natural
  // width in the first place, and `break-words` is what it shrinks INTO instead
  // of pushing `actions` past the edge of the row. A LONG but BREAKABLE title
  // needed a second fix on top of this one — see `TITLE_ACTIONS_SPLIT`'s own
  // comment, below the component, for why `actions` could still end up wrapping
  // onto a second line under a long multi-word title even with `min-w-0` here.
  //
  // THE PILLS ROW — the title block below needs `identityChips` as its own
  // FIRST child, so it is computed here, ahead of the title block, the same
  // as before. IT NO LONGER COMPUTES A MARK-EDGE OFFSET: the mark this pull
  // used to align under is gone (see this file's header comment, "THE MARK IS
  // GONE FROM THIS HEADER TOO"), so `identityChips` is a plain `IDENTITY_ROW`
  // now — no conditional class, no `hasMark`.
  const hasIdentity = recordNumber !== undefined || collectionLabel !== undefined || chips !== undefined
  const identityChips = !hasIdentity ? undefined : (
    <span className={IDENTITY_ROW}>
      {recordNumber !== undefined ? <Badge variant="inverse">{recordNumber}</Badge> : null}
      {collectionLabel !== undefined ? <Badge>{collectionLabel}</Badge> : null}
      {chips}
    </span>
  )
  // WHY THE PILLS THEMSELVES LOOK THE WAY THEY DO (size, gap, fill) — held
  // over from before the 2026-09-01 reorder, unchanged by it. Client
  // feedback, 2026-08-31, on the live ETZI app screen, verbatim: "on pills - i
  // want the pills a bit bigger and with more spacing" (reference: an Account
  // header's four chips, size and gap only, ignoring that screenshot's chip
  // POSITION which was already fixed), plus, same round: "all pills have a
  // background (in this case development is missing its background)".
  //
  // `RecordChrome` (the kit's own template) draws `recordNumber` +
  // `collectionLabel` + `chips` itself, in one `gap-2` row of default-size
  // (`size="counter"`) badges — and that row is vendored and pinned (R39), so
  // it cannot be hand-edited here the way this file's title block works
  // around a different missing kit slot. The same trick applies: fold all
  // three into ONE node THIS file renders (above), and — since 2026-09-01 —
  // hand the kit NONE of `recordNumber`/`collectionLabel`/`chips` at all (see
  // the comment above `identityChips`), the row is ours end to end, wherever
  // it renders. `IDENTITY_ROW` is what reaches every Badge nested in that row
  // — the ones built here AND every one a screen hands in through `chips`,
  // since a `Badge` always carries the kit's own `data-slot="badge"` — to
  // give it the kit's bigger `size="pill"` geometry (copied from badge.tsx
  // verbatim, not invented) and, for a coloured-dot pill only (`[data-dot]`),
  // a visible `bg-surface-panel` fill: the kit's own `--pill-fill` is
  // `var(--card)` (ch11's "the OTHER paper tone from the `var(--sheet)` panel
  // the pill sits on"), but the identity row sits on the header BAND,
  // deliberately transparent (this file's own header, "lets the ambient field
  // through"), and in this app's off-beige palette `--card` equals
  // `--background` — so the pill's fill and its backdrop coincided, and a
  // coloured-dot pill drew as a dot and a word with no chip shape under them
  // at all, exactly the client's screenshot ("Development"). Every OTHER chip
  // in the row draws on the same fill (`Badge`'s own `secondary` variant,
  // repointed from the kit's `bg-surface-quiet` to `bg-surface-panel`
  // app-wide by the `[data-slot=badge]` rule on `<body>` in
  // `web/app/layout.tsx` — client correction, 2026-08-31: "use this color
  // #F7F2EB", which is `--surface-panel`), so this line matches that one
  // explicitly rather than drifting from it again. `--surface-panel`
  // (#F7F2EB) is one faint step off `--background` (#FFFEF9) — visibly less
  // contrast against this transparent band than the old `bg-surface-quiet`
  // had, so if a pill ever reads as "missing its background" again on this
  // row specifically, look here first. Scoped to this one row, so an ordinary
  // status badge elsewhere (a list row, an Overview field) is untouched — it
  // already gets the same fill through the layout-level rule. Logged
  // trade-off: ruling 26's dark-mode clause gives the charcoal-dot ("in
  // build") pill a mango fill on dark specifically because a charcoal dot
  // cannot be seen on an unlit pill; this rule overrides that fill uniformly,
  // in both palettes, to the same neutral every other chip already uses.
  // Nobody has reported the dark pill, and re-adding the exception needs a
  // `dark:` rule proven to answer the same light/dark switch tokens.css
  // itself keys on (system preference AND an explicit `data-theme`) — worth a
  // real check, not a guess, so it is left for that.

  // THE SUBTITLE LINE — see the `subtitle` prop's own doc comment above for
  // the client ruling. `text-badge`/`text-ink-tertiary` matches
  // `RecordDetail`'s own `meta` treatment (record-detail.tsx: "text-badge
  // tabular-nums text-ink-tertiary") so a subtitle and a status line read as
  // the same family of text.
  const subtitleLine =
    subtitle === undefined || subtitle === null ? null : (
      <span className="text-badge tabular-nums text-ink-tertiary">{subtitle}</span>
    )
  // `titleRef` sits on the OUTER node either way — the whole block (pills,
  // heading and subtitle) is what has to fully leave the viewport before the
  // condensed stand-in takes over.
  //
  // THE PILLS SIT FURTHER FROM THE TITLE THAN THE TITLE SITS FROM ITS OWN
  // SUBTITLE — CLIENT RULING, 2026-09-01, pointing at a screenshot of a real
  // record (Padelbase) as the correct reference: a visible gap between the
  // pill row and the title, "in the current version pills are too close to
  // title." Before this, ALL THREE lines (pills, title, subtitle) sat in one
  // `flex-col gap-[var(--space-1h)]` column — one 6px gap reused for both
  // relationships, which read as too tight for the pills-to-title seam and
  // was never asked to change for the title-to-subtitle one. So the column
  // splits in two: the pills get their own wrapper with a real
  // `mb-[var(--space-3)]` (12px, doubling the old gap) under them, and a
  // NESTED column keeps title+subtitle at the original tight
  // `gap-[var(--space-1h)]` — the subtitle prop's own doc comment ("directly
  // under the title") was never re-ruled on, so that pairing stays as close
  // as it always was.
  const titleBlock =
    identityChips === undefined && subtitleLine === null ? (
      <span ref={titleRef} className="min-w-0 break-words">{clampRecordHeading(title)}</span>
    ) : (
      <span ref={titleRef} className="flex min-w-0 flex-col">
        {identityChips !== undefined ? (
          <span className="mb-[var(--space-3)]">{identityChips}</span>
        ) : null}
        <span className="flex min-w-0 flex-col gap-[var(--space-1h)]">
          <span className="min-w-0 break-words">{clampRecordHeading(title)}</span>
          {subtitleLine}
        </span>
      </span>
    )
  // THE CONDENSED BAR'S OWN HEIGHT, MEASURED — not a fixed token any more.
  // Even now that the condensed bar carries only `eyebrow` and `title` (see
  // `CondensedTitleBar`'s own doc, condensed-title.tsx), a longer translated
  // eyebrow word or a title long enough to wrap can still change its line
  // count, which is not knowable until the browser has laid it out.
  // `usePublishCondensedHeight` measures the bar's own node and publishes it
  // to `--record-tabs-top`, which `STICKY_TABS` reads (falling back to `0px`
  // while not condensed).
  const condensedBarRef = React.useRef<HTMLDivElement>(null)
  usePublishCondensedHeight("--record-tabs-top", condensed, condensedBarRef)
  return (
    // `display: contents` — a real DOM node, so this component's children
    // become direct flex items of whatever this component's own caller
    // renders it into (every `*-detail.tsx`'s `flex flex-col gap-6`), exactly
    // as if `RecordChrome` were still the sole child.
    <div className="contents">
      {/* NO `mark`, NO `pills` — CLIENT RULING, 2026-09-01: "for the detail
          replicate the main: turn the breadcrumb + title in eyebrow title.
          do not include image nor pills." The condensed bar used to be handed
          `headerMark` and `identityChips` too (a separate, later-reversed
          ruling the same day gave it both); `CondensedTitleBar` no longer
          even HAS those two props (condensed-title.tsx), so this call is the
          same shape `CollectionHeading` already uses for the main screen's
          own condensed bar — eyebrow and title, nothing else. */}
      <CondensedTitleBar
        ref={condensedBarRef}
        eyebrow={eyebrow}
        title={title}
        condensed={condensed}
      />
      <RecordChrome
        className={`${FOOTER_TO_BOTTOM} ${RECORD_TITLE_SIZE} ${PANEL_BELOW_TABS} ${TITLE_ACTIONS_SPLIT}`}
        /* NO `mark` HANDED TO THE KIT EITHER — "THE MARK IS GONE FROM THIS
           HEADER TOO", this file's header comment. `headerMark` (the local
           variable that used to fold `leading`/`mark` together) is deleted;
           there is nothing left to pass here. */
        /* NO `chips`/`recordNumber`/`collectionLabel` HANDED TO THE KIT ANY
           MORE — see the comment above `identityChips`. The whole pills row
           rides inside `title` (below) instead, so the kit's own identity row
           (`hasIdentity` in shared/ui/compositions/templates/record-chrome.tsx)
           always reads false and draws nothing, leaving exactly one copy of
           the row on the page. */
        title={titleBlock}
        meta={status}
        actions={actions}
        hero={headerExtra}
        panel={children}
        /* THE FIX — the kit's own ink footer, fed from this app's real data
           instead of held off (`footerVisible={false}`, this file's old line)
           while a hand-rolled grey box drew a different one below the panel.
           `footerVisible` is left to `RecordDetail`'s own default (true): the
           card draws only when `audit`/`activity` actually put something in one
           of its two columns. */
        audit={audit ? recordAuditEntries(audit, t, lang) : undefined}
        activity={activity ? footerActivityItems(activity.items) : undefined}
        onAddNote={onAddNote}
        notePlaceholder={notePlaceholder}
        state={state}
        copy={copy}
        emptyAction={emptyAction}
        errorAction={errorAction}
      />
    </div>
  )
}

/** THE TITLE COLUMN NEVER YIELDS THE WHOLE ROW TO A LONG NAME — CLIENT
 * RULING, 2026-09-01, verbatim: "i want that the space in screen for title
 * is, f.e. 80% of the width. that we always reserve a % on the left for the
 * buttons (so the current behaviour when long titles that the buttons go
 * under is wrong)." `actions` sharing the title's own row (override 73) is
 * what put Edit "aligned with the title" in the first place; a title long
 * enough could still push it onto a SECOND line underneath, which is the
 * defect this fixes.
 *
 * WHY A DESCENDANT SELECTOR. `title`/`actions` are threaded into the kit's
 * `Title` primitive (shared/ui/components/title/title.tsx), one layer below
 * `RecordDetail` — vendored and pinned (R39), so this file cannot hand-edit
 * it the way `RECORD_TITLE_SIZE` above already explains for the same
 * component. `Title`'s own row is a plain `flex flex-wrap items-end gap-4`:
 * the eyebrow+heading wrapper is a bare `<div className="min-w-0">` with no
 * `data-slot` of its own, and `actions` renders as `[data-slot=title-actions]`
 * only when given. `[&_[data-slot=title]>div:not([data-slot=title-actions])]`
 * reaches the FIRST kind of child by ruling OUT the one child that DOES carry
 * a name, rather than by counting on it being first — `Title`'s own source
 * always renders the heading wrapper before `actions` today, but "not the
 * actions div" describes the same element without leaning on that order.
 *
 * THE MECHANICS. A wrapping flex row decides whether its items fit on ONE
 * line using each item's flex-basis, not its post-shrink width — an item
 * whose basis is `auto` (content) gets its own unbroken text width as that
 * basis, so a long single-line title (its max-content width, before
 * `break-words` ever gets a chance to run) can by itself already exceed the
 * row, and `actions` — the sibling with nowhere else to go — is what wraps to
 * a second line UNDER the title, exactly the client's complaint (the title's
 * own `min-w-0` this file already sets, above, only lets it SHRINK once
 * placed on a line; it does nothing to the placement decision itself).
 * Setting the heading wrapper's basis to a real, definite value — `0%`, not
 * `auto` — takes it out of that decision entirely (its hypothetical size for
 * the fit test is now zero, so it never causes a wrap by itself); Tailwind's
 * `flex-1` (`flex: 1 1 0%`) is both of those in one utility — grow, shrink,
 * and the zero basis — so it lets the wrapper grow back to fill whatever room
 * `actions` doesn't need, and `max-w-[80%]` is the ceiling the client asked
 * for — even where `actions` is a single small button, the title is never
 * handed the WHOLE row. `actions` keeps its own natural width — `shrink-0`
 * guards it from ever losing the argument the title used to win by growing
 * straight through it. Long text still wraps/clamps WITHIN the title's own
 * shrunk column, via `min-w-0` + `break-words` (this component's own title
 * span) and `clampRecordHeading` — this class only changes how much of the
 * ROW that column may claim. */
const TITLE_ACTIONS_SPLIT =
  "[&_[data-slot=title]>div:not([data-slot=title-actions])]:min-w-0 " +
  "[&_[data-slot=title]>div:not([data-slot=title-actions])]:max-w-[80%] " +
  "[&_[data-slot=title]>div:not([data-slot=title-actions])]:flex-1 " +
  "[&_[data-slot=title-actions]]:shrink-0"

/** THE TWO NUMBERS BOTH RULES BELOW SHARE, AS CUSTOM PROPERTIES RATHER THAN
 * LITERALS. Round two (below) escaped the tab strip with a flat `-mt-[170px]`
 * — tuned by eye against ONE screen's header (a mark, an eyebrow, a subtitle,
 * three chips) until the gap looked right on THAT screen. It was never a
 * function of the header at all — the header's own height already resolves
 * correctly through ordinary flow, whatever it is, before this file touches
 * anything — but the ESCAPE amount still overshot into it, on any header
 * shorter than that one screen's, because the number was never derived from
 * anything the escape actually depends on. What it depends on is entirely
 * local to the strip itself:
 *
 *  · `--record-tab-strip-h` — the rendered height of ONE line-tab trigger row,
 *    read off tabs.tsx's own `TRIGGER_SKIN.line` verbatim: `pt-3` (block
 *    start) + `pb-[calc(var(--space-3)+0.125rem)]` (block end) + the
 *    `text-sm` content line box, less the 1px `-mb-px` pull-back the same
 *    class applies. Every term is a token the KIT's OWN trigger already
 *    renders at — this is the strip's fixed geometry, identical on every
 *    record screen, and has nothing to do with what sits above it.
 *  · `--record-tab-gap` — the blank page-tone space the client asked for
 *    between the strip and the card, a real token rather than a guess.
 *
 * Declared as custom properties (not inlined twice) because the two rules
 * that read them do not share a DOM parent-child relationship in the
 * direction that would let one see a class on the other: `PANEL_BELOW_TABS`
 * targets the panel `Card`, which is an ANCESTOR of the `<Tabs>` root
 * `STICKY_TABS` is handed to, not a descendant of it — a custom property
 * only reaches downward, so both are set once, here, on `RecordScreen`'s own
 * root (an ancestor of both), and each rule below just reads them. */
const RECORD_TABS_GEOMETRY =
  "[--record-tab-strip-h:calc(var(--space-3)_+_var(--space-3)_+_0.125rem_+_(var(--text-sm)_*_var(--text-sm--line-height))_-_1px)] " +
  "[--record-tab-gap:var(--space-5)]"

/** PUSHES THE PANEL CARD DOWN, OUT OF THE FLOATING STRIP'S WAY. Sibling fix to
 * `STICKY_TABS`, applied on `RecordScreen`'s own root (reaches the kit's
 * `[data-record-region="panel"]` `Card` the same way `FOOTER_TO_BOTTOM`
 * reaches `[data-slot=record-detail]` above — nothing here draws that div
 * either, so a class is the only way to reach it).
 *
 * WHY THE CARD HAS TO MOVE, NOT JUST THE STRIP. `STICKY_TABS` floats the tab
 * strip clear of the card by exactly `--record-tab-strip-h + --record-tab-gap`
 * — its own height plus the gap, the two things chapter 27 actually cares
 * about. But the strip is a DESCENDANT of the card (nested inside
 * `CardContent`, this file's own header, "THE TABS GO IN panel, NOT tabs"),
 * so floating it clear of the card floats it UP, off the card's own natural
 * position — and the card's natural position sits only `--space-3h` (14px)
 * below the header band (`record-detail.tsx`'s own `gap-[var(--space-3h)]`
 * flex column, vendored and pinned). A strip this tall, plus a real gap,
 * does not fit in 14px on ANY header, so without this rule the strip
 * overshoots past the header's own bottom edge and paints over its chips —
 * worse on a SHORT header (no mark, no subtitle) than a tall one, which is
 * exactly the failure mode the previous attempt's fixed pixel count could
 * never see, because it was tuned against one specific header's height and
 * never tested against a shorter one.
 *
 * Pushing the card down by the same `strip-h + gap` the strip is floating up
 * makes the two cancel exactly: the strip lands in the room this rule just
 * made, starting right where the card USED to start (immediately under the
 * header, past the existing 14px), and the card itself now starts exactly
 * one strip-height-plus-gap further down — with nothing in between but page
 * tone. Neither number is read off any header; both are read off the strip. */
const PANEL_BELOW_TABS =
  RECORD_TABS_GEOMETRY +
  " [&_[data-record-region=panel]]:mt-[calc(var(--record-tab-strip-h)_+_var(--record-tab-gap))]"

/** The class a record's TabsView wears so its bar pins under the collapsed line.
 * A string rather than a wrapper for the reason RecordBody explains.
 *
 * THREE ROUNDS, ALL 2026-08-31. Round one split this into "sticky" (pin under
 * the header while the record scrolls — wanted, unconditionally) and the
 * FOLDER-only "flush cap" this used to also draw (escape the panel's inset,
 * take its top radius, zero gap) — right for a folder strip's own attached
 * shape and wrong for every actual consumer of this constant, which is
 * always a LINE strip (`RECORD_TABS_CONFIG`). That round LANDED the strip
 * back INSIDE the panel's own padding (no escape at all, `bg-surface-panel`
 * to match), reasoning the card's own top padding would read as space above
 * the strip. It shipped WRONG — caught immediately against the client's own
 * screenshot, verbatim: "nononono, now you put them INSIDE the content
 * container!!! it must be on top, with blank space in between!!!" Sitting
 * INSIDE the same padded card, on the card's own tone, is indistinguishable
 * from being part of it — one continuous peachy block — no matter how much
 * padding surrounds the strip, because there is no colour break and no edge
 * to read as "outside". The reference (and the client's own words both
 * times) needs three things in one glance: the strip on the PAGE tone, then
 * BLANK space, then the card's own full rounded-rectangle top edge.
 *
 * Round two escaped the panel's inset again (the strip must leave the card's
 * own box to read as not-part-of-it — `Card` sets no `overflow: hidden`,
 * card.tsx: "the shell sets no overflow: hidden", so nothing here clips a
 * child that overshoots above the card's own border box) and went FURTHER
 * than the panel's padding alone, by the strip's own height plus a real gap
 * — short of that, the strip's own box still overlaps the card's rounded
 * corner instead of clearing it. That half was right, and survives below.
 * What round two got wrong was reaching for a bare pixel count (`-mt-[170px]`)
 * to do it, tuned by eye against one screen — see `RECORD_TABS_GEOMETRY`'s own
 * comment above for why that is a header-shaped hole and what replaces it.
 * It also never noticed that the SAME escape drags the tab PANEL up with it:
 * the strip and its `TabsContent` are siblings in one `flex-col gap-4` `Tabs`
 * root (tabs.tsx: `variant === "folder" ? "gap-0" : "gap-4"`), so a bigger
 * negative margin on the strip pulls the content's start position up by the
 * same amount, through that fixed 16px gap. Every real call site (every
 * `*-detail.tsx` in this app) hands `TabsView` a `renderPanel`, so this was
 * never a strip-only bug — the content itself was mis-set the same amount
 * the strip overshot, just harder to see without a ruler. `gap-[…]` below
 * replaces the kit's fixed `gap-4` with exactly the CARD's own top padding
 * plus the gap, which is precisely the room the content needs to still land
 * at the card's ordinary inset, whatever the strip above it is doing.
 *
 * `bg-background` (page tone, not the card's `bg-surface-panel`) is what
 * makes the strip read as sitting on the ambient band above the card rather
 * than as a paper cap ON it, and no `rounded-t`: a floating strip with a
 * real gap under it owns no corner to match, unlike the flush cap round
 * one's CHANGELOG (below) drew for the folder case. The `-mx`/`px` pair is
 * unchanged from round two — a plain cancel-and-restore of `CardContent`'s
 * own horizontal ladder, never the header-shaped problem the vertical side
 * was.
 *
 * CHANGELOG — the flush-cap shape a FOLDER-variant strip still wants,
 * preserved here as a pointer rather than a second unused export: cancel the
 * panel's inset on three sides (`-mx -mt px pt`, matching `CardContent`'s
 * own ladder exactly, not overshooting) and take the panel's own top radius
 * (`rounded-t-[var(--radius)]`), so the strip reads as a cap flush with the
 * card underneath, cut clean from the soft-paper body below it. No record
 * screen hands a folder-variant strip through here today — a main/collection
 * screen's own folder strip already has its OWN way to draw exactly that
 * attachment (`web/components/deep-link/screen-bits.tsx`'s
 * `SectionWithCreate` `folderTabs` slot, `CollectionCard
 * attached={Boolean(folderTabs)}`) — so reach for that seam rather than
 * rebuilding the escape trick here if a record's own strip ever needs the
 * folder shape.
 *
 * TWO MORE FIXES, 2026-09-01, BOTH IN THE SAME `-mx`/`px` PAIR ABOVE.
 *
 * 1 · THE LEFT EDGE NOW MATCHES THE HEADER'S, NOT THE CARD'S. Client, on a
 *     screenshot of the Academy app's own strip: the leftmost tab sat well
 *     right of "Academy" and its mark, a visible empty notch before
 *     "Overview" — she wants the tab strip's own left edge flush with the
 *     header's. The `+px-6`/`+px-[space-7]` half of the cancel-and-restore
 *     was RESTORING the CARD's own inset (`CardContent`'s `p-6`/`lg:p-
 *     [space-7]`, verbatim, per this file's own note above) — correct for
 *     lining the strip up with the PANEL's content, wrong for lining it up
 *     with the HEADER, which sits at a much narrower `px-1` (4px,
 *     `record-detail.tsx`'s region 1: "4 of inline breathing so the band's
 *     type lines up with the panel's inset below it"). Measured live: the
 *     header's own content sat flush with the escaped strip's OUTER edge
 *     (the `-mx` half already lands there), and the strip's first trigger
 *     then sat a further `space-6`/`space-7` inside it — exactly the gap in
 *     the screenshot. So the restore is now `px-1`, matching the header at
 *     every breakpoint (the header's own inset never grows at `lg`, so
 *     neither does this) rather than the card's own responsive ladder.
 * 2 · THE ROW NO LONGER STRETCHES PAST ITS OWN TABS. `[role=tablist]` is a
 *     flex child of `<Tabs>` (`flex flex-col`, tabs.tsx — no `items-start`),
 *     so with nothing of its own saying otherwise it STRETCHES to the full
 *     cross-axis width of whatever it sits in — which, once escaped by
 *     `-mx-6`/`-mx-[space-7]` above, is the CARD's own full outer width, not
 *     the strip's own content. A record with fewer tabs than that width
 *     (any of them, and worse the more tabs fall short) got a large, blank,
 *     unstyled rectangle immediately after its last tab — reachable,
 *     hoverable, and drawing nothing, which is exactly the "mis-sized empty
 *     container" a screenshot of the App detail screen's own long strip
 *     (FluClinic: twelve tabs, still short of a wide desktop's width) showed
 *     sitting where a toolbar might otherwise go. `self-start` is the whole
 *     fix — it opts this one flex child out of the column's default stretch,
 *     back to sizing itself off its own tabs, the same as `max-w-full` +
 *     `overflow-x-auto` already assumed it did. */
export const STICKY_TABS =
  "[&>[role=tablist]]:bg-background [&>[role=tablist]]:sticky [&>[role=tablist]]:top-[var(--record-tabs-top,0px)] [&>[role=tablist]]:z-10 " +
  "[&>[role=tablist]]:self-start [&>[role=tablist]]:-mx-6 [&>[role=tablist]]:px-1 " +
  "[&>[role=tablist]]:-mt-[calc(var(--space-6)_+_var(--record-tab-strip-h)_+_var(--record-tab-gap))] " +
  "gap-[calc(var(--space-6)_+_var(--record-tab-gap))] " +
  "lg:[&>[role=tablist]]:-mx-[var(--space-7)] " +
  "lg:[&>[role=tablist]]:-mt-[calc(var(--space-7)_+_var(--record-tab-strip-h)_+_var(--record-tab-gap))] " +
  "lg:gap-[calc(var(--space-7)_+_var(--record-tab-gap))]"
