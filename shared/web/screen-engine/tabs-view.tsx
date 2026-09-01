"use client"

// TabsView — the config-driven tab strip. ENGINE-OWNED, KIT-DRAWN.
//
// The OLD library's TabsView took a `TabsConfig` (tabs as data, with icons,
// counts and visibility rules) and 21 call sites plus the screen engine feed
// it that way. The kit's own TabsView takes an `items` array instead, so this
// file keeps the old CONTRACT and renders it entirely through the kit's
// `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` — behaviour is the
// app's, every pixel is the kit's.
//
// Two deliberate translations, both the kit's rulings rather than ours:
//  · `variant: "pill"` no longer exists (kit tabs are `line` | `folder`; the
//    review ruled pill was a segmented control wearing a tab's name). A config
//    asking for "pill" renders `line`.
//  · Counts and tags are QUIET TEXT, never badges — ch14: "counts are quiet,
//    never badges". The old `badgeVariant` colour is therefore not drawn.
//
// Icons: a TabItem carries an icon NAME as serialisable data, resolved against
// the kit and nothing else. It used to resolve against the kit FIRST and the
// full lucide set second, because the kit drew 96 glyphs and the app needed
// more; the kit draws 1,383 now, so the second half is deleted rather than
// left as a net. It was not a harmless net: when the art became Iconoir on
// 2026-08-27 that fallback silently kept thirty-seven names rendering LUCIDE,
// beside Iconoir art, on the same strip, with nothing going red. A name the
// kit cannot draw now renders nothing here and fails the census in
// web/test/icon-vocabulary.test.ts, which is the loud version of the same
// safety. (The original bug the fallback fixed — "info" and "user" drawing
// nothing on a tab while the heading beside it drew fine — stays fixed: both
// resolve through the one shared alias table in ./icon-names.)

import * as React from "react"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/components/tabs/tabs"
import { cn } from "@shared/ui/lib/utils"

import { iconComponent } from "./icon"
import { type IconName } from "./icon-names"

import { type BaseConfig, defaultBaseConfig } from "./config"
import { useIsVisible } from "./visibility"

export interface TabItem {
  value: string
  label: string
  /** A STRING is read as an icon name, kebab-case (e.g. "inbox", "file-pen"),
   *  and `""` = no icon — a tab set stays plain, serialisable data. Any other
   *  node is rendered as-is. */
  icon: React.ReactNode
  /** A count or short tag (e.g. "24", "New"). `""` = none. Rendered as quiet
   *  tabular text per the kit's ch14, whatever `badgeVariant` says. */
  badge: string
  /** Kept for config compatibility; the kit rules that counts are quiet text,
   *  so the colour is no longer drawn. */
  badgeVariant: "" | "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface TabsConfig extends BaseConfig {
  tabs: TabItem[]
  /** "line" | "folder" are the kit's; "pill" is accepted and drawn as "line". */
  variant: "pill" | "line" | "folder"
  fullWidth: boolean
}

export const defaultTabsConfig: TabsConfig = {
  ...defaultBaseConfig,
  tabs: [],
  /**
   * FOLDER, and it is the DEFAULT rather than a per-screen choice.
   *
   * The kit draws the brand's own folder silhouette for a tab strip — chapter
   * 24.3 for tabs and 24.6 for record chrome — so a record's tabs and a
   * collection's tabs are both that shape. This value used to be `line`,
   * written before the folder existed, and sixteen screens then hard-coded
   * `line` on top of it. The result was the folder appearing on three screens
   * and nowhere else, which reads as a design system that does not propagate.
   * It propagated fine; the decision had simply been made sixteen times.
   *
   * THE RULE, so the next strip does not have to guess: a strip that switches
   * between RECORDS or between COLLECTIONS takes the folder and says nothing
   * here. A strip that filters WITHIN one collection is not a folder — it has
   * no card of its own to be attached to — and says `variant: "line"` with a
   * reason beside it. There are two of those, and they are the only two.
   */
  variant: "folder",
  fullWidth: false,
}

/** kebab-case name → the kit's icon component, or null for a name it cannot
 * draw. One resolution path, shared with `<Icon>` in ./icon. */
export function kitIcon(name: string): React.ReactNode {
  const Glyph = iconComponent(name)
  return Glyph ? React.createElement(Glyph, { size: 16 }) : null
}

