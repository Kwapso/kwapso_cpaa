"use client"

// Loads the signed-in person + their active-team context, and exposes the
// actions the app shell needs (switch team, create team, refresh). The session
// is cached at MODULE level, so the FIRST screen loads it (with a skeleton) and
// every screen after paints instantly and just revalidates in the background —
// no more spinner on every navigation.

import * as React from "react"
import { useRouter } from "next/navigation"

import type { ActiveContext, SessionUser } from "@shared/types"

// From the shared module, NOT from "@/lib/api" which re-exports it: the hook's
// own test suite mocks "@/lib/api" with a factory that returns only { auth,
// tenancy }, so an ApiFailure imported from there is `undefined` under test and
// `e instanceof undefined` throws — turning the branch below into the very
// bounce it exists to prevent, in exactly the tests meant to prove it doesn't.
import { ApiFailure } from "@shared/web/api"
import { clearCache } from "@shared/web/store"

import { auth, tenancy } from "@/lib/api"

export type ActiveTeam = {
  loading: boolean
  user: SessionUser | null
  ctx: ActiveContext | null
  switchTeam: (teamId: string) => Promise<void>
  createTeam: (name: string) => Promise<void>
  refresh: () => Promise<void>
}

type Session = { user: SessionUser; ctx: ActiveContext }
// Survives navigations (cleared on sign-out / auth failure). REACTIVE: every write goes
// through setSessionCache, which notifies all mounted useActiveTeam instances. This is
// what lets a component mounted BEFORE login (the root AgentHost) pick up the session the
// moment another instance logs in / creates a team — without it, its icon only appeared
// after a manual reload (the launcher-needs-reload bug).
let sessionCache: Session | null = null
const sessionSubs = new Set<() => void>()
function setSessionCache(next: Session | null): void {
  // SIGNING OUT FORGETS THE DATA, not just the session. `null` here is the
  // sign-out / auth-failure path, and the row cache is keyed by resource + team —
  // so without this the tab kept every list the previous person had opened, and a
  // signed-out page could paint a member list out of memory. Cheap, and the only
  // moment we know for certain that nothing in the cache is ours to show.
  if (next === null) clearCache()
  sessionCache = next
  for (const fn of sessionSubs) fn()
}

