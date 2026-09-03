"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, House/Gear nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { usePathname } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/components/avatar/avatar"
// The rail's own brand artwork, reached directly (R39: kit supplies the UI) —
// see the note above `NavBrandHeader` for why this file draws the mark itself
// instead of leaving it to Rail's own default.
import { Isotype, Logotype, type BrandField } from "@shared/ui/components/brand/brand"
// THE TRAIL, AS FOLDER TABS (kit v1.2.28). It used to be `Breadcrumbs` — a line
// of text inside the card's header band. The reshaped `ScreenShell` gives the
// trail its own slot ON THE GROUND, directly above the card, and the strip's
// last tab is the card's own fill so the two read as one silhouette. Same
// array, same `BreadcrumbsItem` shape, same fold rule (`collapse`, shared
// between the two drawings); what changed is where it stands and what it is
// made of. See the `breadcrumb` prop below for the client rule that governs
// the strip: NAVIGATION TEXT ONLY, no controls on the ground.
import { BreadcrumbFolders } from "@shared/ui/components/breadcrumbs/breadcrumb-folders"
// The rule between the phone sheet's own named blocks (`railBlocks.map`,
// below). Used to be a hand-rolled `<div className="bg-border h-px w-full"
// role="separator" />`, the kit's own default weight spelled out by hand and
// its role written by hand beside it; the kit part draws the same hairline
// through Radix and gets the role from the primitive. The DESKTOP rail's own
// equivalent rule (between "My work"/"Build"/"Accounts") cannot reuse this
// literal component — `Rail` (vendored, R45) renders every named group
// itself inside one `<nav>`, so there is no seam to interleave a real node
// into — see `RAIL_CONTENT_OVERRIDES`, below, for the same hairline painted
// from outside instead.
import { Separator } from "@shared/ui/components/separator/separator"
import { toast } from "@shared/ui/components/sonner/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@shared/ui/components/tooltip/tooltip"
import { Text } from "@shared/ui/components/typography/typography"
import { AppWindow, SealCheck, Buildings, Chat, CalendarDots, Hammer, House, HardDrives, CheckSquare, Palette, AddressBook, GitFork, Gear, Tray, Timer, DotsThree } from "@shared/ui/foundations/icons"
// `Waves` is the audit module's mark and the kit's 96 have no glyph of that
// name yet, so it borrows the kit's own glyph for the concept (ATTRIBUTION).
import { Waves } from "@shared/ui/foundations/icons"
// THE NAVBAR ITSELF (R45). Was hand-rolled — its own button markup reading the
// same `--spine-*` tokens the kit's Rail reads, its own group/divider layout,
// its own collapse control — while `ScreenShell`'s rail COLUMN was already the
// kit's. That half-adoption is exactly what read as "completely different"
// from the kit's own reviewed Rail on the client's side-by-side. Adopted for
// real below: `railGroups`/`railMember` map this app's nav registry and signed-
// in user onto Rail's own `groups`/`member` shape, and the registry entry that
// parked this (`COMPOSITION_EXEMPT["templates/rail.tsx"]`) is deleted with this
// change — a composition genuinely reached is stale as an exemption (R45).
//
// THREE OF RAIL'S OWN SLOTS ARE DELIBERATELY UNUSED HERE (client feedback, 31
// Aug 2026) — `mark`/`wordmark`, `member` and `collapsible` are all passed
// `null`/`false` below, and this file draws its own equivalents instead. Each
// is a documented kit gap, not an oversight:
//   · Rail's `groups` prop has no "no heading" shape for a destination that
//     wants to sit outside every section (House) — every RailGroup draws a
//     clickable disclosure control over its items, even at an empty label.
//     `StandaloneNavItem` below draws that one, token-for-token with Rail's
//     own row treatment.
//   · Rail's own collapse button is icon PLUS always-visible label, drawn
//     between the nav and the member chip. The client wants it icon-only, on
//     a `Tooltip`, floating on the rail column's own edge at the member
//     card's height (`railEdgeToggle`, below `railContent` in `AppShell`) —
//     a position Rail has no prop to reach at all (`collapsible` draws its
//     control inside its own box, never straddling the column's border).
//   · `RailMember` has no actions slot, so the account menu's trigger cannot
//     sit INSIDE Rail's own chip. The member card below rebuilds the chip's
//     look with the kit's own `Avatar`/`Text` and hosts `ProfileMenu` inside it.
import { Rail, type RailGroup } from "@shared/ui/compositions/templates/rail"

import type { ActiveTeam } from "@/lib/use-active-team"
import { auth } from "@/lib/api"
import { personInitials, personName } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { sectionClick } from "@/lib/nav-memory"
import { useRealtime, useUserRealtime } from "@shared/web/realtime"
// The row-level registry + coarse invalidations moved to lib (R15): they're DATA
// the live-collections check imports, and the thread/help_threads + agent_usage
// deaf-exemptions live beside them in the rules registry.
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES, liveCoveredKeys, totalKey } from "@/lib/live-resources"
import { invalidate, invalidatePrefix, patchRow, primeCache, readCache, reconcile, registerLiveCoverage } from "@shared/web/store"
import { NAV, NAV_GROUP_LABELS, NAV_GROUP_ORDER, TEAM_SECTIONS, bottomNavItems, overflowNavItems, isNavActive, type Crumb, type NavGroup } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useTeamPrewarm } from "@/lib/use-team-prewarm"
import { useGoogleCatchUp } from "@/lib/use-google-catch-up"
import { useT } from "@shared/web/language"
import { MarkLoader } from "@shared/web/mark-loader"
import { safeSrc } from "@shared/web/rich-text"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { TEAM_CREATION_CLOSED, TEAM_SCREENS_HIDDEN } from "@shared/product"
import { ProfileMenu } from "@/components/profile-menu"
import { TeamSwitcher } from "@/components/team-switcher"
import { TimerBar, useRunningTimers } from "@/components/timer-bar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/components/sheet/sheet"
import { LanguageProvider } from "@shared/web/language"
import { applyScale } from "@shared/web/scale-section"
import { toSpine, type Spine } from "@shared/spine"
import { ScreenShell } from "@shared/ui/compositions/templates/screen-shell"
import { AgentDockSlot } from "@/lib/agent-dock"
import { useAgentOpen, setAgentOpen } from "@/lib/agent-open"

// Kwapso is `inRail: false` now (client, 31 Aug 2026 — see NavGroup in
// pages.ts), so this mapping is never actually looked up — kept anyway, the
// same way `settings` already sat here unused, so `NavItem.icon`'s union
// stays fully covered rather than needing a cast at the one call site below.
const NAV_ICONS = { home: House, settings: Gear, kwapso: SealCheck } as const
// The lucide component for each team SIDEBAR page in the rail — the same concept
// icons the tabs use (CONCEPT_ICON, pages.ts), as components rather than names
// because the rail renders them directly. Every sidebar section has a line here;
// a section without one falls back to House, which is the tell that one is missing.
//
// TWO WERE MISSING, and the fallback is exactly why nobody noticed: `time` and
// `meetings` shipped without a line, so the rail drew House three times — House,
// Time and Meetings wearing one icon, which a tester reported as "Meetings and
// Time share the same icon". Both concepts already had their own glyph in
// CONCEPT_ICON (`timer`, `calendar-clock`); only this map had not been told.
// web/test/nav.test.ts now derives the required keys from TEAM_SECTIONS and
// insists every icon is distinct, so a silent fallback cannot ship again.
const SECTION_ICONS: Record<string, typeof House> = {
  accounts: Buildings,
  // The same glyph `CONCEPT_ICON.contacts` ("contact") resolves to everywhere
  // else it is drawn (the alias chain in shared/web/screen-engine/icon-names.ts
  // — "contact" → "profile-circle" → AddressBook) — one concept, one icon,
  // whether the rail draws it as a component or a screen draws it by name.
  contacts: AddressBook,
  tickets: Tray,
  knowledge: HardDrives,
  processes: GitFork,
  stories: Hammer,
  sprints: CalendarDots,
  // The package a client bought — several sprints arriving together.
  waves: Waves,
  apps: AppWindow,
  tasks: CheckSquare,
  time: Timer,
  meetings: Chat,
  brand: Palette,
}

/** THE SAME ROW SKIN RAIL'S OWN `RailRow` DRAWS, for the one destination that
 * sits outside any of Rail's `groups` (House — see `NavGroup` in lib/pages.ts).
 * Copied token-for-token from `templates/rail.tsx`'s private
 * `ROW_SHAPE`/`ROW_EXPANDED`/`ROW_COLLAPSED`/`ACTIVE_TREATMENT`/`ROW_IDLE`
 * (none of them exported — a kit gap, not a choice), so the standalone entry
 * and a grouped one read as ONE row style wherever they sit in the column. */
function StandaloneNavItem({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: { slug: string; title: string; Icon: typeof House }
  active: boolean
  collapsed: boolean
  onSelect: () => void
}) {
  const Icon = item.Icon
  const skin = [
    "flex min-w-0 items-center gap-[var(--space-2)] border-0 bg-transparent no-underline select-none",
    // `motion-hover` (the kit's own fill/ink transition, motion.css §13)
    // rather than a hand-rolled `transition-[...]` — "motion is the kit's,
    // everywhere" (web/test/motion-is-the-kits.test.ts). Rail's own row also
    // eases the press translate, which `motion-hover` does not cover — a kit
    // gap this file accepts rather than hand-rolling a second transition
    // utility for one pixel of nudge.
    "text-sm leading-none text-start motion-hover cursor-pointer active:translate-y-[0.0625rem]",
    "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",
    collapsed
      ? "size-[var(--avatar-md)] justify-center rounded-pill p-0"
      // Transcribed from the kit's own `ROW_EXPANDED` (rail.tsx), which stopped
      // bleeding to the rail's true edge in v1.2.22 — the client asked for the
      // active pill to keep "a bit of blank space on the sides". House is the
      // one destination outside any group, so it is drawn here rather than by
      // the rail composition, and the kit exports no row-shape constant to
      // import; keeping the two in step is manual until it does.
      //
      // (Spelling the composition's name in prose here, rather than as its JSX
      // tag, is deliberate: web/test/shell-nav.test.ts finds the rail by the
      // first index of that tag in this file's source and measures the distance
      // to the profile menu, so a mention in a comment above the real element
      // moves the anchor 40k characters and fails the test.)
      : "h-[var(--control-height-button)] w-auto rounded-pill px-[var(--space-3)]",
    active
      ? "bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)] font-[var(--font-weight-medium)] hover:bg-[var(--spine-active-hover)]"
      // TRANSCRIBED FROM THE KIT'S OWN `ROW_IDLE` (rail.tsx), the same way the
      // shape above is transcribed from `ROW_EXPANDED` and for the same reason:
      // House is the one destination outside any group, so it is drawn here
      // rather than by the rail composition, and Standalone Nav Item's whole
      // point is to draw the row Rail draws.
      //
      // This used to rest in the theme's secondary ink and hover up to the
      // spine's full ink — described and not spelled, because Tailwind scans
      // this file and would compile a quoted utility straight back into the
      // stylesheet (see the longer note on `railContent`'s own root below, and
      // web/app/globals.css, which carries the same warning). It matched the
      // descendant-selector override that used to sit on that root. Both are
      // gone for the reason spelled
      // out in full there: `--ink-secondary` is THEME-scoped and this ground is
      // SPINE-scoped, so it measured 1.95:1 on ink-in-light and 1.05:1 on
      // mango-in-dark, and kit v1.2.18 had already moved the kit's own rows to
      // `--spine-ink` on a later client ruling ("nav text should ALWAYS be
      // either pure black or pure white — never gray"). The hover went with it:
      // once a row RESTS at `--spine-ink` a hover step to `--spine-ink` is a
      // no-op, and v1.2.18 replaced that colour step with a WEIGHT step.
      : "font-[var(--font-weight-light)] text-[var(--spine-ink)] hover:font-[var(--font-weight-medium)]",
  ].join(" ")

  const control = (
    <button
      type="button"
      data-slot="rail-item"
      data-active={active ? "" : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.title : undefined}
      className={skin}
      onClick={onSelect}
    >
      {collapsed ? (
        <Icon aria-hidden="true" />
      ) : (
        <>
          <span aria-hidden="true" className="flex size-[var(--icon-button)] shrink-0 items-center justify-center">
            <Icon aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
        </>
      )}
    </button>
  )

  if (!collapsed) return control
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  )
}