/** THE TAB VOCABULARY — one icon per tab identity, wherever a LINE strip draws
 * one (a folder strip draws none at all — see `tabIcon` below).
 *
 * The owner's rule (25 Aug 2026) was that every folder tab carries an icon;
 * the owner reversed that rule (31 Aug 2026, repeated a second time for
 * emphasis: "folder tabs have no icons — fix"), so this table now only feeds
 * a LINE tab's icon. It is kept (rather than deleted) because the identity it
 * encodes — "the same tab means the same icon on every screen" — still holds
 * for the line-tab case (a record's own sub-tabs), and because a future
 * reversal should not have to reconstruct the vocabulary from scratch.
 *
 * A value outside the table keeps the call site's icon on a line strip. Every
 * name in it is proved drawable by web/test/icon-vocabulary.test.ts. */
export const TAB_ICONS: Record<string, IconName> = {
  overview: "info",
  activity: "history",
  // WHAT THIS RECORD IS CONNECTED TO — the relationship map's tab. Beside
  // `overview` and `activity` rather than with the record kinds below, because
  // like those two it is a VIEW of the record you are already standing on and
  // not a collection of something else.
  map: "network",
  // the record kinds, matching CONCEPT_ICON in web/lib/pages.ts word for word
  apps: "app-window",
  companies: "building-2",
  contacts: "contact",
  // Contacts' own By company / All pair (contacts-screen.tsx) — grouped is the
  // company arrangement, so it takes the same glyph `companies` above draws.
  grouped: "building-2",
  deliverables: "package",
  impact: "piggy-bank",
  knowledge: "library-big",
  meetings: "calendar-clock",
  sprints: "calendar-range",
  stories: "hammer",
  tickets: "life-buoy",
  time: "timer",
  todos: "inbox",
  versions: "git-branch",
  waves: "layers",
  portal: "key-round",
  rates: "banknote",
  maps: "route",
  // the process record's own strip and its inner view switch
  steps: "list-checks",
  list: "list",
  flow: "workflow",
  compare: "columns-2",
  conversation: "message-square",
  // record-specific sections
  organisation: "network",
  stakeholders: "users-round",
  modules: "blocks",
  permissions: "shield-check",
  source: "file-text",
  files: "paperclip",
  notes: "notebook-pen",
  // the draft review's three lists of proposed records
  roles: "user-cog",
  tools: "wrench",
  // collection filters that appear as strips
  //
  // `open` and `done` are the two piles a thing-to-be-finished sits in, and they
  // are here rather than at a call site because two screens already draw them:
  // the task strip's own List/Completed pair and the to-do panel's Open/Done.
  // Same idea, same glyph, decided once — `open` is deliberately the same inbox
  // the task strip had chosen for itself, so nothing moves by adding it.
  open: "inbox",
  done: "check",
  all: "asterisk",
  active: "circle-check",
  inactive: "circle-off",
  archived: "archive",
  week: "calendar-days",
  calendar: "calendar",
  // the agency's own record (the Kwapso screen)
  details: "scroll-text",
  team: "building",
  brand: "palette",
  // the Settings screen's own four tabs (settings-screen.tsx, 1 Sep 2026),
  // matching that file's own tabsConfig icon-for-icon.
  appearance: "palette",
  members: "users-round",
  integrations: "key-round",
  choices: "list-checks",
}

/** What a tab actually draws. A FOLDER TAB NEVER DRAWS ONE — the owner's 31
 * Aug 2026 ruling, stated twice: "folder tabs have no icons — fix." A line
 * tab still resolves the vocabulary first, then the call site's own icon. */
function tabIcon(t: TabItem, variant: "line" | "folder"): React.ReactNode {
  if (variant === "folder") return null
  const named = TAB_ICONS[t.value]
  if (named) return kitIcon(named)
  if (typeof t.icon === "string") {
    if (t.icon) return kitIcon(t.icon)
  } else if (t.icon !== null && t.icon !== undefined) {
    return t.icon
  }
  return null
}

/** A COLLECTION'S OWN TAB STRIP, AND NOTHING ELSE — the shape `SectionWithCreate`'s
 * `folderTabs` slot and `PagedFind`'s `tabs` slot both take, instead of a bare
 * `React.ReactNode`. The client's ruling (2026-08-31, stated twice the same
 * day, once for each mechanism) is "never align the button with the tabs —
 * that button belongs in the right of the toolbar, part of the toolbar", and a
 * `ReactNode` prop cannot HOLD that rule — it happily accepts a `<>` with a
 * button folded in beside the strip, which is exactly the shape both slots
 * carried for a few hours before the correction. This type can't: there is no
 * ReactNode parameter here for a button to hide inside, only the three things
 * a tab strip actually needs, so the slot itself renders `<TabsView>` and
 * nothing a caller passes in can end up beside it. Structural, not
 * documented. */
