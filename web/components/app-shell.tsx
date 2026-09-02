"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
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
import { Isotype, Logotype } from "@shared/ui/components/brand/brand"
import { Breadcrumbs } from "@shared/ui/components/breadcrumbs/breadcrumbs"
import { Button } from "@shared/ui/components/button/button"
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
import { AppWindow, BadgeCheck, Building2, CalendarClock, CalendarRange, Hammer, Home, LibraryBig, ListTodo, Palette, PanelLeftClose, PanelLeftOpen, ProfileCircle, Route, Settings, LifeBuoy, Timer, MoreHorizontal } from "@shared/ui/foundations/icons"
// `SeaWaves` is the audit module's mark and the kit's 96 have no glyph of that
// name yet, so it borrows the kit's own glyph for the concept (ATTRIBUTION).
import { SeaWaves } from "@shared/ui/foundations/icons"
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
//     wants to sit outside every section (Home) — every RailGroup draws a
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
import { TimerBar } from "@/components/timer-bar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/components/sheet/sheet"
import { LanguageProvider } from "@shared/web/language"
import { applyScale } from "@shared/web/scale-section"
import { toSpine } from "@shared/spine"
import { ScreenShell } from "@shared/ui/compositions/templates/screen-shell"

// Kwapso is `inRail: false` now (client, 31 Aug 2026 — see NavGroup in
// pages.ts), so this mapping is never actually looked up — kept anyway, the
// same way `settings` already sat here unused, so `NavItem.icon`'s union
// stays fully covered rather than needing a cast at the one call site below.
const NAV_ICONS = { home: Home, settings: Settings, kwapso: BadgeCheck } as const
// The lucide component for each team SIDEBAR page in the rail — the same concept
// icons the tabs use (CONCEPT_ICON, pages.ts), as components rather than names
// because the rail renders them directly. Every sidebar section has a line here;
// a section without one falls back to Home, which is the tell that one is missing.
//
// TWO WERE MISSING, and the fallback is exactly why nobody noticed: `time` and
// `meetings` shipped without a line, so the rail drew Home three times — Home,
// Time and Meetings wearing one icon, which a tester reported as "Meetings and
// Time share the same icon". Both concepts already had their own glyph in
// CONCEPT_ICON (`timer`, `calendar-clock`); only this map had not been told.
// web/test/nav.test.ts now derives the required keys from TEAM_SECTIONS and
// insists every icon is distinct, so a silent fallback cannot ship again.
const SECTION_ICONS: Record<string, typeof Home> = {
  accounts: Building2,
  // The same glyph `CONCEPT_ICON.contacts` ("contact") resolves to everywhere
  // else it is drawn (the alias chain in shared/web/screen-engine/icon-names.ts
  // — "contact" → "profile-circle" → ProfileCircle) — one concept, one icon,
  // whether the rail draws it as a component or a screen draws it by name.
  contacts: ProfileCircle,
  tickets: LifeBuoy,
  knowledge: LibraryBig,
  processes: Route,
  stories: Hammer,
  sprints: CalendarRange,
  // The package a client bought — several sprints arriving together.
  waves: SeaWaves,
  apps: AppWindow,
  tasks: ListTodo,
  time: Timer,
  meetings: CalendarClock,
  brand: Palette,
}