/** THE MARK — ALONE NOW (client feedback, 31 Aug 2026: "make the logo bigger,
 * and leave air underneath it before starting with the sections"). This used
 * to also carry the collapse toggle beside it (client, earlier the same day:
 * "collapse text should be hidden unless hover and place it at the top") —
 * the toggle has since moved again, to a floating edge-handle at the rail's
 * foot (see the note beside `railEdgeToggle` in `AppShell`), so this
 * component is back to drawing only the mark. Rail draws its own mark by
 * default; this file passes `mark={null}` to Rail and draws it here instead
 * so it can sit at the top with its own spacing, independent of the nav
 * below it. R39 — the kit supplies the artwork (`Logotype`/`Isotype`), this
 * file only places it and sets its size.
 *
 * THE STEP WENT UP, REVERSING THE EARLIER RULING. It was `--icon-20` on a
 * 24 Aug 2026 instruction with a reference screenshot ("the logo on top of
 * sidebar smaller, check screenshot for reference"); the client, live on
 * staging a week later, asked the opposite: "make the logo bigger". One rung
 * up the ladder, `--icon-24` (tokens.css's icon delivery sizes), the next
 * step after the 22/24 pair and the ladder's own next-common size after 20 —
 * a correction, not a guess at a new number. The air below it moved with the
 * mark: see the `pb-6` on this component's wrapper in `AppShell`, doubled
 * from the `pb-3` it shared with every other block in the rail's rhythm,
 * because the client asked for it by name ("leave air underneath it"),
 * not for a bigger gap that happened to read the same as everyone else's. */
