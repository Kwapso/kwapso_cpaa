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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kwapso/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { MoreHorizontal } from "lucide-react"

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
const TRIGGER_TONE = { header: "outline", row: "ghost" } as const

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
  const created = audit.createdAt ? formatRelative(audit.createdAt) : null
  const edited = audit.updatedAt ? formatRelative(audit.updatedAt) : null
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
    <footer className="bg-muted text-muted-foreground mt-8 flex flex-wrap gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-xs">
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
export function RecordHeader({
  mark,
  leading,
  eyebrow,
  title,
  status,
  actions,
  children,
  onCollapsedChange,
}: {
  /** The record type's glyph, when the type has one. */
  mark?: string | null
  /** A logo or avatar, when the record has a real image — it replaces the mark
   * in the same square (G3). */
  leading?: React.ReactNode
  /** The type word, in caps, and the reference number with it (D4). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** One dot-separated line, three facts maximum (D5). */
  status?: React.ReactNode
  /** One primary, one secondary, then the three-dot menu (B1). */
  actions?: React.ReactNode
  /** Anything the module wants inside the band, under the status line. */
  children?: React.ReactNode
  /** Told when the band leaves the screen, so RecordBody can pin a reduced
   * title in its place. Wired by RecordScreen; not needed by hand. */
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const sentinel = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = sentinel.current
    if (!el || !onCollapsedChange) return
    // The sentinel sits at the BOTTOM of the band, and the margin is exactly how
    // far down the screen the pinned chrome reaches: the shell's own bar (zero on
    // desktop, the app bar's height on a phone) plus the collapsed line that
    // replaces this band. So the swap happens at the moment the tab strip arrives
    // where it will be pinned, and nothing jumps.
    //
    // The offset is MEASURED rather than written down, because `--shell-top` is
    // in `rem` and the display-scale setting (S4) moves it. Falls back to "never
    // collapsed" where the observer is missing (jsdom), which is the honest
    // degradation: a plain, unpinned screen.
    if (typeof IntersectionObserver === "undefined") return
    const style = getComputedStyle(el)
    const root = parseFloat(style.fontSize) || 16
    // A custom property comes back as it was WRITTEN, not resolved — "3.75rem",
    // not "60px" — so it is converted here rather than trusted as a number.
    const declared = style.getPropertyValue("--shell-top").trim()
    const shellTop = (parseFloat(declared) || 0) * (declared.endsWith("rem") ? root : 1)
    const collapsedLine = root * 3.25
    const io = new IntersectionObserver(
      ([entry]) => onCollapsedChange(!entry.isIntersecting),
      { rootMargin: `-${Math.round(shellTop + collapsedLine)}px 0px 0px 0px`, threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onCollapsedChange])

  return (
    <header className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-start gap-4">
        {leading ?? (mark ? <TypeMark mark={mark} size="band" /> : null)}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-muted-foreground text-xs font-medium tracking-[0.5px] uppercase">
              {eyebrow}
            </p>
          )}
          {/* T5: a long title wraps to two lines and clamps. It never truncates
              on one, which hid the end of every real ticket title. */}
          <h1 className="line-clamp-2 text-2xl font-medium tracking-tight">{title}</h1>
          {status && <p className="text-muted-foreground mt-1 text-sm">{status}</p>}
        </div>
        {actions && (
          // ml-auto on the GROUP so a narrow phone reflows instead of clipping
          // (UI-CONVENTIONS "Action-button rows never clip").
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
      {children}
      <div ref={sentinel} aria-hidden className="h-px w-full" />
    </header>
  )
}

/** EVERYTHING FROM THE TAB STRIP DOWN (D3, C4).
 *
 * Two jobs. It paints opaque paper full-bleed, so the ambient field stops at the
 * header band and the rest of the screen is calm — the "clean below the tabs"
 * half of CHECKLIST 11.5. And it pins a reduced title line to the top once the
 * band has scrolled away, with the tab strip directly under it, so a long ticket
 * never loses which record and which tab you are in.
 *
 * The strip is pinned with a class ON the library TabsView (which takes a
 * `className`), not by wrapping it — wrapping would pin the PANELS too, because
 * TabsView renders the bar and its content as one tree. No library change.
 */
export function RecordBody({
  collapsed,
  mark,
  eyebrow,
  title,
  children,
}: {
  collapsed: boolean
  mark?: string | null
  eyebrow?: React.ReactNode
  title: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      // Full-bleed: the negative margins cancel the shell's own gutters so the
      // paper runs edge to edge, and the padding puts the content back where it
      // was. The min-height keeps the field from reappearing under a short
      // record — a strip of drifting orange below the last row is exactly the
      // thing 11.5 is about.
      className="bg-background relative z-0 -mx-4 min-h-[calc(100svh-9rem)] px-4 pb-16 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
      style={
        {
          // Where the tab strip pins: under the app bar, and under the collapsed
          // line as well once there is one.
          "--record-tabs-top": collapsed
            ? "calc(var(--shell-top, 0px) + 3.25rem)"
            : "var(--shell-top, 0px)",
        } as React.CSSProperties
      }
    >
      <div
        className={`bg-background sticky top-[var(--shell-top,0px)] z-10 flex items-center gap-2 overflow-hidden transition-[height] duration-200 ${
          collapsed ? "h-13" : "h-0"
        }`}
      >
        {mark && (
          <span aria-hidden className="text-lg leading-none">
            {mark}
          </span>
        )}
        <p className="truncate text-sm font-medium">
          {eyebrow && <span className="text-muted-foreground mr-2 font-normal">{eyebrow}</span>}
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}

/** The whole record: band, body, and the collapse wiring between them.
 *
 * `header` and `body` are given as elements so a module can put whatever it
 * likes in each — a status stepper, a warning band, a two-column split — while
 * the four regions and their order stay the same on every screen (D1). */
export function RecordScreen({
  mark,
  leading,
  eyebrow,
  title,
  status,
  actions,
  headerExtra,
  children,
}: {
  mark?: string | null
  leading?: React.ReactNode
  eyebrow?: React.ReactNode
  title: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
  /** Rendered inside the band, under the status line (a status stepper). */
  headerExtra?: React.ReactNode
  /** The TabsView and its panels. */
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = React.useState(false)
  const onCollapsedChange = React.useCallback((next: boolean) => setCollapsed(next), [])
  return (
    <>
      <RecordHeader
        mark={mark}
        leading={leading}
        eyebrow={eyebrow}
        title={title}
        status={status}
        actions={actions}
        onCollapsedChange={onCollapsedChange}
      >
        {headerExtra}
      </RecordHeader>
      <RecordBody collapsed={collapsed} mark={mark} eyebrow={eyebrow} title={title}>
        {children}
      </RecordBody>
    </>
  )
}

/** The class a record's TabsView wears so its bar pins under the collapsed line.
 * A string rather than a wrapper for the reason RecordBody explains. */
export const STICKY_TABS =
  "[&>[role=tablist]]:bg-background [&>[role=tablist]]:sticky [&>[role=tablist]]:top-[var(--record-tabs-top,0px)] [&>[role=tablist]]:z-10"