/** THE SAME ROW SKIN RAIL'S OWN `RailRow` DRAWS, for the one destination that
 * sits outside any of Rail's `groups` (Home — see `NavGroup` in lib/pages.ts).
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
  item: { slug: string; title: string; Icon: typeof Home }
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
      : "h-[var(--control-height-button)] w-auto rounded-pill -mx-[var(--rail-inset,0px)] px-[calc(var(--rail-inset,0px)+var(--space-3))]",
    active
      ? "bg-[var(--spine-active-fill)] text-[var(--spine-active-ink)] font-[var(--font-weight-medium)] hover:bg-[var(--spine-active-hover)]"
      // `--ink-secondary`, not `--spine-ink-quiet` — the same darker-chip
      // tier the kit-drawn rows get via the descendant-selector override on
      // `railContent`'s own root, below. Home is a "chip" too (Standalone
      // Nav Item's whole point is to draw the same row Rail draws), so it
      // reads the token directly here instead of needing a selector of its own.
      : "text-[var(--ink-secondary)] hover:text-[var(--spine-ink)]",
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
}: {
  collapsed: boolean
  homeLabel: string
}) {
  // THE MARK IS THE WAY HOME (client, 31 Aug 2026): "remove home from navbar,
  // make that when we click the icon kwapso on top of sidebar it takes us
  // there" — Welcome (the old "Home") has no rail row of its own any more
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
          <Isotype className="[--brand-step:var(--icon-24)]" on="paper" />
        ) : (
          <Logotype className="[--brand-step:var(--icon-24)]" on="paper" />
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
  // Settings (shared/web/spine-section.tsx) and persisted on the person's own
  // row exactly as `scale` is, so it follows them between devices. Unlike
  // scale this is an ordinary React prop rather than a document-level side
  // effect: `toSpine` falls back to "paper" for null/unrecognised so a person
  // who has never opened Settings keeps seeing exactly the rail they always
  // had (shared/spine.ts).
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
  type ShellLink = { slug: string; title: string; Icon: typeof Home; path: string; group: NavGroup | "none" }
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
        Icon: SECTION_ICONS[s.key] ?? Home,
        // Clean top-level URL (/stories, /tickets) — resolves the active team from
        // context, like Home. (The gateway serves the shell for any sub-path.)
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
  // only; Home is drawn outside the kit's own Rail entirely by
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
  // STICKY, ONE WINDOW TALL, INSIDE A PADDED COLUMN. The shell's rail column
  // pads itself (`p-[var(--rail-inset)]`) so the padding is spent once for
  // any rail content, `Rail` included. A sticky child sized to the padded
  // box would be shorter than the viewport by twice the inset, so this node
  // cancels the column's padding with an equal negative margin and re-spends
  // it on itself. The nav region scrolls INSIDE its own wrapper (`min-h-0
  // flex-1 overflow-y-auto`), not the whole column, so a long list of
  // sections can never push the standalone anchor or the account menu off
  // screen — Rail's own `min-h-full` needs a sized box to fill, and this
  // wrapper is it. Home sits OUTSIDE that scrolling wrapper (the same "the
  // anchor keeps its end of the rail" property the old Home-first/
  // Settings-last order had), so it never scrolls out of view.
  // TWO DESCENDANT-SELECTOR OVERRIDES LIVE ON THIS ROOT NODE, THE SAME
  // REASON AS THE RADIUS OVERRIDE BELOW (`shared/ui/` is vendored and
  // pinned; a hand-edit there fails web/test/vendored-kit.test.ts): reached
  // from OUTSIDE the kit, on an ancestor this file owns.
  //
  // (1) DARKER CHIP TEXT (client, 31 Aug 2026: "i want more visual
  // differentiation between what's a section and what's a chip. maybe chips
  // texts darker? keep section text as they are"). A "chip" is a nav ROW
  // (Tasks, Meetings, …) as opposed to a SECTION HEADER (My work / Build /
  // …) — both currently read `--spine-ink-quiet` at rest (`ROW_IDLE` and the
  // group heading's own idle class in rail.tsx), which is exactly why they
  // looked like one tone with two sizes rather than two tiers. The section
  // heading is untouched — the client said keep it — so the fix is scoped to
  // `[data-slot=rail-item]` only, never `[data-slot=rail-group-heading]`.
  // `--ink-secondary` (tokens.css) is the real, already-named tier between
  // `--spine-ink-quiet` (muted-foreground) and full `--spine-ink`
  // (foreground) — "the charcoal-on-paper tier", used elsewhere for exactly
  // this kind of readable-but-secondary ink — so this reaches for an
  // existing token rather than inventing a colour (R32). `:not(:hover)`
  // keeps the kit's own `hover:text-[var(--spine-ink)]` rule untouched: the
  // override never matches while hovering, so there is no specificity race
  // with the hover rule, only with the resting one (which the extra
  // attribute selectors win outright).
  //
  // (2) THE SECTION CHEVRON, RE-ALIGNED (client, 31 Aug 2026: "on sections,
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
  // (3) A HAIRLINE BETWEEN NAMED SECTIONS (client, 31 Aug 2026: wants the
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
    "[&_[data-slot=rail-item]:not([data-active]):not(:hover)]:text-[var(--ink-secondary)]",
    "[&_[data-slot=rail-group-heading]>span]:order-last",
    "[&_[data-slot=rail-group-heading]>svg]:order-first",
    "[&_[data-slot=rail-group]:not(:first-child)]:pt-[var(--space-5)]",
    "[&_[data-slot=rail-group]:not(:first-child)]:shadow-[var(--hairline-over)]",
  ].join(" ")
  const railContent = (
    <div
      data-rail-collapsed={collapsed ? "" : undefined}
      className={`sticky top-0 flex h-[100svh] flex-col overflow-y-auto overflow-x-clip -m-[var(--rail-inset)] p-[var(--rail-inset)] ${RAIL_CONTENT_OVERRIDES} ${collapsed ? "items-center" : ""}`}
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
        <NavBrandHeader collapsed={collapsed} homeLabel={t("Go to Welcome")} />
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
          entries (Home, `homeStandalone.map` above) render BEFORE this div,
          entirely outside it. Every prior pass fixed `<Rail>`'s own rows —
          first this override, then the kit itself — and Home's separate,
          hand-copied skin (this file's own `StandaloneNavItem`, which has
          to duplicate the kit's row shape at all only because rail.tsx never
          exports `ROW_EXPANDED`/`ROW_COLLAPSED` — see that function's own
          header) kept its stale `rounded-none` untouched through both,
          because nobody traced that Home takes neither code path. Fixed
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
          overflow-x-visible`). Every `<Rail>` row bleeds full-width through
          its own `-mx-[var(--rail-inset)]` (the same full-bleed trick
          `railContent` cancels for itself two levels up with a matching
          negative margin + padding).

          `-mx-[var(--rail-inset)] px-[var(--rail-inset)]` BELOW RE-SPEND THAT
          INSET HERE TOO — found 2 Sep 2026 chasing a client report of a
          SQUARE active row under a grouped section ("Apps" under "Build"),
          reproducible after a hard cache clear (not caching), row shape
          confirmed fine both in source and in the deployed bundle
          (`ROW_EXPANDED`, rail.tsx, genuinely `rounded-pill`). The earlier
          cut of this comment stopped at "name `overflow-x` explicitly",
          reasoning only about the SCROLL bug — but `overflow-x-clip` clips
          anything past this box's own padding edge, and this div had no
          padding: the inset was spent two levels up, on `railContent`, not
          next to `<Rail>` itself. So the row bled its inset (24px,
          comfortable) past ITS immediate container to reach the true column
          edge — exactly where `rounded-pill`'s curve lives on a 40px pill
          (20px radius, inside that 24px band) — and this div's clip boundary
          sat 24px short of that, at the row's PRE-bleed edge: the curve was
          cut away whole, which is why the corner read flat rather than
          "less round". Confirmed by reproducing this class chain in
          isolation and measuring both boxes (clip box narrower than the row
          box by exactly `--rail-inset` per side before this fix, identical
          after). `StandaloneNavItem` (Home) never hit this — it renders
          directly inside `railContent`, whose own padding already sits where
          its bleed expects it. Re-spending the inset here matches that same
          cancel-and-respend, one level closer in, so `overflow-x-clip` still
          does only the job it was added for: no sideways scroll, and nothing
          left to clip. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip -mx-[var(--rail-inset)] px-[var(--rail-inset)]">
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

  // THE CONDENSE TOGGLE, ON THE SEAM ITSELF (client feedback, 31 Aug 2026:
  // "place the condense button at the bottom next to the user, but not
  // 'inside' the navbar but on the 'line' that separates the navbar from the
  // content... should be half in half out"). It used to sit beside the
  // brand mark (see the note on `NavBrandHeader`, above) — this is where it
  // moved to, a floating edge-handle straddling the rail column's own right
  // border, at the member card's height.
  //
  // WHY THIS IS A SIBLING OF `railContent`, NOT A CHILD OF IT. `railContent`
  // clips its own horizontal overflow (`overflow-x-clip`, for the sticky +
  // negative-margin trick that lets it re-spend the column's padding on
  // itself) — anything nested inside it that tries to spill half its width
  // outside would be cut at that boundary, whatever position/transform it
  // used to get there. So this node rides alongside `railContent` instead,
  // both handed to `ScreenShell` as its `rail` prop below, both direct
  // children of the column `ScreenShell` renders around them.
  //
  // "SOMETIMES THERE, SOMETIMES NOT" (client, 1 Sep 2026) — THE REAL BUG,
  // FOUND BY MEASURING, NOT BY RE-CHECKING THE FOUR STATIC STATES. Every
  // earlier pass checked theme × collapsed on one short screen and the
  // button was always exactly where it should be, because on a short
  // screen `data-slot="screen-shell-rail"` (the vendored, pinned column
  // `ScreenShell` renders `railContent` and this node into) happens to be
  // exactly one viewport tall anyway. This node used to be `absolute
  // inset-0`, which fills its CONTAINING BLOCK — that rail column — and the
  // column's own height is not the viewport, it is the tallest of every
  // flex sibling in `SCREEN`'s row (`screen-shell.tsx`, vendored), the BODY
  // pane among them. `railContent` only ever LOOKS viewport-tall because it
  // is separately `sticky top-0 h-[100svh]`; the column it sits inside
  // keeps growing with whatever the page's own body needs. So on any route
  // whose content runs past one screen — most of them — the column was
  // taller than the viewport, `inset-0` filled that real height, and
  // `justify-end` put the button at the bottom of the COLUMN, not the
  // bottom of the visible rail: hundreds or thousands of pixels below the
  // fold, on a route the four-state check never opened. Measured live: a
  // 4000px-tall body left this button sitting at `y≈4124` on a 720px-tall
  // viewport scrolled to the top. That is the whole "sometimes" — it never
  // depended on theme or on collapsed, it depended on whether THIS PAGE'S
  // OWN CONTENT happened to be taller than one screen, which changes by
  // route and was never one of the four states checked.
  //
  // THE FIX RIDES THE SAME WINDOW `railContent` ALREADY OWNS, instead of
  // trusting the column's real height again. This wrapper is now `sticky
  // top-0 h-[100svh]` too — pinned to the same viewport-relative window as
  // `railContent`, so `justify-end` inside it always lands on the bottom of
  // the space the rail is actually SHOWING, on any route, at any scroll
  // position, from the first frame, before any data has loaded. `-mt-
  // [100svh]` cancels its own height back out of the column's flow (a
  // negative top margin exactly the size of the box collapses its margin
  // box to zero, the standard "sticky overlay that costs no layout space"
  // trick) — without it this box would ADD another full viewport of empty
  // height below `railContent`'s own, inflating the column, and so the
  // whole page, by 100svh on every route, short ones included.
  //
  // `position: relative` on the column is no longer needed for this —
  // `sticky`, unlike `absolute`, anchors to the nearest scrolling ancestor
  // and needs no positioned ancestor of its own — so that override is
  // dropped from `ScreenShell`'s `className` below along with the reason
  // for it.
  //
  // THE HALF-IN-HALF-OUT ITSELF is `right-0` (the column's true right edge)
  // plus `translate-x-1/2` (shifts the control outward by exactly half of
  // its own width) — the standard edge-badge technique, and the reason it
  // reads as "on the line" rather than "inside the rail": half the control's
  // box is left of that x, half is right of it.
  //
  // BUT `right-0` ONLY REACHES THE COLUMN'S TRUE EDGE IF THIS WRAPPER
  // ACTUALLY FILLS THE COLUMN'S WHOLE WIDTH, and by default it does not:
  // `screen-shell-rail` (the vendored column div, `RAIL_COLUMN` above) is a
  // flex container padded on every side by `--rail-inset`, and a flex child
  // with no width of its own stretches only to that container's CONTENT box
  // — inset from the column's real, painted edge by `--rail-inset` on every
  // side, same as any other padded box. Regression, found by measuring: this
  // wrapper carried no correction for that, so `right-0` landed a whole
  // `--rail-inset` short of the seam, and the straddle read as "inside the
  // rail" instead of "on the line". `-me-[var(--rail-inset)]` cancels that
  // one edge (inline-end only — nothing here depends on the left/start edge,
  // so there is no need for `railContent`'s full `-m`/`p` cancel-and-respend
  // round trip below), which is what actually earns "fills the column's
  // whole width with no horizontal inset of its own".
  //
  // THE VERTICAL ANCHOR is a spacer exactly `--avatar-md` tall (the member
  // chip's own avatar size), pinned to the column's bottom padding
  // (`--rail-inset` — the same inset `railContent` cancels and re-spends on
  // itself, so this wrapper's bottom padding lands the spacer's bottom edge
  // exactly where the member row's own bottom edge sits).
  //
  // OFF-CENTRE BY EXACTLY `--space-1`, EXPANDED ONLY (client, 31 Aug 2026:
  // "align with user card! its off center a bit."). The COLLAPSED card carries
  // no padding of its own (`flex-col gap-[var(--space-2)]`, above) — its
  // avatar's bottom edge sits flush with the row's own bottom, which is
  // exactly what `pb-[var(--rail-inset)]` alone already matched. The EXPANDED
  // card is a pill with `p-[var(--space-1)]` all round (the block building
  // `railContent`'s last child, above), so its avatar's own bottom edge — and
  // so its vertical centre — sits one `--space-1` ABOVE the row's bottom
  // edge, not flush with it. The toggle button was centred on the row's edge
  // in both states, which is why it read as centred on the avatar only when
  // collapsed. Reading the same padding back in rather than guessing a pixel:
  // `calc(var(--rail-inset) + var(--space-1))` only when expanded.
  const railEdgeToggle = (
    <div className="pointer-events-none sticky top-0 h-[100svh] -mt-[100svh] -me-[var(--rail-inset)]">
      <div
        className={`flex h-full flex-col justify-end ${
          collapsed ? "pb-[var(--rail-inset)]" : "pb-[calc(var(--rail-inset)+var(--space-1))]"
        }`}
      >
        <div className="relative h-[var(--avatar-md)] shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* PINNED TO THE RAIL'S OWN FILL, NOT THE KIT'S "SECONDARY" TOKEN
              (client feedback, 31 Aug 2026: "on light, the condense/expand
              button is not always visible. make it always the same color as
              the navbar"). `variant="secondary"` reads `--btn-secondary-fill`,
              which `screen-shell.tsx`'s vendored `RAIL_COLUMN` rebinds to
              `--spine-chip-fill` (the member-chip pill's tone, one rung off
              the rail) rather than to the rail's own `--spine-fill` — a
              choice that is right for a chip sitting ON the rail and wrong
              for a handle straddling the rail's OWN edge. In light mode that
              chip tone is `--kw-off-beige` (#FFFEF9), a hair off the rail's
              `--kw-soft-paper` (#F7F2EB) and an EXACT match for the content
              column's own `--background` (also `--kw-off-beige`) — so the
              half of the button sitting over the content pane vanished into
              it outright, and the half over the rail read as barely-there.
              Dark mode was never reported broken because its equivalent pair
              (`--kw-unlit-raised` #26241F rail vs `--kw-unlit-quiet` #2F2D28
              chip) happens to sit far enough apart to read as two tones.
              Reaching for `--spine-fill` directly — the same token the rail
              column itself paints with, one line up in `RAIL_COLUMN` — makes
              the two literally the same value in every spine/theme
              combination, not just the ones measured today; `enabled:hover:`
              is restated at the same fill so hover cannot re-introduce a
              second tone (the kit's own secondary hover is a literal, not a
              spine token, and the client's ask was "always", not "at rest"). */}
              <Button
                type="button"
                variant="secondary"
                className="pointer-events-auto absolute top-0 right-0 size-[var(--avatar-md)] translate-x-1/2 rounded-pill p-0 shadow-md bg-[var(--spine-fill)] enabled:hover:bg-[var(--spine-fill)]"
                aria-label={collapsed ? t("Expand") : t("Collapse")}
                aria-expanded={!collapsed}
                onClick={() => persistCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? t("Expand") : t("Collapse")}</TooltipContent>
          </Tooltip>
        </div>
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
    <div className="flex min-h-[100svh] flex-col [--shell-top:3.75rem] md:[--shell-top:0px]">
      {/* Mobile top bar, an explicit height, because `--shell-top` above is a
          promise about it. ScreenShell has no mobile-chrome concept of its
          own (the rail simply disappears below `md`, by the kit's own
          design law, no hamburger anywhere) — this stays exactly as bespoke
          as it always was, rendered OUTSIDE the shell rather than inside its
          header band, because it is a full-bleed, bg-card, bordered surface
          and the header band's whole law is that it paints no fill of its
          own. */}
      <header className="bg-card sticky top-0 z-20 flex h-[3.75rem] min-w-0 items-center justify-between gap-2 overflow-hidden shadow-[var(--hairline-under)] px-4 md:hidden">
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
              Settings, under the text size, and in the profile menu. */}
          <ProfileMenu active={active} />
        </div>
      </header>

      {/* THE SHELL. `spine={spine}` — the person's own Settings · Sidebar
       * choice (shared/spine.ts, defaulting to "paper" for anyone who has
       * never picked one, which is what this file hardcoded before the
       * setting existed). `[data-spine="…"]` shares its block with bare
       * `:root` in tokens.css only on paper, which is what let this file read
       * `--spine-fill` etc. directly for as long as it drew its own `<aside>`;
       * on ink or mango those tokens genuinely repaint, which is the whole
       * point. `ScreenShell`'s own default is `spine="mango"` (a later client
       * ruling this app's SHELL has not adopted as a default — the person can
       * still choose it), so it has to be named here rather than left to the
       * shell's default. `rail={null}` below `md`, via the shell's own
       * breakpoint law, is what already made this adoptable at all — see
       * COMPOSITION-MISMATCHES.md, the ScreenShell-family entry. */}
      <ScreenShell
        /* `flex flex-col` + the `screen-shell-card` descendant rule —
           THE FOOTER-TO-THE-BOTTOM CHAIN'S MISSING LINK, found by measuring
           the real compiled CSS rather than trusting the theory: `ScreenShell`
           (the kit's `screen-shell.tsx`, vendored, R39) makes its own PAGE
           level (`data-slot="screen-shell"`, the div this `className` lands
           on) a plain block with `min-h-full`, and its child, the SCREEN
           level (`data-slot="screen-shell-card"`), ALSO a plain block reading
           `min-h-full` off IT. Two percentages in a row look harmless; they
           are not the same shape. This PAGE div's own height already comes
           from `flex-1` above (a real, resolved height — confirmed by
           measuring it directly), but a flex item's MAIN-AXIS flex-grow size
           only counts as a "specified" height for ITS OWN children's
           percentages when the flex CONTAINER it grew inside (this app's
           root, `min-h-[100svh]` — a floor, never a `height`) itself had one,
           which a `min-height` floor never supplies. So the SCREEN level's
           own `min-h-full` silently resolved to nothing: measured on a real
           page, `[data-slot=screen-shell-card]` stayed 464px tall on a
           2000px-tall viewport — its own CONTENT's height, not the page's.
           Everything measured BELOW that level (the rail, the body pane, and
           every one of this file's own `flex-1` links further down) was
           packed into that same too-short 464px box the whole time; the rail
           reading "full height" in review only ever meant "as tall as
           whatever this page's own content happened to be", which is the
           exact bug this whole change exists to fix, one level up.
           `flex flex-col` turns the PAGE div into a flex COLUMN for its own
           sake — SCREEN is its only real child — so the rule below can give
           SCREEN a real `flex-1` (main-axis growth, not a percentage) instead
           of leaning on the one that does not resolve. From there down
           nothing else moves: `content-column`, one level inside SCREEN, is
           stretched onto SCREEN's OWN rendered cross size by SCREEN's row
           layout — a flex item's CROSS-axis stretch is unconditionally real,
           the one part of this whole chain that never depended on a
           container having a "specified" height — which is the exact
           mechanic that was already correctly carrying `screen-shell.tsx`'s
           `min-h-full` from `content-column` down to `BODY` down to this
           file's own div at `AppShell`'s content wrapper, measured working
           before this line changed anything. */
        className="min-h-0 flex-1 flex flex-col [&_[data-slot=screen-shell-card]]:flex-1 [&_[data-slot=screen-shell-card]]:min-h-0"
        spine={spine}
        rail={
          <>
            {railContent}
            {railEdgeToggle}
          </>
        }
        railLabel={t("Sections")}
        header={
          /* Breadcrumbs — URL-derived, collapsing on small screens (library
           * primitive). The host owns the router, so links route through
           * onNavigate. The running timer sits on the same row on desktop
           * (the mobile bar has its own copy above): one line present on
           * every screen, showing nothing when nobody is timing anything. */
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {breadcrumbs && breadcrumbs.length > 0 && (
                /* The kit's Breadcrumbs renders real <a href> links; the shell
                   intercepts the click so navigation stays soft (client-side)
                   the way the old component's onNavigate did. */
                <div
                  onClickCapture={(e) => {
                    const a = (e.target as HTMLElement).closest("a")
                    if (!a) return
                    const href = a.getAttribute("href")
                    if (!href || !href.startsWith("/")) return
                    e.preventDefault()
                    ;(onNavigate ?? softNavigate)(href)
                  }}
                >
                  <Breadcrumbs items={breadcrumbs} />
                </div>
              )}
            </div>
            <div className="hidden shrink-0 md:flex">
              {teamId && <TimerBar teamId={teamId} onNavigate={onNavigate ?? softNavigate} />}
            </div>
          </div>
        }
      >
        {/* `overflow-x-clip`, NOT `overflow-x-hidden`. They look identical and
            they are not: CSS says an element with `overflow-x: hidden` and a
            visible other axis computes `overflow-y` to `auto`, which makes this
            a SCROLL CONTAINER. A `position: sticky` child then sticks to a box
            that never scrolls, so it silently does nothing, which is exactly
            what happened to the record header and tab strip (D3) the first time
            they were built. `clip` clips the same overflow and creates no scroll
            container, so the document stays the scroller and sticky works.
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
         * real target, not a bigger guess. The breadcrumb ROW above (this
         * same `header` prop) sets no width of its own — `ScreenShell`'s
         * header band is `min-w-0` and nothing else (kit
         * compositions/templates/screen-shell.tsx), so it already runs to the
         * full padded edge of the body column, same padding as this content
         * div's own parent (`DENSITY_HEADER`/`DENSITY_BODY` converge at `lg`).
         * `max-w-none` is what makes this div's right edge land on that same
         * edge — no guessed number, fluid or fixed, does that on every rail
         * state (expanded/collapsed) and every viewport the way matching the
         * header's own lack of a cap does. `mx-auto`/`w-full` stay on the line
         * for R29's own positional signature (`one-page-width`,
         * web/test/rules.test.ts) even though centring has nothing left to
         * do once there is no cap to centre inside of. `PAGE_WIDTH_OWNER` in
         * shared/rules/registry.ts carries the same string — R29 checks it
         * verbatim.
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
         * The document stays the ONE scroller throughout (this file's own
         * `overflow-x-clip` note above); nothing here creates a nested
         * scroll box, so a long record's footer still scrolls away
         * ordinarily, past the end of its own content. */}
        <div className="mx-auto flex w-full max-w-none min-w-0 min-h-full flex-col overflow-x-clip pb-24 md:pb-0">{children}</div>
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
            <MoreHorizontal className="size-5 shrink-0" />
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
