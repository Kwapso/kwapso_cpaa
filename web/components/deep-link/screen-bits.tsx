// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.
//
// ── THE RULE FOR EVERY MAIN/COLLECTION SCREEN (client ruling, 2026-08-31,
// generalised from the Accounts fix the same day; the client's own words:
// "remember this is not for accounts [but] for all. main screens! make sure
// you are not applying fixes to one screen only, but to the rules" — THEN
// CORRECTED, same day, once it had been generalised onto every screen: "never
// align the button with the tabs — that button belongs in the right of the
// toolbar, part of the toolbar!") ───────────────────────────────────────────
//
// A main screen is: a title, then ONE card holding — top to bottom — a tab
// strip (if the screen genuinely has more than one view; plenty of main
// screens do not, and that is fine), then the toolbar (search / sort /
// filter / view-selector) on its OWN row below the tabs, with any action
// buttons (New/Import/Export) at the FAR RIGHT of THAT row — never sharing
// the tab strip's own line — then the data. Not every screen needs tabs — a
// single-view collection (Stories, Waves, Processes, Roles, Members, Invites,
// the knowledge base, Brand library…) just skips that strip and keeps the
// rest. What is never allowed is a tab strip carrying an action button beside
// it, an action row floating SEPARATE from the toolbar above it, or a toolbar
// sitting outside the card its rows are in.
//
// TWO MECHANISMS DRAW THIS, never a third invented at a call site — and both
// are now STRUCTURALLY unable to draw the shape the client corrected. A tab
// strip is never passed as raw JSX any more (a `React.ReactNode` prop cannot
// enforce "tabs alone" — it happily accepted a button folded in beside them,
// which is exactly what shipped for a few hours on 2026-08-31); it is a
// `FolderTabStrip` (config/value/onValueChange, ./tabs-view), and the slot
// renders `<TabsView>` FROM it. There is nowhere in that shape for a second
// node to hide.
//   • A PAGED collection (R14) uses `<PagedFind>`'s own `tabs` (a
//     `FolderTabStrip`, drawn alone) + `actions` (the row's own buttons, at
//     the right of the toolbar `wrap` boxes with the rows) — paged-find.tsx
//     has the whole shape. Accounts, Tickets and Meetings all draw this way;
//     Contacts draws the tab half with no actions (it has none).
//   • A BOUNDED collection uses THIS file's `SectionWithCreate` with its own
//     `folderTabs` slot (also a `FolderTabStrip`) for the tab strip ALONE —
//     passing `folderTabs` suppresses the header's own create button (see the
//     prop's own doc below) rather than sharing the tabs' row with it, so the
//     call site draws that button itself, in its own `<ToolbarRow>` (this
//     file, below) — a search box plus actions, or — where there genuinely is
//     no search — actions alone, still below the tabs and still inside the
//     card. Apps, Sprints and Tasks all draw this way.
// The next screen that ships a tab strip reaches for one of these two, not a
// third arrangement — and the bounded one's own toolbar reaches for
// `<ToolbarRow>` rather than a hand-written `<div>`, so its actions land
// pinned right by construction instead of by copying the class names right.

import * as React from "react"

import { cn } from "@shared/ui/lib/utils"
import { Button, buttonVariants } from "@shared/ui/components/button/button"
import { Card, CardContent } from "@shared/ui/components/card/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@shared/ui/components/tooltip/tooltip"
import { Plus, Mail, Upload, Download, Lock, SearchX, TriangleAlert } from "@shared/ui/foundations/icons"
import { Icon, type IconName } from "@shared/web/screen-engine/icon"
import { CollectionCreateActionProvider } from "@shared/web/screen-engine/collection-frame"
import { type FolderTabStrip, renderFolderTabs } from "@shared/web/screen-engine/tabs-view"

import { CONCEPT_ICON } from "@/lib/pages"
import { useT } from "@shared/web/language"

/** A state with nothing in it still gets a face. One glyph in the leading slot,
 * `aria-hidden` beside the sentence that carries the meaning (UI-CONVENTIONS §5)
 * — a bare line of grey text in the middle of a page reads as a screen that
 * failed rather than a screen with nothing on it. */
function StateLine({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Lock
  tone?: "muted" | "destructive"
  children: React.ReactNode
}) {
  const colour = tone === "destructive" ? "text-destructive" : "text-muted-foreground"
  return (
    <p className={`flex items-center gap-2 text-sm ${colour}`}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  )
}

