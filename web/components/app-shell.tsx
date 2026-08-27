"use client"

// AppShell — the persistent frame every in-app screen sits inside. Desktop: a
// left sidebar (team switcher, Home/Settings nav, profile). Mobile: a top bar
// (switcher + profile) and a bottom tab bar. A breadcrumb strip (per page) shows
// where you are and lets you climb back. One live channel for the active team is
// opened here, refreshing caches when something changes. Composed from library
// primitives.

import * as React from "react"
import { usePathname } from "next/navigation"

import { Breadcrumbs } from "@shared/ui/components/breadcrumbs/breadcrumbs"
import { toast } from "@shared/ui/components/sonner/sonner"
import { AppWindow, BadgeCheck, Building2, CalendarClock, CalendarRange, Hammer, Home, LibraryBig, ListTodo, Palette, Route, Settings, LifeBuoy, PanelLeftClose, PanelLeftOpen, Timer, MoreHorizontal } from "@shared/ui/foundations/icons"
// `SeaWaves` is the audit module's mark and the kit's 96 have no glyph of that
// name yet, so it borrows the kit's own glyph for the concept (ATTRIBUTION).
import { SeaWaves } from "@shared/ui/foundations/icons"

import type { ActiveTeam } from "@/lib/use-active-team"
import { auth } from "@/lib/api"
import { softNavigate } from "@/lib/nav"
import { useRealtime, useUserRealtime } from "@shared/web/realtime"
// The row-level registry + coarse invalidations moved to lib (R15): they're DATA
// the live-collections check imports, and the thread/help_threads + agent_usage
// deaf-exemptions live beside them in the rules registry.
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES, liveCoveredKeys, totalKey } from "@/lib/live-resources"
import { invalidate, invalidatePrefix, patchRow, primeCache, readCache, reconcile, registerLiveCoverage } from "@shared/web/store"
import { NAV, TEAM_SECTIONS, bottomNavItems, overflowNavItems, isNavActive, type Crumb, type NavGroup } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useTeamPrewarm } from "@/lib/use-team-prewarm"
import { useGoogleCatchUp } from "@/lib/use-google-catch-up"
import { useT } from "@shared/web/language"
import { MarkLoader } from "@shared/web/mark-loader"
import { CreateTeamDialog } from "@/components/create-team-dialog"
import { TEAM_CREATION_CLOSED } from "@shared/product"
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

  // Desktop sidebar collapse (icon rail), remembered across sessions.
  const [collapsed, setCollapsed] = React.useState(false)
  // The phone's "everything else" sheet. Closed on every navigation, because a
  // menu that stays open over the screen it just opened is a menu you have to
  // dismiss twice.
  const [moreOpen, setMoreOpen] = React.useState(false)
  React.useEffect(() => {
    setCollapsed(localStorage.getItem("ss-sidebar-collapsed") === "1")
  }, [])
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("ss-sidebar-collapsed", next ? "1" : "0")
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

  // THE RAIL, IN TWO GROUPS WITH A DIVIDER (the owner's ruling — see NavGroup in
  // pages.ts for why neither "keep it under nine" nor "show everything flat"
  // was accepted). Every destination declares which half it belongs to, so this
  // partition is DERIVED: the shell never names a page, it just asks each one
  // where it goes. A section gated by a right the caller lacks vanishes from its
  // group, and a group that empties out draws no divider.
  type ShellLink = { slug: string; title: string; Icon: typeof Home; path: string; group: NavGroup }
  const universal: ShellLink[] = NAV.filter((i) => !i.need).map((i) => ({
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
        group: s.group ?? "occasional",
      }))
    : []
  // Home first, Settings last, everything else in registry order between them —
  // the two anchors keep their ends of the rail whatever is added in the middle.
  const inOrder = [...universal.filter((i) => i.slug === "home"), ...sidebarPages, ...universal.filter((i) => i.slug !== "home")]
  const navGroups: ShellLink[][] = (["daily", "occasional"] as const)
    .map((g) => inOrder.filter((i) => i.group === g))
    .filter((g) => g.length > 0)
  const navLinks = navGroups.flat()
  // THE PHONE'S BAR AND THE DOOR TO THE REST. Together these two are a
  // partition of navLinks: nothing reachable can fall between them (pages.ts).
  const bottomNav = bottomNavItems(navLinks)
  const overflowNav = overflowNavItems(navLinks)

  /** One rail row. Drawn identically in both groups, so the divider is the only
   * thing that separates them. */
  const navButton = (item: ShellLink) => {
    const Icon = item.Icon
    const activeNav = isNavActive(item.path, here)
    return (
      <button
        key={item.slug}
        type="button"
        onClick={() => navigate(item.path)}
        aria-current={activeNav ? "page" : undefined}
        title={collapsed ? item.title : undefined}
        className={`motion-hover flex items-center rounded-[var(--radius)] text-sm font-medium ${
          collapsed ? "justify-center p-2" : "gap-2 px-3 py-2"
        } ${
          activeNav
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        }`}
      >
        <Icon className="size-4" />
        {!collapsed && item.title}
      </button>
    )
  }

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
      if (r.slicePrefix) invalidatePrefix(r.slicePrefix)
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
        if (r.slicePrefix) invalidatePrefix(r.slicePrefix)
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

  return (
    // THE LANGUAGE WRAPS THE WHOLE SHELL, so the nav, the breadcrumbs, every
    // routed screen and every dialog opened from one all read the same `t`.
    // Here rather than in the root layout because the root layout is a server
    // component with no session: the preference arrives on `active.user`, which
    // this shell already has in hand before it paints.
    <LanguageProvider value={active.user?.language}>
    <div className="flex min-h-[100svh]">
      {/* Desktop sidebar (collapsible to an icon rail).
       *
       * PINNED TO THE WINDOW, NOT THE PAGE. The sidebar is a flex child of a
       * min-h-screen row, so without an explicit height it stretches to the
       * TALLEST column — the main one. On a long list that is thousands of
       * pixels, and `mt-auto` then parks the profile / theme / collapse row at
       * the bottom of the DOCUMENT instead of the bottom of the window. Home
       * looked fine only because it is short enough to fit. The tell was the
       * flash: the block rendered in view while the list was still empty, then
       * left the screen the instant the rows arrived. h-[100svh] + sticky keeps
       * the rail exactly one window tall whatever the main column does, and
       * overflow-y-auto lets the nav scroll inside itself as modules are added
       * rather than pushing the bottom row off again.
       *
       * AND `overflow-x-clip` BESIDE IT, for the reason spelled out over <main>
       * below: CSS says an element with one axis scrollable and the other
       * `visible` computes the visible one to `auto`, so `overflow-y` alone gave
       * the RAIL a horizontal scrollbar the moment any child was wider than
       * w-60 — which the kit's three-way mode toggle made the bottom row. Clip
       * removes the scrollbar; the wrap on that row removes the overflow that
       * caused it. */}
      <aside
        className={`hidden shrink-0 flex-col border-r md:sticky md:top-0 md:flex md:h-[100svh] md:overflow-y-auto md:overflow-x-clip ${collapsed ? "w-16 items-center" : "w-60"}`}
      >
        <div className={collapsed ? "py-3" : "p-3"}>
          <TeamSwitcher
            active={active}
            onCreateTeam={() => setCreating(true)}
            collapsed={collapsed}
          />
        </div>
        <nav className={`flex flex-col gap-1 ${collapsed ? "px-2" : "px-3"}`}>
          {navGroups.map((group, i) => (
            <React.Fragment key={group[0].slug}>
              {/* The divider between the daily half and the occasional one. It
                  sits BETWEEN groups, never above the first or below the last. */}
              {i > 0 && <div className="bg-border my-2 h-px w-full" role="separator" />}
              {group.map(navButton)}
            </React.Fragment>
          ))}
        </nav>
        <div
          className={`mt-auto flex min-w-0 flex-wrap items-center gap-2 p-3 ${collapsed ? "flex-col" : "justify-between"}`}
        >
          {/* The theme control moved INTO this menu — see profile-menu.tsx. It
              was the widest thing in a 240px rail and the reason the rail
              grew a horizontal scrollbar. */}
          <ProfileMenu active={active} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t("Expand sidebar") : t("Collapse sidebar")}
            title={collapsed ? t("Expand") : t("Collapse")}
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground motion-hover rounded-[var(--radius)] p-2"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
      </aside>

      {/* `--shell-top`. HOW FAR DOWN THE SHELL'S OWN CHROME REACHES, published
       * once here and read by anything inside `<main>` that wants to pin itself
       * (today: a record's collapsed title line and its tab strip — UI-RULEBOOK
       * D3). On a phone the app bar below is sticky at the top of the window, so
       * content pinned at 0 would slide UNDER it; on desktop that bar is not
       * rendered at all and the offset is zero. In `rem` so it moves with the
       * display-scale setting (S4) rather than being pinned to 16px.
       *
       * This is the shell half of L6: the frame owns z-20 and this variable, the
       * in-content sticky layer takes z-10 and reads it. */}
      <div className="flex min-h-[100svh] min-w-0 flex-1 flex-col [--shell-top:3.75rem] md:[--shell-top:0px]">
        {/* Mobile top bar, an explicit height, because `--shell-top` above is a
            promise about it. */}
        <header className="bg-card sticky top-0 z-20 flex h-[3.75rem] min-w-0 items-center justify-between gap-2 overflow-hidden border-b px-4 md:hidden">
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

        {/* Breadcrumbs — URL-derived, collapsing on small screens (library
         * primitive). The host owns the router, so links route through onNavigate.
         * The running timer sits on the same row on desktop (the mobile bar has
         * its own copy above): one line that is present on every screen and shows
         * nothing at all when nobody is timing anything. */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-6 lg:px-8">
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

        {/* THE PAGE GUTTERS (UI-RULEBOOK L1 / S2). One string, used here and by
            the record header band so both align to the same left edge. `lg:px-8`
            is 40px, the brand site's own `--margin--m`, and what `.nk-container`
            computes to at every desktop width.

            `overflow-x-clip`, NOT `overflow-x-hidden`. They look identical and
            they are not: CSS says an element with `overflow-x: hidden` and a
            visible other axis computes `overflow-y` to `auto`, which makes this
            a SCROLL CONTAINER. A `position: sticky` child then sticks to a box
            that never scrolls, so it silently does nothing, which is exactly
            what happened to the record header and tab strip (D3) the first time
            they were built. `clip` clips the same overflow and creates no scroll
            container, so the document stays the scroller and sticky works. */}
        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-6 pb-24 sm:px-6 md:pb-8 lg:px-8">
          {children}
        </main>

        {/* Mobile bottom tabs — five slots, gated items hidden, and when there
         * are more sections than slots the fifth becomes More. The rail beside
         * this is `hidden md:flex`, so this bar is the ONLY way through the app
         * on a phone or a tablet: anything it cannot reach cannot be reached. */}
        <nav className="bg-card fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t px-2 py-1.5 md:hidden">
          {bottomNav.map((item) => {
            const Icon = item.Icon
            const activeNav = isNavActive(item.path, here)
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => navigate(item.path)}
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
              {navGroups.map((group, i) => (
                <React.Fragment key={group[0].slug}>
                  {i > 0 && <div className="bg-border my-2 h-px w-full" role="separator" />}
                  {group.map((item) => {
                    const Icon = item.Icon
                    const activeNav = isNavActive(item.path, here)
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => {
                          setMoreOpen(false)
                          navigate(item.path)
                        }}
                        aria-current={activeNav ? "page" : undefined}
                        className={`motion-hover flex items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium ${
                          activeNav
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
      </div>

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