export type FolderTabStrip = {
  config: TabsConfig
  value: string
  onValueChange: (value: string) => void
}

/**
 * A COLLECTION SCREEN'S OWN TAB STRIP STAYS VISIBLE ON SCROLL TOO — client
 * ruling, 2026-09-01, extending the record detail screen's own `STICKY_TABS`
 * (record-chrome.tsx) to the other half of the app: once a main/collection
 * screen's title condenses (`CollectionHeading`, condensed-title.tsx), its
 * tab strip used to keep scrolling away with the rest of the page, the exact
 * gap a detail screen's tabs had already been fixed for.
 *
 * Unlike a record's own strip, this one is never nested inside a padded
 * card it has to escape — `SectionWithCreate`'s `folderTabs` slot and
 * `PagedFind`'s `tabs` both render it as a plain sibling, directly in the
 * page's own flow, ABOVE any card — so this needs none of `STICKY_TABS`'s
 * `-mx`/`px` cancel-and-restore arithmetic, only `position: sticky` and a
 * `top` offset that clears the condensed title bar once it appears.
 * `--collection-tabs-top` is that clearance, published by `CollectionHeading`
 * itself (`usePublishCondensedHeight`, condensed-title.tsx) — `0px` while the
 * heading is not condensed, so the strip sits flush under the app shell
 * exactly as it always did.
 *
 * `[&>[role=tablist]]:self-start` — THE SAME FIX `STICKY_TABS` NEEDED —
 * `[role=tablist]` is a flex child of `<Tabs>` (`flex flex-col`, tabs.tsx, no
 * `items-start`), so with nothing of its own saying otherwise it stretches to
 * the full cross-axis width of whatever it sits in — a main screen with no
 * page-width cap at all (R29) and as few as two tabs (Apps' Active/Inactive),
 * which left a large, blank, unstyled rectangle immediately after the last
 * tab. `self-start` opts it back out of the column's default stretch, sizing
 * to its own tabs the same way `max-w-full` + `overflow-x-auto` already
 * assumed it did.
 *
 * `sticky`/`top`/`z-10`/`bg-background` LAND ON `<Tabs>` ITSELF, NOT ON
 * `[role=tablist]` — measured live, not guessed, after the first cut of this
 * fix (sticky on the tablist, matching `STICKY_TABS`'s own pattern exactly)
 * did nothing at all: the tab strip just scrolled away with the page.
 * `renderFolderTabs` never hands `TabsView` a `renderPanel` ("A COLLECTION'S
 * OWN TAB STRIP, AND NOTHING ELSE," this file's own type doc for
 * `FolderTabStrip`), so `<Tabs>` here has exactly one child — the tablist —
 * and is therefore exactly as tall as it is. A `position: sticky` element's
 * stuck RANGE is bounded by its own containing block, which for a flex child
 * is the flex container itself; `<Tabs>` being no taller than the tablist it
 * holds leaves that range at zero, so the browser never has room to hold it
 * in place, no matter how correct the computed `top` is. `SectionWithCreate`'s
 * and `PagedFind`'s own wrapping `<div>` — the ACTUAL sibling of the tab strip
 * and the collection rows beneath it — is tall enough (it spans the whole
 * scrollable section), and `<Tabs>` is its direct child, so moving the sticky
 * declaration up one level, onto `<Tabs>`, gives the browser that ancestor's
 * real height to stick within. Visually identical either way — `<Tabs>` holds
 * nothing but the tablist here, so a sticky `<Tabs>` and a sticky tablist
 * paint the same pixels — but only one of them has anywhere to go. */
export const STICKY_FOLDER_TABS =
  "bg-background sticky top-[var(--collection-tabs-top,0px)] z-10 " +
  "[&>[role=tablist]]:self-start"

/** Draw a `FolderTabStrip`, or nothing where a caller has none — the one place
 * `SectionWithCreate` and `PagedFind` both turn the spec into the actual
 * `<TabsView>`, so neither slot has to import the component just to render
 * the thing its own type already names. `STICKY_FOLDER_TABS` (above) is
 * applied HERE rather than at each of those two call sites, so a collection's
 * own tab strip stays visible on scroll wherever this type's own doc already
 * says it draws — "A COLLECTION'S OWN TAB STRIP, AND NOTHING ELSE" — with no
 * call site able to opt out one at a time and drift from the other. */