/** A COLLECTION WITH NOTHING IN IT — the same face `StateLine` gives a refusal
 * or a 404, for the far commoner state: a panel, a tab or a list that is empty
 * because nothing has happened yet.
 *
 * WHY IT IS A SEAM AND NOT A CLASS NAME. There were twenty-five of these
 * written out by hand across the agency screens, every one a bare grey `<p>`,
 * and a lone line of grey text in the middle of a card reads as a screen that
 * FAILED rather than one with nothing on it yet — which is precisely the screen
 * a brand-new team meets on every page. `StateLine` above has said so in a
 * comment since the deep-link states were extracted; nothing else could reach
 * it.
 *
 * THE GLYPH IS DERIVED, never chosen here. It comes from `CONCEPT_ICON` — the
 * one icon vocabulary (UI-CONVENTIONS §4) — keyed by the concept the empty
 * collection is OF, so the face on "no meetings yet" is the face the rail, the
 * heading and the tab already wear for a meeting. A caller cannot pick a glyph
 * that disagrees with the rest of the app, because there is nowhere to pick one.
 *
 * IT IS `aria-hidden`, like every other mark on both front doors: the sentence
 * beside it carries the whole meaning, and a screen reader announcing "calendar
 * clock, no meetings with them yet" is one fact read twice.
 *
 * WHAT IT IS NOT FOR: a refusal ("you can't see the team"), a 404 ("that ticket
 * no longer exists") or a caption under a number. Those are `NoAccess`,
 * `NotFound` and ordinary copy — an empty collection is a state a person can
 * fix, and the three above are not. */
export function EmptyLine({
  concept,
  children,
}: {
  /** the CONCEPT_ICON key for what this collection holds — `meetings`, `tickets`,
   * `time`. Typed to the vocabulary so a key it has no entry for cannot be
   * passed, which is the difference between "no glyph" and "a wrong one". */
  concept: keyof typeof CONCEPT_ICON
  children: React.ReactNode
}) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <span aria-hidden className="shrink-0">
        <Icon name={CONCEPT_ICON[concept] as IconName} className="size-4" />
      </span>
      {children}
    </p>
  )
}

export function NoAccess() {
  const t = useT()
  return (
    <StateLine icon={Lock}>
      {t("You don't have access to this, or it doesn't exist.")}
    </StateLine>
  )
}

export function NotFound() {
  const t = useT()
  return <StateLine icon={SearchX}>{t("That screen doesn't exist.")}</StateLine>
}

export function LoadError({ what }: { what: string }) {
  const t = useT()
  return (
    <StateLine icon={TriangleAlert} tone="destructive">
      {t("Couldn't load {what}.", { what })}
    </StateLine>
  )
}

/** Box a collection (its title/search/filter/rows) into ONE card surface so it
 * reads as a single unit. The engine renders each list as surface="none" so this
 * Card is the single box (no card-in-a-card); since library 0.4.0 the flat list
 * rounds + clips its own row-group, so the hover/selected highlight follows the
 * corners here just like the library demo (UI-GAPS #12, shipped).
 *
 * `attached`: this box sits directly under a FOLDER tab strip (`SectionWithCreate`'s
 * `folderTabs`, on a call site that has NOT flipped to `useKitPanel` — a bespoke
 * body like a month grid or a grouped list that never touches `CollectionFrame`,
 * so it has no toolbar of its own to draw the kit's `relative z-[2]` for it).
 * The kit's own two panels that DO attach to a folder strip — `TabsContent`
 * (tabs/tabs.tsx) and `CollectionFrame` (components/collection-frame/
 * collection-frame.tsx) — both carry `relative z-[2] bg-surface-panel`, the
 * middle number in chapter 24.3's three: below the active tab's `z-3`, above
 * an inactive tab's `z-1`, so an inactive tab is "clipped by the card edge" as
 * ch14 puts it. This box already carries `bg-surface-panel` (`Card`'s own
 * `default` variant) but never `position`/`z-index` — a plain static box paints
 * BELOW any positioned sibling regardless of that sibling's z-index, folder tab
 * strip included, so with no stacking context of its own EVERY tab (inactive
 * ones too) painted in front of it. `attached` is the one class that was
 * missing, not a new colour or a new component.
 *
 * `attached` ALSO ADDS A LITTLE EXTRA HEADROOM AT THE TOP — client ruling,
 * 1 Sep 2026: "great work in the main screen, however I'd like a bit of 'body
 * of the folder' like space between the tab and the scrollable list." This is
 * a DIFFERENT gap from the zero one `SectionWithCreate`'s `folderTabs` column
 * and `PagedFind`'s own root both keep with NO `gap-*` class: that outer gap
 * has to stay exactly zero, because the folder strip's negative
 * `--folder-tab-overlap` margin needs its ACTUAL next sibling to melt into —
 * "16 - 17.02 leaves ONE pixel of overlap where seventeen were meant: the tabs
 * float, their feet show" (`SectionWithCreate`'s own `folderTabs` doc). This
 * `pt-6` is entirely INSIDE that same card, below the overlap and below the
 * seam where the active tab's fill already reads as continuous with the
 * panel — it makes the fold itself no less flush, it only gives the fold's
 * own body more air before the first row, the way a real folder's paper has
 * some depth before whatever is filed inside it starts. Scoped to `attached`
 * only: a `CollectionCard` with no folder strip above it (there are a few)
 * keeps the plain, even `p-4` it always had — nothing about its own top asked
 * for more room. */