export function useActiveTeam(): ActiveTeam {
  const router = useRouter()
  const [user, setUser] = React.useState<SessionUser | null>(sessionCache?.user ?? null)
  const [ctx, setCtx] = React.useState<ActiveContext | null>(sessionCache?.ctx ?? null)
  const [loading, setLoading] = React.useState(!sessionCache)

  // Re-sync from the shared cache whenever ANY instance changes it (login, create/switch
  // team, refresh, sign-out) — so this instance updates even if the change happened
  // elsewhere. State setters no-op when unchanged, so this can't loop.
  React.useEffect(() => {
    const onChange = () => {
      setUser(sessionCache?.user ?? null)
      setCtx(sessionCache?.ctx ?? null)
      // Mirror the INITIAL rule (`useState(!sessionCache)`): no session = still
      // loading. When the cache is CLEARED — removed from your last team, signed
      // out elsewhere — the shell has no person and no team, and the bounce that
      // follows is a client navigation that takes a moment. Leaving `loading`
      // false paints a hollow shell through that window: a nav with nothing in
      // it and a profile button with no identity behind it, which is exactly
      // what "the profile button seems broken" looked like. A skeleton is the
      // honest frame to show while we work out where this person belongs.
      setLoading(!sessionCache)
    }
    sessionSubs.add(onChange)
    return () => {
      sessionSubs.delete(onChange)
    }
  }, [])

  // A teamless context (e.g. just removed from your last team) means there's no
  // app screen to show — bounce to onboarding and DON'T cache the empty ctx, so
  // returning here re-checks once a team exists. Shared by load() + refresh().
  const sendToOnboardingIfTeamless = React.useCallback(
    (ctx: ActiveContext): boolean => {
      if (ctx.teams.length === 0) {
        setSessionCache(null)
        router.replace("/onboarding")
        return true
      }
      return false
    },
    [router]
  )

  React.useEffect(() => {
    let alive = true
    async function load() {
      try {
        const me = await auth.me()
        if (!me.user.onboardingComplete) {
          router.replace("/onboarding")
          return
        }
        const ctx = await tenancy.active()
        if (sendToOnboardingIfTeamless(ctx)) return
        const next: Session = { user: me.user, ctx }
        setSessionCache(next)
        if (!alive) return
        setUser(next.user)
        setCtx(next.ctx)
        setLoading(false)
      } catch (e) {
        // AN OUTAGE IS NOT A SIGN-OUT, and this bare catch used to treat them as
        // the same thing. 401 means this person really is signed out. Anything
        // else — a 500 or 503 from the API, a dropped network — means the app is
        // unwell while the person is perfectly signed in, and clearing the
        // session sends them to a door that CANNOT help: the auth worker reaches
        // the core database through its own native binding, so it stays healthy,
        // and they sign in successfully, land back here, hit the same failure,
        // and bounce again. A closed loop that reads as "my account is broken".
        //
        // Earned 2026-08-14: a rotated Cloudflare token made /api/tenancy/active
        // return 500, and three people were locked out of a working app — one of
        // them mid-form, which is why it looked like submitting the form had done
        // it. Nothing was wrong with any of their accounts.
        if (e instanceof ApiFailure && e.status === 401) {
          setSessionCache(null)
          router.replace("/login")
          return
        }
        if (!alive) return
        // KEEP THE CACHE. CACHING.md is cache-first, so a screen that already
        // painted keeps working and only writes fail — which is the honest state
        // of the world during a data-door outage. Dropping it here is what turned
        // "briefly unwell" into "destroyed". With nothing cached there is nothing
        // truthful to paint, so stay in the skeleton rather than show a hollow
        // shell — the same reasoning the subscription effect above spells out.
        if (sessionCache) setLoading(false)
      }
    }
    // Cached → show instantly + revalidate quietly; else load (skeleton shows).
    if (sessionCache) {
      setUser(sessionCache.user)
      setCtx(sessionCache.ctx)
      setLoading(false)
    }
    void load()
    return () => {
      alive = false
    }
  }, [router, sendToOnboardingIfTeamless])

  const switchTeam = React.useCallback(async (teamId: string) => {
    const nextCtx = await tenancy.switchTeam(teamId)
    // A TEAM SWITCH IS A DIFFERENT WORLD. Cache keys carry the team id, so the old
    // team's rows were never going to be MIS-shown — but they were kept, for as
    // long as the tab lived, and somebody who works across five teams in a morning
    // was carrying all five. Dropped on the switch, which is the moment they stop
    // being anything anyone is looking at.
    clearCache()
    if (sessionCache) setSessionCache({ ...sessionCache, ctx: nextCtx })
    setCtx(nextCtx)
  }, [])

  const createTeam = React.useCallback(async (name: string) => {
    const nextCtx = await tenancy.createTeam(name)
    if (sessionCache) setSessionCache({ ...sessionCache, ctx: nextCtx })
    setCtx(nextCtx)
  }, [])

  const refresh = React.useCallback(async () => {
    // BEST-EFFORT, AND IT MAY NOT REJECT. Every caller is a live ping in
    // app-shell.tsx writing `void active.refresh()` — a background top-up of the
    // identity and the context after somebody else changed something, not an
    // action a person is waiting on. A rejection from a `void`ed promise has
    // nowhere to go but `unhandledrejection`, and the global reporter beacons
    // that into the central store: so a SERVER outage that had already recorded
    // itself got written down a second time as a browser crash. Twice on
    // staging — 2026-08-16 14:51 on /settings and 2026-08-17 15:44 on
    // /accounts — each of them minutes into a failure the worker had already
    // logged, and neither row said anything the first one hadn't.
    //
    // Logging-only, which ERROR-HANDLING.md rule 1 allows by name for a
    // best-effort side-effect: loud in the console, silent in the store. What
    // is lost is a refresh, and the next ping does it again. What must NOT
    // happen here is answering a 401 — that is the LOAD path's decision, made
    // once with the cache in front of it, and a transient failure is not
    // allowed to become a sign-out (use-active-team-outage.test.tsx).
    try {
      // reload both identity (profile edits) and context (member counts, etc.)
      const [me, nextCtx] = await Promise.all([auth.me(), tenancy.active()])
      if (sendToOnboardingIfTeamless(nextCtx)) return
      setSessionCache({ user: me.user, ctx: nextCtx })
      setUser(me.user)
      setCtx(nextCtx)
    } catch (e) {
      console.error("active-team refresh failed:", e)
    }
  }, [sendToOnboardingIfTeamless])

  return { loading, user, ctx, switchTeam, createTeam, refresh }
}