export function renderFolderTabs(strip: FolderTabStrip | undefined): React.ReactNode {
  if (!strip) return null
  return (
    <TabsView
      className={STICKY_FOLDER_TABS}
      config={strip.config}
      value={strip.value}
      onValueChange={strip.onValueChange}
    />
  )
}

/** CLIENT RULING, 1 Sep 2026 — three fixes to the LINE strip (a record's own
 * detail-screen sub-tabs), app-side overrides on the kit's `Tabs` (vendored,
 * pinned, CLAUDE.md R39 — reached through `[&_[data-slot=…]]:` the same
 * pattern `web/components/auth-card.tsx` documents, never a kit hand-edit).
 *
 * 1. THE UNDERLINE'S THICKNESS, SETTLED AT THREE STEPS. The kit draws the
 *    active tab's mark at `0.125rem` (2px) — both where it is drawn TWICE, the
 *    trigger's own inset shadow (`tabs.tsx` `TRIGGER_SELECTED.line`, painted
 *    before the strip has measured) and the travelling indicator once it has
 *    (`INDICATOR_SKIN.line`) — so both are forced together or the mark would
 *    visibly change thickness the instant the indicator mounts. The client
 *    first asked for "visibly heavier" with no exact figure; `0.1875rem`
 *    (3px), a 50% step, was rejected the same night as still not enough —
 *    "even thicker, like in the screenshot I gave you," pointing at a
 *    visibly bold, heavy underline. `0.3125rem` (5px) followed as the next
 *    real step (2.5x the kit's own 2px), and was itself called "too much" the
 *    same evening. The mark is now BACK at `0.1875rem` (3px) — the same value
 *    rejected the first time, kept this time because the third correction
 *    came with a second, independent change (below) rather than a fourth
 *    guess at the same knob.
 * 2. THE LABEL MATCHES THE MARK. The kit already draws both in `--foreground`
 *    (`TRIGGER_SELECTED.line`'s text, `TRIGGER_SELECTED_WITH_INDICATOR.line`'s
 *    text, and `INDICATOR_SKIN.line`'s fill all read the one token), so this
 *    line is a no-op today — pinned here anyway, forcing the label to the
 *    SAME token the mark is forced to two lines up, so the two can never drift
 *    apart again on a future kit pull the way the thickness above already has.
 * 3. THE UNDERLINE'S ENDS ARE ROUNDED, ON BOTH DRAW PATHS. The kit's mark is
 *    hard-cornered on both — the indicator is a filled `span`, so a
 *    `rounded-*` class on it draws real rounded ends; the trigger's own inset
 *    shadow has no such easy fix, because an inset shadow's shape is confined
 *    by ITS OWN BOX's `border-radius`, so the fix is rounding the ACTIVE
 *    trigger's bottom corners (invisible on this variant — `TRIGGER_SKIN.line`
 *    never paints a fill — so the only visible effect is the shadow bar
 *    curving with it) rather than inventing a second element to draw over an
 *    inset shadow that cannot itself curve. R31 (`shared/rules/registry.ts`)
 *    gives this exact shape its own word: a short indicator BAR is not a box
 *    (`rounded-[var(--radius)]`) and not a pill-shaped control or chip
 *    (`rounded-pill`) — it is the same geometry the kit's own gantt, heatmap
 *    and flowchart bars already draw as `rounded-[var(--radius-bar)]`, so this
 *    mark joins that vocabulary rather than inventing a fourth spelling of
 *    "rounded" for one strip.
 * All three are scoped to `data-state=active` only; a resting tab is untouched. */
const LINE_ACTIVE_MATCH =
  "[&_[data-slot=tabs-trigger][data-state=active]]:![color:var(--foreground)] " +
  "[&_[data-slot=tabs-trigger][data-state=active]]:!shadow-[inset_0_-0.1875rem_0_var(--foreground)] " +
  "[&_[data-slot=tabs-trigger][data-state=active]]:!rounded-b-[var(--radius-bar)] " +
  "[&_[data-slot=tabs-indicator]]:!h-[0.1875rem] " +
  "[&_[data-slot=tabs-indicator]]:!rounded-[var(--radius-bar)]"