export function CollectionCard({
  children,
  attached = false,
}: {
  children: React.ReactNode
  attached?: boolean
}) {
  return (
    <Card className={cn(attached && "relative z-[2]")}>
      <CardContent className={cn("p-4", attached && "pt-6")}>{children}</CardContent>
    </Card>
  )
}

/** THE ADD BUTTON, wherever one appears (UI-RULEBOOK B3 / D9, CHECKLIST 11.7).
 *
 * A plus glyph and nothing else. The words it used to carry become the button's
 * accessible name and its tooltip, which is where a label belongs on a control
 * whose meaning is already in the collection it sits above.
 *
 * It is a seam and not a class string because it was written out ten times, in
 * six files, for the same act — and ten copies is ten chances for the eleventh
 * sub-collection to grow a wordy button again. */
export function AddButton({
  label,
  onClick,
  icon,
  disabled,
}: {
  /** The old label. Now the accessible name and the tooltip. */
  label: string
  onClick: () => void
  /** Defaults to `Plus` — the UI-CONVENTIONS §4 icon for create. */
  icon?: React.ReactNode
  /** e.g. a related write already in flight on the same screen. */
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" onClick={onClick} aria-label={label} disabled={disabled}>
          {icon ?? <Plus className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A BOUNDED COLLECTION'S OWN TOOLBAR ROW — the one shape a call site reaches
 * for below a `folderTabs` strip, still inside the card, whenever its tab body
 * is bespoke (a grouped list, a month grid, a chart) rather than a
 * `useKitPanel`-drawn `CollectionFrame`, which already draws this row for you.
 *
 * IT EXISTS BECAUSE FOUR SCREENS WROTE IT OUT BY HAND. Apps' own search-and-
 * button row, Sprints' bare button row (twice, Overview and Calendar) and
 * Tasks' bare button row (Calendar) were four near-identical
 * `<div className="flex justify-end">…</div>`s, each one a fresh chance to put
 * the button on the wrong side or forget `flex-wrap` and clip it on a phone.
 * One seam now, so the fifth tab body that needs a bare toolbar reaches for
 * this instead of writing a fifth copy.
 *
 * ONE ROW, ALWAYS (client ruling, 2026-09-01: the toolbar spec Aurora
 * approved that night, generalised the way every toolbar shape here is —
 * "not for one screen only, but the rules"). `search`, then `filters`, then
 * `sort`, then `actions` pinned to the far right — never a second row, and
 * `flex-wrap` on this one is an OVERFLOW fallback for a narrow viewport, not a
 * designed two-tier layout.
 *
 * BEFORE THIS, `filters` DID NOT EXIST HERE — Apps and Sprints each rendered
 * their own `<FilterBar>` as a sibling BELOW this row, which is exactly the
 * client's screenshot: `[Search apps…] [Sort by] [Name ▾]` on one row, and a
 * standalone dashed "Filter" chip floating, disconnected, on a second one.
 * Two call sites is two chances to draw that shape by hand, so it is a slot of
 * this component now, the same way `search` and `actions` already are.
 *
 * `filters` (and `sort`) are wrapped in their own non-growing flex box rather
 * than rendered bare: `FilterBar` (`shared/web/screen-engine/filter-bar.tsx`)
 * renders `w-full` internally — the kit's own chip row is meant to claim a
 * full line when it is the ONLY thing on it — and a bare `w-full` child inside
 * this flex row would claim the rest of the line for itself and push
 * `actions` onto a line of its own, which is the same two-row shape one level
 * down. The kit's OWN toolbar (`shared/ui/components/collection-frame/
 * collection-frame.tsx`) wraps its `filters` slot the identical way for the
 * identical reason (`<div className="flex min-w-0 flex-wrap items-center
 * gap-2">{filters}</div>`) — this is that same wrapper, so a bounded
 * collection's bare toolbar and the kit panel's own toolbar read as the same
 * control in two places.
 *
 * FIVE NAMED SLOTS, NOT A HARDCODED ROW. Each is independently optional (a
 * caller with no facets passes no `filters`, exactly as one with no search
 * passes no `search`), and the ORDER is this component's, not the call
 * site's — the same discipline the kit's own contract keeps. `view` was
 * added 2026-09-01, first reached by Apps' Tiles/List switch (apps-screen.tsx)
 * — CH27.13's own order (search, filters, view switcher, actions) is why it
 * sits between `sort` and `actions` rather than anywhere else. */
export function ToolbarRow({
  search,
  filters,
  sort,
  view,
  actions,
  className,
}: {
  /** A search box, or any other left-aligned control. Omitted where the tab
   * body has none (Sprints' Overview/Calendar, Tasks' Calendar, Tickets'
   * Triage) — the row is then the actions alone, still pinned right. */
  search?: React.ReactNode
  /** The active-facet chips + "+ filter" affordance (`FilterBar`), between
   * `search` and `sort` — the same position the design kit's own toolbar
   * contract fixes (search → filters → … → actions). Omitted wherever a
   * screen has no facets, exactly like `search`. */
  filters?: React.ReactNode
  /** The sort control, after `filters` and before the pinned-right
   * `actions` — a `SortControl`, typically. Omitted wherever a screen has
   * nothing to sort by. */
  sort?: React.ReactNode
  /** THE VIEW SWITCH — a `ViewSwitch` pill (`shared/ui/components/
   * collection-frame/view-switch.tsx`), after `sort` and before the
   * pinned-right `actions`. Omitted wherever a screen offers only one body
   * (`ViewSwitch` itself already renders nothing for fewer than two views,
   * so a caller can pass it unconditionally once it has more than one). */
  view?: React.ReactNode
  /** THE ROW'S OWN ACTION BUTTONS (New/Import/Export…), pinned to the far
   * right — the same `ml-auto` `PagedFind`'s own toolbar uses for its
   * `actions` slot, so a bounded collection's bare toolbar and a paged one's
   * read as the same control in two places. */
  actions?: React.ReactNode
  className?: string
}) {
  if (!search && !filters && !sort && !view && !actions) return null
  return (
    <div
      className={cn(
        // THE TRACK — client, 1 Sep 2026, pointing at her own reference
        // artifact: every control sits inside ONE visibly distinct pill,
        // a step lighter than the panel it's drawn on (`bg-background`
        // against the card's own `bg-surface-panel`), not floating loose
        // chips on the panel's bare paper. `rounded-pill` at the row's own
        // height reads as the same stadium shape every other pill in this
        // app already uses; the inline-start padding is slightly deeper
        // than the others so the search icon doesn't sit flush on the seam.
        "flex flex-wrap items-center gap-2 rounded-pill bg-background py-1.5 pe-1.5 ps-4",
        className
      )}
    >
      {search}
      {filters && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
      {sort && <div className="flex min-w-0 flex-wrap items-center gap-2">{sort}</div>}
      {view && <div className="flex min-w-0 flex-wrap items-center gap-2">{view}</div>}
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A list screen with a host-rendered create button above it (the engine list
 * has no "add" affordance — creating opens a ?panel form). The collection itself
 * is boxed in a CollectionCard so title/search/filter/rows read as one unit. */
export function SectionWithCreate({
  show,
  label,
  icon,
  onCreate,
  secondary,
  download,
  aboveCard,
  folderTabs,
  useKitPanel,
  children,
}: {
  show: boolean
  label: string
  icon: "plus" | "mail"
  onCreate: () => void
  /** An optional second action beside the create button — today the contextual
   * "Import CSV" affordance on import-target pages (Learning / Member roles). */
  secondary?: { show: boolean; label: string; onClick: () => void }
  /** An optional DOWNLOAD action (Export CSV): a plain link so the browser saves
   * the file with the session cookie — export needs only READ, so it shows for
   * anyone who can see the screen (hidden while the list is empty). */
  download?: { show: boolean; label: string; href: string }
  /** Content shown between the create row and the boxed collection, OUTSIDE the
   * card — e.g. the Tickets My/All raiser strip (it scopes the list, not part of it). */
  aboveCard?: React.ReactNode
  /** A FOLDER tab strip, drawn flush against the top of the collection card.
   *
   * It is a slot of its own rather than more `aboveCard`, and the reason is one
   * number. The kit's folder strip already pulls itself down by
   * `--folder-tab-overlap` (17.02) so the panel below covers the tabs' cut
   * feet — chapter 14's join, and the whole of why the active tab reads as
   * attached. `aboveCard` sits in a `gap-4` column, and 16 - 17.02 leaves ONE
   * pixel of overlap where seventeen were meant: the tabs float, their feet
   * show, and the shape reads as broken rather than as a folder. So this slot
   * renders in a column of its own with no gap at all, and the decision lives
   * here once instead of as a negative margin at every call site.
   *
   * Only a `variant: "folder"` strip belongs here. A `line` strip has no feet
   * to hide and wants the gap.
   *
   * TABS ALONE — never the row's action buttons beside it, and now that is the
   * SHAPE of the prop, not a rule about how to fill it. An earlier fix the
   * same day (2026-08-31) pulled `show`/`secondary`/`download` in beside this
   * strip, by passing a `ReactNode` that happened to hold both; the client then
   * corrected that: "never align the button with the tabs — that button
   * belongs in the right of the toolbar, part of the toolbar." A `FolderTabStrip`
   * (config/value/onValueChange, ./tabs-view) cannot hold a second thing beside
   * the tabs, because the slot renders `<TabsView>` from it rather than
   * whatever the caller handed over — so passing `folderTabs` now suppresses
   * the header's OWN create button instead of sharing a row with it
   * (`showCreateInHeader` below, exactly the reason `useKitPanel` already
   * suppresses it) — the call site draws that button itself, in its own
   * `<ToolbarRow>` (below), at the right of ITS OWN toolbar, below the tabs and
   * still inside the card (apps-screen.tsx/sprints-screen.tsx/
   * tasks-screen.tsx each do this now). */
  folderTabs?: FolderTabStrip
  /**
   * The collection below draws through the kit's own
   * `components/collection-frame/collection-frame.tsx` (the engine's
   * `useKitPanel`), which means it already draws its own soft-paper box AND
   * its own create control in the toolbar's `actions` slot — the panel is
   * the box now, and `CollectionCard` on top of it would be the double-box
   * the kit's own `tone` doc calls "the broken combination" (measured
   * invisible today only because both surfaces happen to share one token;
   * COMPOSITION-MISMATCHES.md has the full account). Two things change:
   * `CollectionCard` is skipped (`children` renders directly, straight onto
   * `ScreenShell`'s own off-beige body pane), and the header's own AddButton
   * is skipped too, because the panel's `actions` slot already carries a
   * labelled create button — the ONE-mango law this app has followed all
   * session, not two create controls for the same act.
   */
  useKitPanel?: boolean
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  const showSecondary = secondary?.show ?? false
  const showDownload = download?.show ?? false
  // See `useKitPanel` above: the panel's own toolbar carries the create
  // control, so the header row's copy of it would be a second mango for
  // one act. `folderTabs` suppresses it for the same reason a folder strip's
  // OWN row is never where this button belongs any more (client ruling,
  // 2026-08-31) — the call site draws it itself, in its own toolbar.
  const showCreateInHeader = show && !useKitPanel && !folderTabs
  const hasActions = showCreateInHeader || showSecondary || showDownload
  // THE ACTION BUTTONS (Export/Import/New) THEMSELVES, wherever the row below
  // ends up putting them — the buttons are decided once, here; only their ROW
  // changes shape depending on whether there is a folder strip to share it
  // with (see the return below).
  const actionButtons = hasActions ? (
    <>
      {showDownload && download && (
        <a href={download.href} className={cn(buttonVariants({ variant: "secondary" }), "gap-1")}>
          <Download className="size-4" />
          {download.label}
        </a>
      )}
      {showSecondary && secondary && (
        <Button variant="secondary" onClick={secondary.onClick} className="gap-1">
          <Upload className="size-4" />
          {secondary.label}
        </Button>
      )}
      {/* THE ADD BUTTON IS A GLYPH (UI-RULEBOOK B3, CHECKLIST 11.7). One seam,
          so every collection in the agency app loses its label at once, and
          the thirteen labels it deletes ("New task", "Start a sprint", "Raise
          ticket", "Map a process"…) become the accessible name and the
          tooltip rather than disappearing. That also ends the two competing
          naming families the screens had grown, "New <noun>" and "<verb> a
          <noun>", without anybody having to choose between them.
          Import and Export keep their words above (B4): they are rare,
          consequential and not guessable from a glyph. */}
      {showCreateInHeader && <AddButton label={label} onClick={onCreate} icon={<Icon className="size-4" />} />}
    </>
  ) : null
  // `attached`: a folder strip sits directly above this box (`folderTabs`) and
  // this call site has NOT flipped to `useKitPanel` — `CollectionCard` is
  // standing in for the kit's own `relative z-[2]` panel (`TabsContent` /
  // `CollectionFrame`), so it has to carry that stacking itself or every tab,
  // active or not, paints in front of it. See `CollectionCard`'s own doc.
  const collection = useKitPanel ? (
    children
  ) : (
    <CollectionCard attached={Boolean(folderTabs)}>{children}</CollectionCard>
  )
  return (
    <div className="flex flex-col gap-4">
      {/* NO STRIP TO SHARE A ROW WITH — the actions keep the plain row above
          everything, right-aligned, the shape this always had. `justify-end`
          alone pushes overflow off the LEFT edge where the container hides it
          (the owner's cut-off button), so this still wraps rather than clips
          (UI-CONVENTIONS "Action-button rows never clip"). */}
      {!folderTabs && actionButtons && (
        <div className="flex flex-wrap justify-end gap-2">{actionButtons}</div>
      )}
      {aboveCard}
      {/* No gap: the folder strip's own negative margin IS the join — the tab
          row has to be the ACTUAL next sibling of the card for its
          pulled-down feet to melt into it. */}
      <div className="flex flex-col">
        {/* TABS ALONE (client ruling, 2026-08-31, correcting the same day's
            earlier fix which shared this line with the row's action buttons):
            the button never aligns with the tabs any more. A caller that also
            has actions draws them itself, in its own `<ToolbarRow>` at the
            right of its OWN toolbar below this strip — still inside the card
            (apps-screen.tsx/sprints-screen.tsx/tasks-screen.tsx). */}
        {renderFolderTabs(folderTabs)}
        {/* THE SAME ACTION, PUBLISHED DOWNWARDS. An empty collection has to
            name the next act, and until now it could not: this button is here,
            in the host, and the collection that is empty is several layers
            below inside the screen engine. So the act is published rather than
            re-authored — the same word, the same glyph and the same handler —
            and the frame draws it in its zero state. `null` while the caller
            may not create, which is the same condition that hides the button
            above; a person without the right is shown no way out because there
            is not one for them. Published regardless of `useKitPanel`: the
            kit panel's own ready-state `actions` slot reads it too (the
            engine's `createButton`), not only the empty register. */}
        <CollectionCreateActionProvider
          action={
            show
              ? {
                  label,
                  icon: <Icon className="size-4" />,
                  onCreate,
                  // THE SAME IMPORT ACT, PUBLISHED DOWNWARDS, exactly the way
                  // `onCreate` already is above — a genuinely-empty collection
                  // several layers below (CollectionFrame's own
                  // `CollectionEmptyState`) can only offer "Import a list"
                  // where this exists, and it only exists where the host
                  // actually wired `secondary` (an import-target screen,
                  // e.g. Member roles / Dropdown values) AND the reader holds
                  // the right (`showSecondary`, already gated above).
                  secondary:
                    showSecondary && secondary
                      ? { label: secondary.label, onClick: secondary.onClick }
                      : undefined,
                }
              : null
          }
        >
          {collection}
        </CollectionCreateActionProvider>
      </div>
    </div>
  )
}
