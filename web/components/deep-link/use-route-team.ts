"use client"

// Which team the screen runs against, and whether you may be here. A /t/<id> URL
// names its team explicitly; a top-level page (/learning, /help) runs against the
// ACTIVE team, like /home does. A deep link to another of your teams switches to
// it; a link to a team you've left hands you back to the active team's home.

import * as React from "react"
import { type useRouter } from "next/navigation"

import { type useActiveTeam } from "@/lib/use-active-team"

export type RouteTeam = {
  /** The effective team for data: the URL's when it names one, else the active one. */
  teamId: string | null
  /** True once the ACTIVE team IS the team on screen — reads only fire then. */
  onTeam: boolean
  /** onTeam and we know which team: the go-ahead for every per-module read. */
  enabled: boolean
  isMemberOfUrlTeam: boolean
  teamCount: number
  /** The switch was refused — e.g. a member whose team is still provisioning. */
  noAccess: boolean
}

export function useRouteTeam({
  active,
  urlTeamId,
  router,
}: {
  active: ReturnType<typeof useActiveTeam>
  /** set only when the URL NAMES a team — it drives the switch + the membership guard */
  urlTeamId: string | null
  router: ReturnType<typeof useRouter>
}): RouteTeam {
  const [noAccess, setNoAccess] = React.useState(false)
  const activeTeamId = active.ctx?.team?.id ?? null
  const teamId = urlTeamId ?? activeTeamId
  const teamCount = active.ctx?.teams.length ?? 0
  const isMemberOfUrlTeam = urlTeamId
    ? (active.ctx?.teams.some((t) => t.id === urlTeamId) ?? false)
    : true
  const switchTeam = active.switchTeam

  // Tracks the URL-team we've SYNCED the active team to. Lets us tell a DEEP-LINK
  // (never synced to this URL's team yet → adopt it) from an external TEAM SWITCH (we
  // WERE synced here, then the switcher moved the active team away → follow it to
  // /home instead of snapping back). Keying off "were we synced" (not "did the URL
  // change") makes it race- and StrictMode-safe: a mid-adopt re-render re-adopts
  // rather than wrongly bouncing to /home.
  const syncedTeam = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (active.loading || !urlTeamId) return
    if (!isMemberOfUrlTeam) {
      // Removed from this team. Go to the active team's home if one remains;
      // if teamless, use-active-team has already routed us to onboarding.
      if (teamCount > 0) router.replace("/home")
      return
    }
    setNoAccess(false)
    if (activeTeamId === urlTeamId) {
      syncedTeam.current = urlTeamId // we're on this team now — remember it
      return
    }
    if (activeTeamId) {
      if (syncedTeam.current === urlTeamId) {
        // We were on this URL's team, then switched away elsewhere → follow the switch.
        router.replace("/home")
      } else {
        // Deep link to another of your teams → switch to it (server re-validates).
        // A member whose team is still provisioning fails here = the no-access case.
        switchTeam(urlTeamId).catch(() => setNoAccess(true))
      }
    }
  }, [urlTeamId, activeTeamId, isMemberOfUrlTeam, teamCount, active.loading, switchTeam, router])

  const onTeam = !!teamId && active.ctx?.team?.id === teamId
  return {
    teamId,
    onTeam,
    enabled: Boolean(teamId && onTeam),
    isMemberOfUrlTeam,
    teamCount,
    noAccess,
  }
}