/** CLIENT RULING, 1 Sep 2026 — the FOLDER strip's own label (a collection
 * screen's own tabs) reads a size smaller than the LINE strip's
 * (`text-caption`, 0.8125rem / 13px, vs `text-sm`, 0.875rem / 14px —
 * `tabs.tsx` `TRIGGER_SKIN`, tokens.css). The client wants one size across
 * both, keeping the LINE strip exactly as it is, so this repoints only the
 * FOLDER trigger's font-size/line-height/letter-spacing to the line strip's
 * own `--text-sm` triad rather than touching the vendored `text-caption`
 * step everywhere else it is used (a badge, a meta line). App-side, not a
 * kit edit, for the same R39 reason as `LINE_ACTIVE_MATCH` above. */
const FOLDER_LABEL_SIZE_MATCH =
  "[&_[data-slot=tabs-trigger]]:![font-size:var(--text-sm)] " +
  "[&_[data-slot=tabs-trigger]]:![line-height:var(--text-sm--line-height)] " +
  "[&_[data-slot=tabs-trigger]]:![letter-spacing:var(--text-sm--letter-spacing)]"

export function TabsView({
  config,
  value,
  defaultValue,
  onValueChange,
  renderPanel,
  className,
}: {
  config: TabsConfig
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  renderPanel?: (tab: TabItem) => React.ReactNode
  className?: string
}) {
  // Hook must run before any early return so hook order stays stable.
  const visible = useIsVisible(config)
  if (!visible) return null

  const variant = config.variant === "pill" ? "line" : config.variant
  const fallback = config.tabs[0]?.value

  // A CONTROLLED VALUE NAMING A TAB THAT IS NOT HERE DRAWS NOTHING — no trigger
  // selected and, worse, no panel, which is a blank screen where a record was.
  // It can happen honestly: a tab gated by a right the viewer has just lost, a
  // strip whose tabs are built from the team's own dropdown values, or (since
  // the nav memory landed) a tab remembered a few minutes ago on a record whose
  // tabs have changed underneath it. So the strip falls back to its FIRST tab
  // rather than to nothing — the same "degrade to the top" every other part of
  // that memory does.
  //
  // The caller is deliberately NOT told. `onValueChange` on the strip that
  // navigates (team-section-nav) MOVES you, and a screen the viewer may not read
  // must not be answered by yanking them somewhere else; every other strip in
  // the app reads this state for nothing but this prop, so a stale value costs
  // nothing while the tab it names is missing, and is correct again the moment
  // it comes back.
  const shown = config.tabs.some((t) => t.value === value) ? value : fallback

  return (
    <Tabs
      value={shown}
      defaultValue={defaultValue ?? fallback}
      onValueChange={onValueChange}
      variant={variant}
      className={cn(
        className,
        variant === "line" && LINE_ACTIVE_MATCH,
        variant === "folder" && FOLDER_LABEL_SIZE_MATCH,
      )}
    >
      <TabsList className={cn(config.fullWidth && "flex w-full")}>
        {config.tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className={cn(config.fullWidth && "flex-1")}
          >
            {tabIcon(t, variant)}
            {t.label}
            {t.badge !== "" && (
              // LINE VS FOLDER, SPLIT HERE — client ruling, 2026-08-31,
              // confirmed against a rendered side-by-side (the record-tabs
              // spec this file's own screen-engine callers point at): on a
              // LINE strip's active tab (a record's own section switch), the
              // count sits inside a small, fully-rounded MANGO dot with
              // primary-ink (charcoal) text — the same brand-fill/charcoal-
              // text pairing every other mango surface in the kit uses
              // (`--primary` / `--primary-foreground`, tokens.css), never an
              // invented pair. An inactive LINE tab's count stays plain
              // secondary-ink text with NO shape behind it — no circle, no
              // pill, nothing. The ruling was given specifically about a
              // record's line tabs; a FOLDER strip's own quiet-vs-ink count
              // (ch14: "counts are quiet, never badges") is UNCHANGED below,
              // since nothing said a collection's folder tabs should grow a
              // dot too and changing them was not asked for.
              variant === "line" ? (
                shown === t.value ? (
                  <span
                    className="flex h-4 min-w-4 items-center justify-center rounded-pill bg-primary px-1 text-micro leading-none tabular-nums text-primary-foreground"
                  >
                    {t.badge}
                  </span>
                ) : (
                  <span className="text-micro tabular-nums text-ink-secondary">{t.badge}</span>
                )
              ) : (
                <span
                  className={cn(
                    "text-micro tabular-nums",
                    shown === t.value ? "text-ink" : "text-ink-secondary"
                  )}
                >
                  {t.badge}
                </span>
              )
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {renderPanel &&
        config.tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {renderPanel(t)}
          </TabsContent>
        ))}
    </Tabs>
  )
}