function NavBrandHeader({
  collapsed,
  homeLabel,
  spine,
}: {
  collapsed: boolean
  homeLabel: string
  spine: Spine
}) {
  /* THE CUT COMES FROM THE SPINE, NOT FROM THE THEME — the kit's own law,
     stated at rail.tsx §"THE SAME LOGIC IS WHY `markField` PICKS THE CUT FROM
     THE SPINE AND NOT FROM THE MEDIA QUERY", and this line is that file's own
     `markField` expression, transcribed for the same reason the row shape
     below it is: this file draws the mark itself (`mark={null}` to Rail) and
     the kit exports the mapping as a local, not as a helper.

     It used to pass `on="paper"` unconditionally. `paper` is the THEME-driven
     field — the kit hides one cut and shows the other on `prefers-color-
     scheme` / `[data-theme]` — which is correct only for the spine whose own
     ground follows the theme. The other two paint a ground that does NOT:
     ink is dark in both palettes and mango is #FED069 in both. So a light
     theme on the ink spine drew the DARK cut on ink's dark ground, and a dark
     theme on mango drew the LIGHT cut on mango's bright one. Reported by the
     client, 2026-09-03, on the ink half: the wordmark reads white and correct
     in dark and is unreadable in light.

     Same fault, same day, one layer up from the idle nav label — see the long
     note on `railContent`'s own root below. A rail that paints its own ground
     must own its own foregrounds; inheriting them from the theme is the bug. */
  const markField: BrandField = spine === "ink" ? "unlit" : spine === "mango" ? "brand" : "paper"
  // THE MARK IS THE WAY HOME (client, 31 Aug 2026): "remove home from navbar,
  // make that when we click the icon kwapso on top of sidebar it takes us
  // there" — Welcome (the old "House") has no rail row of its own any more
  // (`inRail: false` in pages.ts), so the brand mark is now its only entry
  // point besides landing here straight off sign-in.
  return (
    <div className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "px-[var(--space-3)]"}`}>
      <button
        type="button"
        onClick={() => softNavigate("/home")}
        className="min-w-0 shrink-0 cursor-pointer rounded-pill active:translate-y-[0.0625rem]"
        aria-label={homeLabel}
      >
        {collapsed ? (
          <Isotype className="[--brand-step:var(--icon-24)]" on={markField} />
        ) : (
          <Logotype className="[--brand-step:var(--icon-24)]" on={markField} />
        )}
      </button>
    </div>
  )
}

export function AppShell({
  active,
  children,
  breadcrumbs,
  onNavigate,
  activePath,
}: {
  active: ActiveTeam
  children: React.ReactNode
  breadcrumbs?: Crumb[]
  /** How a breadcrumb / nav link navigates. The deep-link host passes its
   * History-API `go` so in-team moves don't trigger a full reload; other pages
   * fall back to the router. */
  onNavigate?: (href: string) => void
  /** The live in-app path, for nav highlighting. The deep-link host moves via the
   * History API (which `usePathname` doesn't observe), so it passes the current
   * path here; other pages rely on `usePathname`. */
  activePath?: string
}) {
  const t = useT()
  const pathname = usePathname()
  const [creating, setCreating] = React.useState(false)
  // The AI co-pilot (launcher + panel + screen-trace engine) is mounted ONCE at the
  // root layout (agent-host.tsx) so it survives navigation — it is deliberately NOT
  // owned by this per-route shell anymore.
  const teamId = active.ctx?.team?.id ?? null
  const userId = active.user?.id ?? null

  // Warm the cheap always-needed team-wide caches on team entry so the first tap
  // into a tab paints from cache, not a skeleton. Cold-guarded + failure-swallowed
  // (see the hook) — it only SEEDS cold keys, never touching a warm/live entry.
  useTeamPrewarm(teamId)

  // HOW BIG THIS PERSON WANTS THE APP. One root font size on <html>, applied
  // here rather than in the root layout for the same reason the language is:
  // the root layout is a server component with no session, and the preference
  // arrives on `active.user`. Every size token in the theme is in `rem`, so this
  // one number moves text and spacing together (UI-RULEBOOK S4) — and because
  // the viewport is locked against pinch-zoom (S5) it is the only way anybody
  // can make this app bigger.
  const userScale = active.user?.scale ?? null
  React.useEffect(() => {
    applyScale(userScale, "agency")
  }, [userScale])

  // WHICH SPINE THE SIDEBAR IS PAINTED IN — ink, paper or mango, chosen in
  // Gear (shared/web/spine-section.tsx) and persisted on the person's own
  // row exactly as `scale` is, so it follows them between devices. Unlike
  // scale this is an ordinary React prop rather than a document-level side
  // effect: `toSpine` falls back to the default for null/unrecognised, which
  // has been MANGO since the client's ruling of 2026-09-02 — it was paper, to
  // keep a person who had never opened Gear on the rail they already had,
  // and that argument is recorded in shared/spine.ts where it was overturned.
  const spine = toSpine(active.user?.spine)

  // Desktop sidebar collapse (icon rail), remembered across sessions.
  const [collapsed, setCollapsed] = React.useState(false)
  // The phone's "everything else" sheet. Closed on every navigation, because a
  // menu that stays open over the screen it just opened is a menu you have to
  // dismiss twice.
  const [moreOpen, setMoreOpen] = React.useState(false)
  React.useEffect(() => {
    setCollapsed(localStorage.getItem("ss-sidebar-collapsed") === "1")
  }, [])
  // Rail owns the collapse control itself now (`collapsible`) and reports every
  // change here — controlled either way, so a toggle it draws and a toggle this
  // app might still draw elsewhere (the phone has none) never fall out of sync.
  function persistCollapsed(next: boolean) {
    setCollapsed(next)
    localStorage.setItem("ss-sidebar-collapsed", next ? "1" : "0")
  }

  // WHICH RAIL GROUPS ARE FOLDED. Rail's own group collapse (the chevron on
  // "Daily"/"Occasional") is uncontrolled with no equivalent of `collapsed`'s
  // controlled prop — `defaultOpen` is read once, at mount, and `onGroupToggle`
  // only REPORTS a change for the application to persist (see `RailGroup` /
  // `RailProps` in the kit file). So this follows the same local convention the
  // block above already set for the whole-rail toggle — a plain localStorage
  // key, this device only, not a synced server preference — rather than
  // inventing a second mechanism for a closely related setting.
  //
  // THE KEY BUMP IS WHY THIS WORKS. `closedGroups` starts empty (every group
  // open) until the effect below reads storage; if Rail mounted straight away
  // with that empty set, its own `useState(() => groups.filter(defaultOpen ===
  // false)…)` would lock in "open" before the real value ever arrived, and
  // passing an updated `defaultOpen` afterwards does nothing — it is read only
  // once. Bumping Rail's `key` once the read completes forces exactly one
  // remount, which is the same "uncontrolled + defaultValue" reset technique
  // React documents for a form, applied to a composed component instead.
  const [closedGroups, setClosedGroups] = React.useState<string[]>([])
  const [groupPrefsReady, setGroupPrefsReady] = React.useState(false)
  React.useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("ss-rail-closed-groups") ?? "[]") as unknown
      // Read defensively: this is a value from the reader's own browser, and a
      // half-written or hand-edited one must leave the rail whole rather than
      // throwing under the shell.
      setClosedGroups(Array.isArray(raw) ? raw.filter((g): g is string => typeof g === "string") : [])
    } catch {
      setClosedGroups([])
    } finally {
      setGroupPrefsReady(true)
    }
  }, [])
  function persistGroupToggle(id: string, open: boolean) {
    setClosedGroups((prev) => {
      const next = open ? prev.filter((g) => g !== id) : [...prev, id]
      try {
        localStorage.setItem("ss-rail-closed-groups", JSON.stringify(next))
      } catch {
        // Private-mode storage can refuse writes; the fold still works this session.
      }
      return next
    })
  }

  const { can } = usePermissions(teamId)
  // GOOGLE COMES INTO STEP ON OPEN (14.12). One background request, behind first
  // paint, only for somebody who holds both rights the door asks for — see the
  // hook, which is where all the reasoning about why this is not a cron lives.
  useGoogleCatchUp(teamId, can)
  // IS ANYTHING BEING TIMED. The same cached read `TimerBar` makes for itself,
  // asked one level up so the shell can decide whether to draw the header BAND
  // the timer would sit in at all — see the `header` prop below for why an
  // always-drawn band is not free. One key, one request: both callers go
  // through `loadShared`.
  const runningTimers = useRunningTimers(teamId)
  // IS THE ASSISTANT SHOWING. The same module store the panel itself reads
  // (web/lib/agent-open.ts) — read here because the shell's third column is
  // CONTROLLED by it: the kit holds the aside's state uncontrolled unless it is
  // given one, and a state it held privately could not be persisted per person
  // or shared with the panel's other presentation. One flag, two readers, never
  // two answers.
  const assistantOpen = useAgentOpen()
  // THE TRAIL, AS ONE ARRAY, BECAUSE TWO THINGS READ IT. The strip itself and
  // the DEPTH the shell derives the title's step from have to be the same
  // fact; `breadcrumbs` is optional at the prop, so it is normalised once here
  // rather than defaulted twice below.
  const trail = breadcrumbs ?? []
  const navigate = onNavigate ?? softNavigate
  const here = activePath ?? pathname

  /** CLICKING A SECTION, WHICH IS NOT THE SAME AS FOLLOWING A LINK — it is the
   * one control in the app that names a section rather than a destination, so
   * it is the one that asks the nav memory where she was, and the one where a
   * second click on the section you are already in resets it. The whole of that
   * decision (and why the reset is a second click rather than a double-click)
   * lives in `sectionClick`; the rail just draws the button. */
  const goToSection = (path: string) => navigate(sectionClick(teamId, path, here))

  // THE RAIL, IN THREE NAMED SECTIONS PLUS ONE STANDALONE ANCHOR (client
  // feedback, 31 Aug 2026 — see NavGroup in pages.ts for the client's own words,
  // how "Today"/"Welcome" were reconciled against the real registry, and how
  // Kwapso's own same-day rise and fall as a fourth section left three).
  // Every destination declares which section it belongs to, or `"none"` to sit
  // outside all of them, so this partition is DERIVED: the shell never names a
  // page, it just asks each one where it goes. A section gated by a right the
  // caller lacks vanishes from its group, and a group that empties out draws
  // no heading.
  type ShellLink = { slug: string; title: string; Icon: typeof House; path: string; group: NavGroup | "none" }
  const universal: ShellLink[] = NAV.filter((i) => !i.need && i.inRail !== false).map((i) => ({
    slug: i.slug,
    title: t(i.title),
    Icon: NAV_ICONS[i.icon],
    path: i.path,
    group: i.group,
  }))
  const sidebarPages: ShellLink[] = teamId
    ? TEAM_SECTIONS.filter((s) => s.placement === "sidebar" && can(s.module, "read")).map((s) => ({
        slug: s.key,
        title: t(s.title),
        Icon: SECTION_ICONS[s.key] ?? House,
        // Clean top-level URL (/stories, /tickets) — resolves the active team from
        // context, like House. (The gateway serves the shell for any sub-path.)
        path: `/${s.segment}`,
        group: s.group ?? "my-work",
      }))
    : []
  // HOME IS THE RAIL'S ONLY STANDALONE ANCHOR (client feedback, 31 Aug 2026).
  // Kwapso was briefly the rail's OTHER standalone anchor, then briefly a
  // named section of its own (Details · Team · Branding, last), then neither
  // — the client reversed the section the same day ("remove the whole kwapso
  // section from the sidebar and move with your profile and settings"). See
  // the note on NavGroup in pages.ts for the whole arc, and ProfileMenu for
  // where the destination lives now.
  const homeStandalone = universal.filter((i) => i.slug === "home")
  // THE NAMED-SECTION POOL is the team's own sidebar pages PLUS any other NAV
  // entry that declares a real group rather than "none" — nothing in NAV does
  // today (Kwapso is `inRail: false`, so `universal` never even carries it
  // this far), but the shell still asks each entry rather than naming one, so
  // a future NAV destination that DOES want a rail section costs it a group
  // field, not a rewrite here.
  const groupable: ShellLink[] = [...sidebarPages, ...universal.filter((i) => i.group !== "none")]
  const namedGroups: ShellLink[][] = NAV_GROUP_ORDER.map((g) => groupable.filter((i) => i.group === g)).filter(
    (g) => g.length > 0
  )
  // THE FLAT LIST — home, then every grouped section in order — is what the
  // phone's bottom bar, its "everything else" sheet and the active-link lookup
  // all read: none of them care about headings, only about "which destinations
  // exist and in what order" (pages.ts's own partition property).
  const navLinks: ShellLink[] = [...homeStandalone, ...namedGroups.flat()]
  // THE PHONE'S BAR AND THE DOOR TO THE REST. Together these two are a
  // partition of navLinks: nothing reachable can fall between them (pages.ts).
  const bottomNav = bottomNavItems(navLinks)
  const overflowNav = overflowNavItems(navLinks)
  // THE "EVERYTHING ELSE" SHEET'S OWN BLOCKS — the same shape the desktop rail
  // draws (the standalone anchor, then each named section in order), so a
  // separator falls in the same places on a phone as a heading does on a
  // laptop.
  const railBlocks: ShellLink[][] = [homeStandalone, ...namedGroups].filter((b) => b.length > 0)

  // THE RAIL'S GROUPS, IN THE KIT'S OWN SHAPE (R45) — the four NAMED sections
  // only; House is drawn outside the kit's own Rail entirely by
  // `StandaloneNavItem` (see the note above it). One `RailItem` per
  // destination, the same icon vocabulary the tabs use (`item.Icon`), and a
  // plain `onSelect` — deliberately NO `href`. Rail's own `<a>` fires
  // `onSelect` ALONGSIDE the browser's real navigation rather than instead of
  // it (no `preventDefault` in that file), so an in-app `href` here would
  // hard-reload the static-export shell on every click — the static-export
  // trap EDGE-CASES.md names and R37 exists for. `onSelect`-only renders a
  // `<button>` instead (Rail's own branch), exactly what the hand-rolled row
  // always was.
  const railGroups: RailGroup[] = namedGroups.map((group) => ({
    id: group[0].group,
    heading: t(NAV_GROUP_LABELS[group[0].group as NavGroup]),
    defaultOpen: !closedGroups.includes(group[0].group),
    items: group.map((item) => {
      const Icon = item.Icon
      return {
        id: item.slug,
        label: item.title,
        icon: <Icon aria-hidden="true" />,
        onSelect: () => goToSection(item.path),
      }
    }),
  }))
  const activeRailId = navLinks.find((item) => isNavActive(item.path, here))?.slug

  // THE MEMBER CHIP — the signed-in user's real name and initials, first name
  // only per the kit's own client ruling (no role, ever). `onSelect`, not
  // `href`, for the same hard-reload reason as every row above. THE KIT'S OWN
  // `MemberChip` (inside `Rail`) has no photo slot, which is why this card is
  // hand-built here instead of passed through `Rail`'s `member` prop — see the
  // block below. Being hand-built, it carries `imageUrl` exactly like
  // `ProfileMenu`'s own avatar does (client, 31 Aug 2026: "I want to see the
  // user avatar, not the initials — initials only when the image is
  // missing"): `AvatarImage` renders whenever a real photo exists, and
  // `AvatarFallback`'s initials are the net under it, never the default.
  // Not typed as the kit's `RailMember` (that shape has no photo field, and
  // this object never reaches `Rail`'s `member` prop — see above): a plain
  // local shape, so `imageUrl` is a real field rather than a cast.
  const railMember = {
    name: personName({
      firstName: active.user?.firstName,
      lastName: active.user?.lastName,
      email: active.user?.email,
    }),
    givenName: active.user?.firstName ?? undefined,
    initials: personInitials(active.user?.firstName, active.user?.lastName),
    imageUrl: active.user?.imageUrl ?? undefined,
  }
  // THE EYE READS THE GIVEN NAME; THE EAR HEARS THE WHOLE ONE — same split
  // Rail's own chip drew before this file took the chip over (see the note on
  // `RailMemberCard`, below): a screen reader announcing "Aurora" where the
  // record says "Aurora Torres" would know less than a sighted reader. Now
  // carried by the trigger button's own `aria-label={railMember.name}` (both
  // rail states, since the whole pill became `ProfileMenu`'s trigger) rather
  // than a conditional sr-only span beside visible text that is itself
  // `aria-hidden` — one accessible name, not two competing sources.
  const memberShown = railMember.givenName ?? railMember.name

  // WHICH KEYS THE SOCKET VOUCHES FOR. Registered here because this is where
  // the team channel is opened — the promise and the connection have to belong
  // to the same component, or the cache could be told a key is covered by a
  // socket nobody opened. Re-registered whenever the team changes, and dropped
  // on unmount, which takes the app back to always-revalidate.
  React.useEffect(() => {
    if (!teamId) return
    const covered = liveCoveredKeys(teamId)
    return registerLiveCoverage((key) => covered.has(key))
  }, [teamId])

  // The active team's live channel. A ping patches ONLY the changed row in place
  // (row-level), via the generic registry above — no full-collection refetch.
  useRealtime(
    teamId,
    (event) => {
      if (!teamId) return
      // The team activity feed is append-only + small — refresh it on any change.
      invalidate(`activity:team:${teamId}`)
      // Coarse listeners (team meta, screen recipes) — data-driven, R15.
      const simple = SIMPLE_INVALIDATIONS[event.resource]
      if (simple) {
        for (const k of simple(teamId)) invalidate(k)
        if (event.resource === "team") void active.refresh() // team name/logo
        return
      }
      const r = TEAM_RESOURCES[event.resource]
      if (!r) return
      // The record-scoped slices of this collection, where it has them. Dropped
      // BEFORE the row-level patch below and independently of it: patchRow does
      // nothing when the team-wide list isn't loaded, and "the person is looking
      // at one story's Time tab having never opened the Time page" is precisely
      // the case that stayed stale (see recordTimeKey in lib/live-resources).
      if (r.slicePrefix) for (const p of [r.slicePrefix].flat()) invalidatePrefix(p)
      // R16: an add/remove moves the collection's exact total by one — bump the
      // primed sidecar so badges stay honest between full refetches.
      if (event.op === "add" || event.op === "remove") {
        const tk = totalKey(event.resource === "selectable_data" ? "selectable" : event.resource, teamId)
        const t = readCache<number>(tk)
        if (typeof t === "number") primeCache(tk, Math.max(0, t + (event.op === "add" ? 1 : -1)))
      }
      if (!event.id) {
        // No row id on the ping → coarse-refetch just that collection (still
        // scoped, never a page reload). Row-level kicks in once the publisher
        // carries the id.
        invalidate(r.key(teamId))
        if (r.refreshCtx) void active.refresh()
        return
      }
      const id = event.id
      void patchRow(r.key(teamId), r.idField, id, () => r.fetchOne(id))
      for (const k of r.deps?.(teamId, id) ?? []) invalidate(k)
      // If MY membership row changed (e.g. an admin swapped my role), my own
      // effective rights may differ now — refresh the permission gate so my
      // nav/buttons reflect it live, not just how others see my row.
      if (event.resource === "members" && id === userId) invalidate(`my-perms:${teamId}`)
      if (r.refreshCtx) void active.refresh()
    },
    () => {
      // Reconnect after a dropped link: catch up on everything we missed, with
      // no page reload. The row-level lists are DIFF-PATCHED in place (reconcile:
      // only changed rows re-render, new rows appear in order, gone rows drop) —
      // catching adds too, not just edits; the total-priming fetchers re-prime
      // the badges as they run. The small derived feeds/gates are cheap, so
      // coarse-invalidate them.
      if (!teamId) return
      for (const r of Object.values(TEAM_RESOURCES)) {
        void reconcile(r.key(teamId), r.idField, () => r.fetchList(teamId))
        // A record-scoped slice has no list fetcher to reconcile against — it is
        // the door answering a narrower question — so catching up on one is a
        // drop and a re-read.
        if (r.slicePrefix) for (const p of [r.slicePrefix].flat()) invalidatePrefix(p)
      }
      invalidate(`activity:team:${teamId}`)
      invalidate(`my-perms:${teamId}`)
      void active.refresh()
    }
  )

  // Your OWN identity channel — account events + a forced sign-out — open even
  // before you join a team (teamless users still get it).
  useUserRealtime(userId, (event) => {
    if (event.resource === "session") {
      // A sign-out signal reaches ALL your devices (e.g. you changed your email
      // elsewhere). Only the devices whose session was actually dropped should
      // bounce to login — the acting device keeps its still-valid session, so
      // re-check first and redirect only if the session is dead.
      auth.me().catch(() => window.location.assign("/login"))
      return
    }
    if (event.resource === "account_activity") {
      invalidate("account-activity") // your own account feed (small) refreshes live
    }
    if (event.resource === "profile") {
      // You edited your name/photo on another device — refresh your identity so
      // the sidebar/profile menu update here too (member rows others see update
      // via each team's own channel).
      void active.refresh()
    }
    if (event.resource === "teams") {
      // Cross-team membership changed (you joined, were removed, or created a
      // team). Refresh the switcher + active context. If this drops your LAST
      // team, use-active-team routes you to onboarding; if it drops the team
      // you're VIEWING, deep-link-screen routes you home (decision #8).
      void active.refresh()
    }
  })

  // THE RAIL — adopted for real (R45), not just the column it sits in.
  // `ScreenShell`'s rail column has been the kit's since the earlier pass; this
  // is the last hand-rolled piece, the nav CONTENTS, swapped for the kit's own
  // `Rail`.
  //
  // THE TEAM SWITCHER IS HIDDEN HERE, NOT REMOVED (client feedback, 31 Aug
  // 2026: "remove the top kwapso, keep only the logo"). It drew a circular
  // avatar plus the team's own name — title case, "Kwapso" — directly ABOVE
  // Rail's own lowercase wordmark, because kwapso runs one team and that team
  // is named Kwapso: a real, working control (`team-switcher.tsx`) that
  // happened to repeat the brand identity Rail already draws, on this one
  // deployment. `TEAM_SCREENS_HIDDEN` (shared/product.ts) is the same flag the
  // switcher itself already reads to become a plain nameplate — a second team
  // ever existing is exactly the condition under which its name would stop
  // matching the wordmark, so a fork that flips it back on gets its switcher
  // back here too, unlike the mobile top bar which keeps it unconditionally
  // (nothing else names the team there). Rail draws NO mark of its own
  // (`mark`/`wordmark` both `null` below) — `NavBrandHeader` draws the same
  // artwork instead, at the top of the column on its own (see the note on
  // that component for why Rail's own default isn't used here, and the note
  // on `railEdgeToggle` for where the collapse control lives now).
  //
  // THE ACCOUNT MENU (profile / settings / appearance / sign out) has no home
  // in Rail either: the member chip is ONE action and this app's menu is four,
  // including the three-segment theme control that already can't live in a
  // collapsible rail (see profile-menu.tsx's own note on why it moved out of
  // this file in the first place). `ProfileMenu`, `compact`, now sits INSIDE
  // the member card below rather than beside it (client feedback, 31 Aug 2026:
  // "the three dots... should be in user card, inside aligned to left") — Rail
  // draws no member chip of its own (`member={null}`) because `RailMember` has
  // no actions slot to host the trigger in, so this file rebuilds the chip's
  // look (the same `--spine-*` tokens, the same `Avatar`) around it instead.
  //
  // IT FILLS THE COLUMN, AND THE COLUMN IS ALREADY ONE WINDOW TALL (kit
  // v1.2.28, 2026-09-02). This node used to be `sticky top-0 h-[100svh]` with
  // the column's own `--rail-inset` cancelled by a negative margin and
  // re-spent here — a whole mechanism whose only job was to make a rail
  // inside a DOCUMENT-SCROLLED page look viewport-tall while the column it
  // sat in grew with whatever the page's body needed. THE PAGE DOES NOT
  // SCROLL ANY MORE: `ScreenShell`'s page level is `h-dvh overflow-hidden`
  // and the rail column is a flex item of a full-height row, so the column IS
  // the window's height, exactly, on every route and at every scroll
  // position. `flex-1 min-h-0` fills it — main-axis growth inside the
  // column's own flex column, not a percentage — and there is nothing left
  // for `sticky` to pin against, because nothing behind the rail moves.
  //
  // The nav region still scrolls INSIDE its own wrapper (`min-h-0 flex-1
  // overflow-y-auto`), not the whole column, so a long list of sections can
  // never push the standalone anchor or the account menu off screen — Rail's
  // own `min-h-full` needs a sized box to fill, and this wrapper is it. House
  // sits OUTSIDE that scrolling wrapper (the same "the anchor keeps its end
  // of the rail" property the old House-first/Gear-last order had), so it
  // never scrolls out of view.
  //
  // THE COLLAPSE CONTROL IS THE SHELL'S NOW, AND IT IS NOT DRAWN HERE. This
  // file used to render `railEdgeToggle` beside this node — a floating,
  // half-in-half-out circular button straddling the rail column's own border
  // at the member card's height, sticky to its own `100svh` window for the
  // same reason this node was. The kit draws the edge handle itself since
  // v1.2.28 (a 3px bar in a 20x44 target, at the column's outer rim when the
  // rail is open and its inner edge when it is shut), so drawing ours too
  // would be two controls for one decision. What this file still owes the
  // shell is the STATE: `railCollapsed` + `onRailCollapsedChange` below, and
  // `collapsed` threaded into our own Rail — the shell cannot reach inside a
  // rail node it was handed. (Rail's name is written in prose here and not as
  // its JSX tag, for the reason `StandaloneNavItem`'s own header already
  // gives: web/test/shell-nav.test.ts finds the rail by the FIRST index of
  // that tag in this file, so a mention above the real element moves the
  // anchor and fails a test about something else entirely.)
  // TWO DESCENDANT-SELECTOR OVERRIDES LIVE ON THIS ROOT NODE, THE SAME
  // REASON AS THE RADIUS OVERRIDE BELOW (`shared/ui/` is vendored and
  // pinned; a hand-edit there fails web/test/vendored-kit.test.ts): reached
  // from OUTSIDE the kit, on an ancestor this file owns.
  //
  // THERE IS NO LONGER A CHIP-TEXT OVERRIDE HERE, AND THE 31 AUG RULING IS
  // STILL HONOURED — BY THE KIT, NOT BY THIS FILE. This slot used to hold a
  // descendant-selector entry aimed at a rail row that is neither active nor
  // hovered, colouring it with the theme's own secondary-ink token. (Described
  // rather than spelled, and that is not fussiness: `@import "tailwindcss"`
  // scans THIS FILE, so a comment quoting the utility compiles it back into
  // the shipped stylesheet — web/app/globals.css carries the same warning over
  // the same class of bug, and this comment's own first draft reproduced it.)
  //
  // It was added for the client's 31 Aug 2026 ruling ("i want more visual differentiation
  // between what's a section and what's a chip. maybe chips texts darker?
  // keep section text as they are"). At the time a nav ROW and a SECTION
  // HEADING both rested at `--spine-ink-quiet`, so they read as one tone in
  // two sizes, and `--ink-secondary` was the already-named tier between quiet
  // and full ink. THE PREMISE EXPIRED TWO DAYS LATER. Kit v1.2.18
  // (2026-09-02) moved `rail.tsx`'s `ROW_IDLE` off `--spine-ink-quiet` and
  // onto `--spine-ink` outright, on a LATER client ruling given live against
  // all six spine x theme combinations, verbatim: "nav text should ALWAYS be
  // either pure black or pure white — never gray — depending on what it sits
  // on." The heading was deliberately left on `--spine-ink-quiet` (a heading
  // is not nav text), so the kit's own default now draws the 31 Aug
  // separation MORE strongly than this override ever did — measured, not
  // assumed, as ink on each spine's own `--spine-fill` ground:
  //
  //                 this override   kit ROW_IDLE   the heading it must beat
  //   paper/light        8.08          15.76              5.90
  //   ink/light          1.95  ✘       17.39             11.53
  //   mango/light        6.19          12.07             12.07
  //   paper/dark         9.03          13.62              7.03
  //   ink/dark          11.31          17.06              8.81
  //   mango/dark         1.05  ✘       12.07             12.07
  //
  // AND IT WAS BREAKING TWO OF THE SIX. `--ink-secondary` is THEME-scoped
  // (#4a4946 light / #d5d1c9 dark) and knows nothing about spine, while two
  // of the three spines have a ground that does NOT follow the theme: ink's
  // is dark in both palettes, mango's is #FED069 in both. So light-theme
  // ink put a dark grey on a dark ground at 1.95:1, and dark-theme mango put
  // a light grey on a bright ground at 1.05:1 — both far under AA for
  // primary navigation text, and neither reachable in the 2026-09-02 →
  // 2026-09-03 window when `ink` was retired and mango was not yet paired
  // with a dark palette in review. The kit's per-spine `--spine-ink` is
  // correct on all six by construction (12.07 – 17.39) because it is
  // SPINE-scoped, which is the axis this ground actually moves on.
  //
  // ON MANGO THE OVERRIDE WAS ALSO BACKWARDS: tokens.css states that spine
  // has NO quiet tier on purpose (`--spine-ink-quiet` IS `--ink-on-accent`),
  // so its rows and headings are one charcoal by design and the chip/section
  // distinction there is carried by weight and size. Forcing `--ink-secondary`
  // made a mango chip LIGHTER than the section above it — the opposite of what
  // the client asked for on 31 Aug.
  //
  // Deleted rather than made spine-aware: a spine-aware rewrite would land on
  // `--spine-ink` for every spine, which is exactly what `ROW_IDLE` already
  // says. The not-hovered clause went with it — it was pairing with a kit hover
  // rule that lifted the row to `--spine-ink`, and v1.2.18 removed that rule, so
  // all the clause did was make a resting row jump colour under the pointer.
  //
  // (1) THE SECTION CHEVRON, RE-ALIGNED (client, 31 Aug 2026: "on sections,
  // move the arrow that collapse/expands to the right, so it aligns with the
  // icons"). Checked against the row geometry rather than guessed: a row's
  // icon slot and a heading's label both start at the same x (`--rail-inset
  // + --space-3`, one from the full-bleed row paying its negative margin
  // back in padding, the other from the column's own padding plus the
  // heading's `px-[var(--space-3)]`) — rail.tsx's own 24 Aug 2026 note has
  // the heading's chevron sitting AFTER the label instead, at a width that
  // moves with the label's own length. "Aligns with the icons" reads as the
  // icons' fixed column, not the far edge of the rail — the far edge lines
  // up with nothing below it. Reordering the heading's two children with
  // `order` (its label span and its `aria-hidden` chevron are already
  // siblings in a flex row) puts the glyph at that same fixed x with no
  // accessibility cost: both chevrons are `aria-hidden`, so a screen
  // reader's order is unaffected and only the sighted layout moves.
  // (2) A HAIRLINE BETWEEN NAMED SECTIONS (client, 31 Aug 2026: wants the
  // same thin rule the profile menu already draws between its own blocks —
  // that menu's `DropdownMenuSeparator` is a filled `h-px bg-border` block,
  // the SAME token this file's own `Separator` import already draws with
  // (`separator.tsx`'s `default` variant), and the SAME weight the file
  // header comment above already claims for "the rail's named sections, here
  // and in the phone's sheet" — true only of the phone's sheet (its
  // `railBlocks.map` below literally renders `<Separator className="my-2"
  // />`), never of the desktop rail: `Rail` (vendored, R45) renders every
  // `[data-slot=rail-group]` itself, inside one `<nav>`, with a plain flex
  // `gap` and no rule between them, so a real `<Separator>` node cannot be
  // interleaved without a hand-edit to `rail.tsx` (`web/test/vendored-kit.test.ts`
  // would fail it). Painted from OUTSIDE instead, the same descendant-selector
  // technique as the two overrides below: a `box-shadow` inset at each
  // non-first group's own top edge, `--hairline-over` (tokens.css) being
  // exactly `inset 0 1px 0 var(--hair)` — `--hair` IS `--border` (tokens.css
  // §"hair"), so this is the identical colour and 1px weight
  // `DropdownMenuSeparator`/`Separator` paint with a real element, with no
  // extra DOM node the vendored `<nav>` never asked for. The shadow anchors to
  // the border box, not the padding box, so it sits exactly on the seam
  // between one group's box and the next — which is also why the padding
  // BELOW it has to be measured against something, not guessed. `<nav
  // data-slot="rail-nav">` (rail.tsx) lays every group out with its own
  // `gap-[var(--space-5)]`, so the space ABOVE the hairline (last item of the
  // group above, down to this group's own top edge, where the line is drawn)
  // is always exactly `--space-5` (20px) — a value this file doesn't set and
  // can't change without hand-editing the vendored nav. RE-DERIVED 1 Sep 2026
  // after the client flagged the gap as uneven: the padding below used to
  // read `pt-[var(--space-3)]` (12px), reasoned against `DropdownMenuSeparator`'s
  // own `my-[var(--space-2h)]` — a comparison to the WRONG neighbour, since
  // that menu's rule sits between two rows in one flex column with one gap value
  // on both sides of it, and this hairline sits between two DIFFERENT
  // measurements (the kit's own `gap-5` above, this override's own padding
  // below) that were never the same number. `pt-[var(--space-5)]` matches the
  // kit's own gap instead of a value borrowed from an unrelated component, so
  // the heading below the line now sits exactly as far from it as the last
  // item above the line does: 20px on both sides, measured and matched, not
  // assumed even.
  const RAIL_CONTENT_OVERRIDES = [
    "[&_[data-slot=rail-group-heading]>span]:order-last",
    "[&_[data-slot=rail-group-heading]>svg]:order-first",
    "[&_[data-slot=rail-group]:not(:first-child)]:pt-[var(--space-5)]",
    "[&_[data-slot=rail-group]:not(:first-child)]:shadow-[var(--hairline-over)]",
  ].join(" ")
  const railContent = (
    <div
      data-rail-collapsed={collapsed ? "" : undefined}
      className={`flex min-h-0 flex-1 flex-col overflow-x-clip ${RAIL_CONTENT_OVERRIDES} ${collapsed ? "items-center" : ""}`}
    >
      {!TEAM_SCREENS_HIDDEN && (
        <div className="pb-3">
          <TeamSwitcher active={active} onCreateTeam={() => setCreating(true)} collapsed={collapsed} />
        </div>
      )}
      {/* pb-6, DOUBLED FROM THE RAIL'S OWN pb-3 RHYTHM (client, 31 Aug 2026:
          "leave air underneath it before starting with the sections") — the
          one gap in this column that is bigger than its neighbours, on
          purpose, because the client asked for air under the mark
          specifically and not for the whole rail to breathe more. */}
      <div className="pb-6">
        <NavBrandHeader collapsed={collapsed} homeLabel={t("Go to Welcome")} spine={spine} />
      </div>
      {homeStandalone.map((item) => (
        <div key={item.slug} className="pb-3">
          <StandaloneNavItem
            item={item}
            active={item.slug === activeRailId}
            collapsed={collapsed}
            onSelect={() => goToSection(item.path)}
          />
        </div>
      ))}
      {/* THIS WRAPPER IS NOW BELT-AND-SUSPENDERS, KEPT ON PURPOSE. It used to
          be the ONLY thing making Rail's own active row a pill, back when the
          vendored kit's `ROW_EXPANDED` (templates/rail.tsx) was still
          `rounded-none` and could not be hand-edited here (pinned; a hand-
          edit fails web/test/vendored-kit.test.ts) — so this reached the
          kit's own stable hook, `data-slot="rail-item"` plus the
          `data-active` Rail sets on the lit row, from OUTSIDE the vendored
          file. The kit shipped `rounded-pill` natively in `ROW_EXPANDED` as
          of v1.2.16 (2026-09-02), so `<Rail>`'s own rows no longer need this
          — it now just re-asserts a value the kit already draws. Left in
          rather than deleted: a future design-sync that regresses the kit's
          own value fails silent instead of square, and there is nothing to
          re-derive if it does.

          THE ACTUAL BUG THAT KEPT RECURRING WAS NEVER HERE — it was that
          this div wraps ONLY `<Rail>` (below), and `StandaloneNavItem`'s
          entries (House, `homeStandalone.map` above) render BEFORE this div,
          entirely outside it. Every prior pass fixed `<Rail>`'s own rows —
          first this override, then the kit itself — and House's separate,
          hand-copied skin (this file's own `StandaloneNavItem`, which has
          to duplicate the kit's row shape at all only because rail.tsx never
          exports `ROW_EXPANDED`/`ROW_COLLAPSED` — see that function's own
          header) kept its stale `rounded-none` untouched through both,
          because nobody traced that House takes neither code path. Fixed
          2026-09-02 by matching `StandaloneNavItem`'s own literal to the
          kit's current value. The durable fix — exporting the kit's row
          constants so there is only one shape to drift — is still owed;
          this stops the immediate bleeding. */}
      {/* `overflow-x-clip` HAS TO SIT HERE TOO, NOT JUST ON `railContent`
          ABOVE — measured live, 1 Sep 2026, after the client reported the
          rail scrolling sideways. This div sets `overflow-y-auto` and
          nothing for `overflow-x`, which reads as "leave it alone" but isn't:
          CSS overflow is a pair, and the spec computes an axis left at its
          initial `visible` as `auto` instead the moment its OTHER axis is
          anything but `visible` (so a lone `overflow-y-auto` quietly becomes
          `overflow-y-auto overflow-x-auto`, not `overflow-y-auto
          overflow-x-visible`).

          THIS DIV USED TO RE-SPEND `--rail-inset` (`-mx-[…] px-[…]`), AND NO
          LONGER NEEDS TO. That pair was added 2 Sep 2026 for a client report
          of a SQUARE active row under a grouped section ("Apps" under
          "Build"): back then every `<Rail>` row bled full-width through its
          own `-mx-[var(--rail-inset)]`, and `overflow-x-clip` clips anything
          past THIS box's padding edge — which sat 24px short of where the
          bled row's `rounded-pill` curve actually lived, so the curve was cut
          away whole and the corner read flat. Cancelling and re-spending the
          inset here moved the clip boundary out to meet it.

          The kit then removed the bleed outright in v1.2.22 (the client's
          next ruling on the same row: "allow a bit of blank space on the
          sides"), so `ROW_EXPANDED` is a plain inset pill now and nothing in
          `<Rail>` reaches past this box at all. The pair had become a
          geometric no-op sitting on top of a reason that no longer existed,
          which is the shape a future reader mis-copies. `overflow-x-clip`
          stays: it is still doing the one job it was added for. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        <div className="[&_[data-slot=rail-item][data-active]]:rounded-pill">
        <Rail
          // See the comment on `closedGroups` above: `defaultOpen` is read once
          // at mount, so this key forces the one remount that applies the real
          // persisted fold state once it has loaded.
          key={groupPrefsReady ? "rail-ready" : "rail-pending"}
          groups={railGroups}
          current={activeRailId}
          spine={spine}
          mark={null}
          wordmark={null}
          member={null}
          label={t("Sections")}
          collapsed={collapsed}
          onCollapsedChange={persistCollapsed}
          onGroupToggle={persistGroupToggle}
        />
        </div>
      </div>
      <div
        className={`mt-3 flex shrink-0 items-center ${
          collapsed
            ? "flex-col gap-[var(--space-2)]"
            : "gap-[var(--space-1)] rounded-pill bg-[var(--spine-chip-fill)] p-[var(--space-1)] pe-[var(--space-3)]"
        }`}
      >
        {collapsed ? (
          // THE AVATAR IS THE ONLY TRIGGER, COLLAPSED (client, 31 Aug 2026:
          // reported more than once that a separate small dots button beside
          // the avatar read as two controls for one menu — this row used to
          // be `ProfileMenu … compact` (the dots) PLUS a second, plain avatar
          // button that only navigated to `/profile`). One element now:
          // `ProfileMenu`'s own `trigger` prop takes the rail's branded
          // avatar-md chip directly, so clicking the face itself opens the
          // SAME menu the expanded rail's dots open, and there is no second
          // control left to remove. `tooltip` replaces the bespoke
          // Tooltip+button this block used to hand-roll — same label, same
          // side, now owned by the one component that draws the trigger.
          //
          // THIS ALSO FIXES THE EDGE TOGGLE'S ALIGNMENT (`railEdgeToggle`,
          // below): its floating collapse/expand button is anchored to
          // *this row's own bottom edge*, sized to exactly one `--avatar-md`.
          // With the dots stacked above the avatar, the row was taller than
          // one avatar and the toggle — still avatar-height — no longer
          // centred on the row's one visible face. A row that is nothing but
          // the avatar is exactly `--avatar-md` tall again, which is what the
          // toggle already assumed.
          <ProfileMenu
            active={active}
            tooltip={railMember.name}
            trigger={
              // `inline-flex`, NOT THE BARE BLOCK BUTTON THE REST OF THIS
              // FILE'S TRIGGERS USE — measured, not guessed, after the
              // alignment fix above still read a few pixels off in the
              // browser: `Avatar` (kit, vendored) is `inline-grid`, an
              // INLINE-level box, so a plain `<button>` around it opens an
              // inline formatting context and reserves the font's descender
              // space below the avatar's own baseline — 7px of dead air under
              // a 32px avatar-md circle, measured via `getBoundingClientRect`,
              // that pushed this button's own box (and so its bottom-anchored
              // position in the flex column above) out of registration with
              // the edge toggle's `--avatar-md`-tall box even though both
              // read the same token. `inline-flex` drops the line box
              // entirely — a flex container sizes to its child with no
              // baseline reservation — and the toggle needed no matching
              // change: it was already a kit `Button`, `inline-flex` from
              // its own variant, never carrying the gap this hand-built
              // trigger did.
              <button
                type="button"
                className="inline-flex cursor-pointer rounded-pill active:translate-y-[0.0625rem]"
                aria-label={railMember.name}
              >
                <Avatar size="md" variant="brand" className="bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)]">
                  {railMember.imageUrl && <AvatarImage src={safeSrc(railMember.imageUrl)} alt={railMember.name} />}
                  <AvatarFallback>{railMember.initials}</AvatarFallback>
                </Avatar>
              </button>
            }
          />
        ) : (
          // THE WHOLE PILL IS THE TRIGGER NOW (client feedback, 1 Sep 2026) —
          // the same unification the collapsed rail already got above: this
          // used to be a plain `onSelect`-navigating button (avatar + name)
          // sitting beside a SEPARATE `ProfileMenu … compact` dots trigger, two
          // controls doing two different things in one card. There is only
          // ONE thing to do with your own member row — open the account menu —
          // so the avatar+name button becomes `ProfileMenu`'s own `trigger`,
          // exactly the collapsed rail's pattern (`trigger`, `tooltip`), and
          // the standalone dots button is gone. Nothing separately navigates
          // to `/profile` any more; "Your profile" inside the opened menu does.
          <ProfileMenu
            active={active}
            tooltip={railMember.name}
            trigger={
              <button
                type="button"
                aria-label={railMember.name}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-[var(--space-3)] rounded-pill border-0 bg-transparent text-start active:translate-y-[0.0625rem]"
              >
                <Avatar size="md" variant="brand" className="bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)]">
                  {railMember.imageUrl && <AvatarImage src={safeSrc(railMember.imageUrl)} alt={railMember.name} />}
                  <AvatarFallback>{railMember.initials}</AvatarFallback>
                </Avatar>
                <Text
                  as="span"
                  size="sm"
                  aria-hidden
                  className="min-w-0 flex-1 truncate font-[var(--font-weight-medium)] text-[var(--spine-ink)]"
                >
                  {memberShown}
                </Text>
              </button>
            }
          />
        )}
      </div>
    </div>
  )

  return (
    // THE LANGUAGE WRAPS THE WHOLE SHELL, so the nav, the breadcrumbs, every
    // routed screen and every dialog opened from one all read the same `t`.
    // Here rather than in the root layout because the root layout is a server
    // component with no session: the preference arrives on `active.user`, which
    // this shell already has in hand before it paints.
    <LanguageProvider value={active.user?.language}>
    {/* NOT A FLEX COLUMN ANY MORE, AND NOT `min-h-[100svh]`. This wrapper used
        to lay the mobile bar and the shell out one above the other in a page
        that could grow; `ScreenShell`'s page level is `h-dvh overflow-hidden`
        since kit v1.2.28, so a bar in the flow ABOVE it would push a full
        window's worth of shell past the bottom of a window that can no longer
        scroll to reach it. The bar is lifted OUT of the flow instead (it was
        already `sticky top-0 z-20`, i.e. already pinned to the window's own
        top edge — `fixed` is the same position on a page that never moves) and
        the shell pays for it in PADDING. Border-box means the ground is still
        exactly one window tall and still paints edge to edge behind the bar;
        what the padding insets is the card, which is the only thing that
        should move.

        `--shell-top` IS THE ONE NUMBER, READ TWICE — the bar's own height, and
        the shell's inset for it. It was already declared here and had stopped
        being read by anything; it is live again, and it is why the bar's
        height is a variable rather than a literal. Zero at `md`, where the bar
        is not drawn. */}
    <div className="[--shell-top:3.75rem] md:[--shell-top:0px]">
      {/* Mobile top bar, an explicit height, because `--shell-top` above is a
          promise about it. ScreenShell has no mobile-chrome concept of its
          own (the rail simply disappears below `md`, by the kit's own
          design law, no hamburger anywhere) — this stays exactly as bespoke
          as it always was, rendered OUTSIDE the shell rather than inside its
          header band, because it is a full-bleed, bg-card, bordered surface
          and the header band's whole law is that it paints no fill of its
          own. */}
      <header className="bg-card fixed inset-x-0 top-0 z-20 flex h-[var(--shell-top)] min-w-0 items-center justify-between gap-2 overflow-hidden shadow-[var(--hairline-under)] px-4 md:hidden">
        <div className="flex min-w-0 shrink items-center">
          <TeamSwitcher active={active} onCreateTeam={() => setCreating(true)} />
        </div>
        <div className="flex min-w-0 shrink items-center gap-1">
          {/* BUILD-1 §5: the running timer is in the header of EVERY screen, so
              it lives in the shell rather than on any one page. It renders
              nothing when nothing is running, which is most of the time. */}
          {teamId && <TimerBar teamId={teamId} onNavigate={onNavigate ?? softNavigate} />}
          {/* THE THEME CONTROL IS NOT HERE, and it is the reason this bar used
              to be wider than a phone. It is three segments the kit will not
              collapse to an icon, and on a 375px screen it pushed the avatar
              off the edge and the whole PAGE sideways with it. It lives in
              Gear, under the text size, and in the profile menu. */}
          <ProfileMenu active={active} />
        </div>
      </header>

      {/* THE SHELL. `spine={spine}` — the person's own Gear · Sidebar
       * choice (shared/spine.ts), which defaults to MANGO since the client's
       * ruling of 2026-09-02 and is offered again at onboarding. It defaulted
       * to paper before that, which is also what this file hardcoded before
       * the setting existed. `[data-spine="…"]` shares its block with bare
       * `:root` in tokens.css only on paper, which is what let this file read
       * `--spine-fill` etc. directly for as long as it drew its own `<aside>`;
       * on any other spine those tokens genuinely repaint, which is the whole
       * point. The prop is still named here rather than left to
       * `ScreenShell`'s own default — the two agree on mango today, but the
       * shell's default is a guess about a workspace and this is a fact about
       * a PERSON, and the day someone changes one of them they must not
       * silently change the other. `rail={null}` below `md`, via the shell's
       * own breakpoint law, is what already made this adoptable at all — see
       * COMPOSITION-MISMATCHES.md, the ScreenShell-family entry. */}
      <ScreenShell
        /* THE ONE CLASS THIS SHELL STILL NEEDS: room for the mobile bar.
           `ScreenShell`'s page level is `h-dvh` + `overflow-hidden` since kit
           v1.2.28, and `box-sizing: border-box` means this padding comes OUT
           of that window rather than adding to it — the ground still paints
           the full viewport (a background paints the padding box) and still
           runs flush to every edge, which is the client's own spine
           screenshot; what the padding insets is the card, so the card clears
           the `fixed` bar above it. Zero at `md`, where there is no bar.

           EVERY OTHER CLASS THIS LINE USED TO CARRY IS GONE, AND THE KIT
           RESOLVED THEM RATHER THAN THIS FILE DROPPING THEM. It read
           `min-h-0 flex-1 flex flex-col
           [&_[data-slot=screen-shell-card]]:flex-1
           [&_[data-slot=screen-shell-card]]:min-h-0` — a hand-built height
           chain, measured into place on 2026-08-31, whose whole job was to
           give the SCREEN level a real height when the PAGE level was a
           `min-h-full` block inside a `min-h-[100svh]` flex column and no
           percentage in the chain resolved. The reshape makes all of that
           unnecessary at the source: PAGE is a `h-dvh` box with a REAL
           height, SCREEN reads `h-full` off it, and every level below is
           `flex-1 min-h-0` inside the kit's own file. Keeping the override
           would be a second opinion about a height the kit now states.

           ONE OVERRIDE ARRIVES AS THE OTHERS LEAVE, AND IT IS A SCROLL FIX
           RATHER THAN A SPACING OPINION — MEASURED IN A BROWSER, NOT REASONED.
           `position: sticky` resolves its offsets against the SCROLLPORT'S
           PADDING BOX, and the kit's body pane is `p-[var(--space-6)]
           lg:p-[var(--space-7)]`. So every sticky bar this app draws inside
           the pane — the record tab strip (`STICKY_TABS`, record-chrome.tsx)
           and the collection tab strip
           (`shared/web/screen-engine/tabs-view.tsx`) — pins 32px BELOW
           the pane's own top edge, while the pane CLIPS at that edge. The band
           between the two is inside the scroller, so content scrolls THROUGH
           it: measured at 1440x900, a probe row sat at y=50.5-90.5 with the
           pinned bar's top at y=86.5 — visibly above the thing that is
           supposed to be covering it. Under the old shape the document was the
           scroller, `top-0` meant the viewport's own top edge, and there was
           no band for anything to appear in.

           THE PADDING MOVES DOWN ONE LEVEL RATHER THAN AWAY. `pt-0` on the
           pane, the same value re-spent on the content div below: the inset a
           screen sees is unchanged to the pixel (border-box, so `min-h-full`
           still floors that div to the pane and the footer still lands on the
           pane's floor), and a sticky child now pins at the pane's true top
           edge with nothing able to show above it. Only the BLOCK-START edge
           moves — the pane keeps its own inline padding, so the bleed on
           `STICKY_TABS` still reaches exactly the edge it was measured
           against. (That bleed belonged to `CondensedTitleBar` until it was
           deleted on 2026-09-03; the strip inherited both the bleed and the
           measurement, which is why this paragraph still holds.)

           IT IS AN OVERRIDE HERE AND NOT A KIT EDIT for the reason the five
           rail overrides above give: `shared/ui/` is vendored and pinned and a
           hand-edit fails web/test/vendored-kit.test.ts. Owed upstream — "a
           scroller's own padding must not sit between a sticky child and the
           clip" is the kit's sentence to write, not this file's. */
        className="pt-[var(--shell-top)] [&_[data-slot=screen-shell-body]]:pt-0"
        spine={spine}
        rail={railContent}
        railLabel={t("Sections")}
        /* THE COLLAPSE, THREADED BOTH WAYS. The shell draws the edge handle
           and holds the collapsed state; this app supplies its own rail NODE,
           and the shell cannot reach inside a node it was handed — so the
           value goes down (`railCollapsed`, and `collapsed` on our own
           Rail further up) and every change comes back
           (`onRailCollapsedChange`) to the same localStorage key the rail's
           own toggle used to write. Without the pair the handle would draw in
           the open position for ever while the column beside it narrowed.

           THE TWO LABELS ARE THE APP'S EXISTING WORDS, NOT THE KIT'S. The kit
           defaults to "Collapse the navbar" / "Open the navbar" — good
           English, and English is the only language a kit default is ever
           said in (R28's walk stops at `shared/ui/`, so a default cannot be
           in the catalogue). "Collapse" / "Expand" are already catalogued and
           already translated, and they were this control's own labels before
           the handle moved into the kit. */
        railCollapsed={collapsed}
        onRailCollapsedChange={persistCollapsed}
        railCollapseLabel={t("Collapse")}
        railExpandLabel={t("Expand")}
        /* THE ASSISTANT'S COLUMN — the rail's mirror, and the shell's own
           third level. Passed as an EMPTY BOX, not as the panel: the panel is
           mounted once at the ROOT (agent-host.tsx) so it outlives the
           navigation it causes itself, and it portals its elements into this
           box (web/lib/agent-dock.tsx has the whole argument, and
           web/test/agent-host.test.ts still locks the panel out of this file).

           SHUT MEANS ABSENT, AND THAT IS THE CLIENT'S OWN SENTENCE ("closed
           asstant show nothing. it's literally only the bar"). The kit does
           it: with `asideOpen` false it renders no column at all — not a
           zero-width box, not an icon strip — and the card takes the width
           back. Only the 3px handle stays, in the ground's own gutter. So
           nothing here needs a second opinion about the closed state; passing
           the slot unconditionally is what makes the HANDLE exist, and the
           handle is the only assistant control on a wide screen (the mango
           launcher is not drawn there — `SHELL.md`'s one-mango rule, argued in
           agent-host.tsx).

           GATED THE SAME WAY THE LAUNCHER ALWAYS WAS. No `agent:create`, no
           column and no handle: a bar that opens an empty panel is worse than
           no bar. The server re-checks every action regardless.

           BELOW `md` THE KIT DROPS THIS COLUMN ITSELF, and the assistant
           becomes the floating panel again — one decision, taken by width in
           agent-host.tsx against the kit's own 48rem, never a second copy of
           the panel.

           THE OPEN STATE IS CONTROLLED AND PERSISTED, exactly as the rail's
           collapse is one prop above: the value goes down (`asideOpen`) and
           every change comes back (`onAsideOpenChange`) to the module store
           that mirrors it to `localStorage`, so the column the person left
           open is the column they come back to.

           THE LABELS ARE THE KIT'S NOUNS, in this app's catalogue. Unlike the
           rail's "Collapse"/"Expand" — which were this app's words before the
           handle moved into the kit — the assistant had no shorter name of its
           own: "Open the assistant" was already the launcher's own label and
           "Close the assistant" is new (R28: extracted, catalogued, and the
           ceiling moved in the same commit). */
        aside={can("agent", "create") ? <AgentDockSlot /> : undefined}
        asideLabel={t("Assistant")}
        asideOpen={assistantOpen}
        onAsideOpenChange={setAgentOpen}
        asideOpenLabel={t("Open the assistant")}
        asideCloseLabel={t("Close the assistant")}
        breadcrumb={
          /* THE TRAIL, ON THE GROUND. NAVIGATION TEXT ONLY — client rule,
             stated at the kit's own `breadcrumb` prop: no buttons, no pills,
             no counts, no status. The handover drew a `+` up here; a screen's
             one create control belongs in the card, which is where every
             screen in this app already draws it.

             `onClickCapture` ON THE STRIP ITSELF, not on a wrapper div.
             `BreadcrumbFolders` spreads its rest props onto its own `<nav>`,
             so the interception rides the component and adds no element —
             which matters here more than it did in the header band: the strip
             pays a negative block-end margin to tuck its tabs' feet under the
             card, and the kit's own slot deliberately declares no z-index, no
             isolate and no transform so the tabs' z-1/z-3 can resolve either
             side of the card's z-2. A wrapper is one more box that could open
             a stacking context by accident.

             R37: the kit renders REAL `<a href>` crumbs — middle-click and
             copy-address still work — and the plain left click is intercepted
             into the app's own soft-navigation bus, which is exactly the
             inline form the law names. */
          trail.length === 0 ? undefined : (
            <BreadcrumbFolders
              items={trail}
              onClickCapture={(e) => {
                const a = (e.target as HTMLElement).closest("a")
                if (!a) return
                const href = a.getAttribute("href")
                if (!href || !href.startsWith("/")) return
                e.preventDefault()
                ;(onNavigate ?? softNavigate)(href)
              }}
            />
          )
        }
        /* HOW DEEP THE TRAIL IS, BECAUSE THE SHELL WILL NOT LOOK. `breadcrumb`
           is an opaque node to the kit and it refuses to inspect one, so the
           length of the same array is stated here: one level is a top-level
           location and takes the door's own big title, two or more steps it
           down a rung. A screen with no trail at all is a top-level screen,
           which is the kit's own default and what `|| 1` says out loud. */
        breadcrumbDepth={trail.length || 1}
        header={
          /* THE HEADER BAND HOLDS THE RUNNING TIMER, AND ONLY WHEN ONE IS
           * RUNNING. The breadcrumbs used to share this row; they are on the
           * ground now (above), and the timer cannot follow them there —
           * "navigation text only" is the client's rule for that strip and a
           * clock with a Stop button on it is a control. So it stays in the
           * band, inside the card, which is where the kit says a screen's
           * controls go.
           *
           * IT IS CONDITIONAL BECAUSE THE BAND COSTS REAL SPACE. `TimerBar`
           * renders nothing when nothing is running, which is most of the
           * time — but the band it sits in is the SHELL's element and carries
           * the shell's own header padding whether or not anything is inside
           * it, so an unconditional `header` would put ~90px of empty band
           * above every screen in the app. `useRunningTimers` is the same
           * cached read `TimerBar` itself makes (one key, one in-flight
           * request, `loadShared`), asked one level up so the row can be
           * decided rather than drawn empty.
           *
           * BUILD-1 §5 — "a running timer appears in the header of EVERY
           * screen" — is unaffected: the timer is still in the shell, on
           * every screen, and still shows nothing when nobody is timing
           * anything. The mobile bar keeps its own copy above. */
          !teamId || runningTimers.length === 0 ? undefined : (
            <div className="hidden justify-end md:flex">
              <TimerBar teamId={teamId} onNavigate={onNavigate ?? softNavigate} />
            </div>
          )
        }
      >
        {/* `overflow-x-clip`, NOT `overflow-x-hidden`. They look identical and
            they are not: CSS says an element with `overflow-x: hidden` and a
            visible other axis computes `overflow-y` to `auto`, which makes this
            a SCROLL CONTAINER — and a `position: sticky` child then pins to a
            box that never scrolls, so it silently does nothing, which is
            exactly what happened to the record header and tab strip (D3) the
            first time they were built. `clip` clips the same overflow and
            creates no scroll container.
         *
         * THE BOX IT MUST NOT BECOME IS NO LONGER THE DOCUMENT, AND THE RULE
         * IS UNCHANGED BY THAT. Since kit v1.2.28 the one scroller behind
         * every screen is `ScreenShell`'s body pane
         * (`[data-slot="screen-shell-body"]`), the direct parent of this div;
         * the page itself is `h-dvh overflow-hidden` and does not move. So the
         * sticky layers this div wraps — the record tab strip (`STICKY_TABS`,
         * record-chrome.tsx) and the collection tab strip
         * (`shared/web/screen-engine/tabs-view.tsx`) — now pin to the pane
         * instead of to the window, which is what they always read as. Turning
         * THIS div into a scroll container would put a second scroller between
         * them and the pane and break both the same way; `clip` is still what
         * stops that.
         *
         * THERE WERE THREE OF THEM UNTIL 2026-09-03. The condensed title bar
         * was the first, and it is gone — client: "when i scroll down, the
         * whole compressed title is useless, so remove that. When I scroll
         * down, what is at the top should be only the tabs." Its measured
         * offset mechanism went with it: both strips pin at `top-0` now
         * because there is nothing above them to clear.
         *
         * ONE PAGE CONTAINER, ONE CAP, ON THE SHELL (R29, UI-RULEBOOK L1). This
         * used to live one level down, in `deep-link-screen.tsx`'s own return —
         * which capped every MODULE screen (meetings, accounts, tickets, …) but
         * not the five account screens rendered straight into this same shell
         * (home, kwapso, settings, profile, invitations): they hit the `return`
         * above that never reaches deep-link-screen's wrapper, so they filled
         * this div edge to edge with nothing capping them at all. Invisible on
         * the laptop width the fix was screenshotted at (1283px, narrower than
         * 1600 anyway) and plainly visible on a wide monitor, where the client
         * measured Kwapso running past 2100px while Meetings, three clicks
         * over, stopped at 1600 — "Kwapso is currently the widest ... meetings
         * is noticeably narrower." Both screens already share this one div;
         * the cap belongs HERE so every screen this shell renders inherits it
         * the same way, and deep-link-screen's own wrapper keeps only the
         * `flex flex-col gap-6` layout it still needs, not a second width.
         *
         * WIDENED AGAIN, TWICE MORE, SAME DAY (client, live on staging, 31 Aug
         * 2026). Round two: "screen width. you made them thinner! i wanted
         * them even wider!" — answered with a guessed fluid cap,
         * `min(96vw,2200px)`. Round three, the one that actually fixed it:
         * "wider screens, align to the right same level as breadcrumbs!" — a
         * real target, not a bigger guess. `ScreenShell`'s header band is
         * `min-w-0` plus its own density padding and sets no width, so it
         * already runs to the full padded edge of the card, the same padding
         * as this content div's own parent (`DENSITY_HEADER`/`DENSITY_BODY`
         * converge at `lg`). `max-w-none` is what makes this div's right edge
         * land on that same edge — no guessed number, fluid or fixed, does
         * that on every rail state (expanded/collapsed) and every viewport
         * the way matching the band's own lack of a cap does.
         *
         * THE CAP IS STILL THIS FILE'S, AND THE SHELL DID NOT TAKE IT.
         * Re-examined on 2026-09-02, because the reshape gave the kit a
         * floating CARD and that is the kind of thing that quietly becomes a
         * second page container: `screen-shell.tsx`'s card is `flex-1` inside
         * the ground's gutter and names no `max-w-*` anywhere, so it is a
         * fluid column and not a measure. There is still exactly one page
         * width in this door and it is still declared here — the same string
         * `PAGE_WIDTH_OWNER` carries in shared/rules/registry.ts, which R29
         * checks verbatim, and there is no `SCREEN_WIDTH_EXEMPT` pin this
         * change makes stale. `mx-auto`/`w-full` stay on the line for R29's
         * own positional signature (`one-page-width`, web/test/rules.test.ts)
         * even though centring has nothing left to do once there is no cap to
         * centre inside of. What DID change is the reference: the crumbs the
         * client asked this edge to line up with are on the GROUND now,
         * outside the card, so the two no longer share an edge and cannot be
         * made to — the card's own padded edge is what a screen aligns to,
         * which is the same edge this line has been landing on all along.
         *
         * `flex flex-col min-h-full` — THE FOOTER-TO-THE-BOTTOM CHAIN STARTS
         * HERE, 2026-08-31. Client, verbatim: "i want that the footer is
         * always at the bottom, even if there's not enough content on the
         * screen to push it down. however i dont want that its all the time
         * visible if there's content, should come when scrolling down" — the
         * ordinary sticky-footer flex trick, and explicitly NOT
         * `position: sticky`/`fixed` (that draws the second behaviour the
         * client just ruled out). `BODY` above (`ScreenShell`'s body pane,
         * the kit's own `screen-shell.tsx`) is a flex item with a real,
         * resolved height once the shell's `flex-1` chain reaches it — a
         * flex item's used height counts as definite for a descendant's
         * percentage height even though nothing here sets an explicit
         * `height` anywhere, which is what lets `min-h-full` floor this div
         * to BODY's own height instead of its own (short) content height.
         * From here down the rest of the chain is plain `flex-1`/`min-h-0`,
         * no percentages needed: `deep-link-screen.tsx`'s content div and its
         * `motion-page-in` wrapper, then `record-chrome.tsx`'s own
         * `RecordScreen` (the one caller this reaches that draws a footer at
         * all — every other screen this div wraps just ends up with a
         * flex column one item taller than its content, which is invisible).
         * THE PANE IS THE ONE SCROLLER THROUGHOUT, and since 2026-09-02 that
         * is a real height rather than an inferred one: `BODY` is `flex-1
         * min-h-0 overflow-y-auto` inside a card inside a `h-dvh` page, so
         * `min-h-full` here floors this div to a number the browser knows
         * outright — the whole hand-built height chain this file used to
         * carry on `ScreenShell`'s own `className` is deleted with it.
         * Nothing here creates a nested scroll box, so a long record's footer
         * still scrolls away ordinarily, past the end of its own content.
         *
         * `pb-24 md:pb-0` IS STILL THE PHONE'S BOTTOM BAR, and it still has
         * to be paid inside the scroller: that bar is `fixed` and overlays
         * the pane's last rows whether or not the page behind it moves. */}
        <div className="mx-auto flex w-full max-w-none min-w-0 min-h-full flex-col overflow-x-clip pt-[var(--space-6)] lg:pt-[var(--space-7)] pb-24 md:pb-0">{children}</div>
      </ScreenShell>

      {/* Mobile bottom tabs — five slots, gated items hidden, and when there
       * are more sections than slots the fifth becomes More. The rail beside
       * this is dropped entirely below `md` by the shell's own breakpoint
       * law, so this bar is the ONLY way through the app on a phone or a
       * tablet: anything it cannot reach cannot be reached. */}
      <nav className="bg-card fixed inset-x-0 bottom-0 z-20 flex items-center justify-around shadow-[var(--hairline-over)] px-2 py-1.5 md:hidden">
        {bottomNav.map((item) => {
          const Icon = item.Icon
          const activeNav = isNavActive(item.path, here)
          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => goToSection(item.path)}
              aria-current={activeNav ? "page" : undefined}
              /* `min-w-0` + a box for the label: this bar is up to six
                 `flex-1` slots on 375px, so a label like "Knowledge base"
                 has ~59px and overflows it. The portal's bar carries the
                 measured numbers for the same defect. */
              className={`motion-hover flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[var(--radius)] py-1.5 text-badge font-medium ${
                activeNav ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="w-full text-center leading-tight">{item.title}</span>
            </button>
          )
        })}

        {overflowNav.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            /* Active when the section you are ON lives in here — otherwise
               the bar shows nothing highlighted and the app looks lost. */
            aria-current={
              overflowNav.some((i) => isNavActive(i.path, here)) ? "page" : undefined
            }
            className={`motion-hover flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[var(--radius)] py-1.5 text-badge font-medium ${
              overflowNav.some((i) => isNavActive(i.path, here))
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          >
            <DotsThree className="size-5 shrink-0" />
            <span className="w-full text-center leading-tight">{t("More")}</span>
          </button>
        )}
      </nav>

      {/* EVERYTHING ELSE, on a phone. It lists EVERY section, not only the
       * ones the bar could not fit, and in the desktop rail's own groups — so
       * "where is Work logs?" has one answer on both, and a person who learns
       * the app on a laptop is not relearning it on a phone. Redundant by
       * design: four entries appear twice, which costs a little space and buys
       * predictability. */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto md:hidden">
          <SheetHeader>
            <SheetTitle>{t("All sections")}</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 flex flex-col gap-1 pb-2">
            {railBlocks.map((group, i) => (
              <React.Fragment key={group[0].slug}>
                {i > 0 && <Separator className="my-2" />}
                {group.map((item) => {
                  const Icon = item.Icon
                  const activeNav = isNavActive(item.path, here)
                  return (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        goToSection(item.path)
                      }}
                      aria-current={activeNav ? "page" : undefined}
                      /* PILL, NOT A BOX — the phone's "All sections" sheet is the
                         one other place (besides the desktop rail) that hand-draws
                         an active-row highlight, and it drew it with the RECTANGLE
                         radius (`rounded-[var(--radius)]`, R31's box vocabulary)
                         and the neutral `bg-muted` fill: at this row's own ~40px
                         height a 24px radius happens to clamp into a stadium for a
                         short one-line label, the exact "reads as a pill only by
                         an arithmetic accident" trap the desktop rail's own active
                         row already fell into once (see the note above `<Rail>`,
                         below, for that fix) — a longer label that wraps to two
                         lines, or a taller row from a future token change, turns
                         it back into a visibly square-cornered box with no fix
                         needed anywhere else, which is exactly the bug reported
                         ("sharp-edged, full-width mango rectangle instead of a
                         rounded pill"). `rounded-pill` names the shape outright,
                         and `bg-[var(--spine-active-fill)]`/`text-[var(--spine-
                         active-ink)]` are the SAME tokens the desktop rail's own
                         active row paints with (tokens.css: `--spine-active-fill`
                         is mango on the bare `:root`, so it resolves the same way
                         here with no spine wrapper needed) — one active-row look,
                         drawn twice because the row itself cannot be shared (this
                         sheet is a flat button list, not `<Rail>`), matched anyway. */
                      className={`motion-hover flex items-center gap-2 px-3 py-2.5 text-sm font-medium ${
                        activeNav
                          ? "rounded-pill bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)]"
                          : "rounded-[var(--radius)] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.title}
                    </button>
                  )
                })}
              </React.Fragment>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Not rendered while creation is closed — a dialog that can only ever be
          refused by the door is worse than no dialog (shared/product.ts). */}
      {!TEAM_CREATION_CLOSED && (
      <CreateTeamDialog
        open={creating}
        onOpenChange={setCreating}
        draftKey="team:new"
        onCreate={async (name) => {
          await active.createTeam(name)
          toast.success(`Created ${name}`)
        }}
      />
      )}

      {/* The AI co-pilot (launcher + panel) now lives at the root layout
       * (agent-host.tsx) so it survives navigation — it is intentionally not
       * rendered here. */}
    </div>
    </LanguageProvider>
  )
}

/** THE APP IS STARTING — the mark, not a skeleton.
 *
 * A skeleton is a promise about SHAPE: these grey bars are where your list is
 * about to be. That promise is exactly right inside a screen that has already
 * been drawn, and it is a lie here — at this moment the app does not yet know
 * whether you have one team or six, which sections your role can see, or whether
 * you are about to be sent to onboarding instead. It drew a sidebar and a list
 * for people who were on their way somewhere else.
 *
 * So the brief first load shows the mark, which IS the boot screen — the same
 * element the parser painted, still turning, never restarted. Only the FIRST
 * screen reaches this; the session is cached after that. */
export function ShellLoading() {
  const t = useT()
  return <MarkLoader label={t("Loading…")} />
}
