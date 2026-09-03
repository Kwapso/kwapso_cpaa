"use client"

// WHO IS AT THE DOOR — the portal's one answer to "what should this person see
// right now", resolved once and shared by every screen.
//
// There are five honest answers and no sixth. Naming them as a type (rather than
// letting each screen improvise from a null check) is what keeps the portal from
// ever showing a half-screen: no spinner that never ends, no empty list that is
// really a permission error, no dead end.
//
//   loading    — we don't know yet.
//   signed-out — no session. Show the door.
//   needs-name — signed in, but we've never been told their name.
//   no-access  — signed in, and there is nothing here for them. This is the
//                honest face of "invite-only is absolute" (SCOPE ch.06):
//                signing in NEVER creates access, so a person who signs in
//                without a grant must be told plainly, not shown an empty app.
//   ready      — signed in, standing in one company, with a world to show.
//
// `no-access` is not a rare edge. It is the CURRENT state of every real client
// login: the fence is built, but the half that puts a granted person into the
// team (so the guard corridor can resolve them at all) is not — see the handover
// note. The portal therefore has to wear that state well rather than crash into
// it, and this is where that is decided.

import * as React from "react"

import type { SessionUser } from "@shared/types"
import { useCached } from "@shared/web/store"
import { ApiFailure, auth, portal, type PortalContext } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

export type PortalSession =
  | { state: "loading" }
  | { state: "signed-out" }
  /** Something on OUR side is wrong — a 500, a dropped connection. Deliberately
   * distinct from "signed-out": sending a client to the sign-in screen because a
   * worker had a bad minute tells them they did something, when we did. */
  | { state: "unavailable" }
  | { state: "needs-name"; user: SessionUser }
  | { state: "no-access"; user: SessionUser }
  | {
      state: "ready"
      user: SessionUser
      teamId: string
      /** every company this person may stand in — one, usually; two makes a switcher */
      accounts: { id: string; name: string }[]
      /** the one they are standing in */
      currentAccountId: string
    }

/** What `auth.me` + `active` + `portal/context` resolve to together. Kept as one
 * cached fetch so three screens don't ask three times, and so a sign-out
 * invalidates one key rather than racing three. */
type Resolved =
  | { kind: "signed-out" }
  | { kind: "needs-name"; user: SessionUser }
  | { kind: "no-access"; user: SessionUser }
  | { kind: "ready"; user: SessionUser; teamId: string; context: PortalContext }

/** A 401/403/409 is an ANSWER here, not a failure: "you are not signed in", "you
 * are not in this team", "you have no team". Anything else (a 500, a dropped
 * connection) is a real error and is allowed to propagate to the boundary. */
function isAccessAnswer(e: unknown): boolean {
  return e instanceof ApiFailure && [401, 403, 409].includes(e.status)
}

async function resolveSession(): Promise<Resolved> {
  // ONE wait, not two — the identity read and the standing read are
  // independent doors, and this is the first paint of every portal visit
  // (measured 1.4–1.7s serialised; the agency's boot got the same fix a round
  // earlier). The context read fires alongside and is simply not awaited on
  // the paths that never need it.
  const mePromise = auth.me()
  const contextPromise = portal.context()
  // A rejection that is only ever read on the ready path must not become an
  // unhandled rejection on the paths that return before reading it.
  contextPromise.catch(() => {})
  let user: SessionUser
  try {
    user = (await mePromise).user
  } catch (e) {
    if (isAccessAnswer(e)) return { kind: "signed-out" }
    throw e
  }
  if (!user.onboardingComplete) return { kind: "needs-name", user }

  // The team id comes from the session itself. The portal deliberately does not
  // ask `/api/tenancy/active` for it — see lib/api.ts.
  if (!user.currentTeamId) return { kind: "no-access", user }

  try {
    const context = await contextPromise
    // A person with no company to stand in has no portal, however valid their
    // login. Standing NOWHERE is the fence's fail-closed answer, and it must
    // read as "not yet", never as "empty".
    if (!context.currentAccountId || context.accounts.length === 0)
      return { kind: "no-access", user }
    return { kind: "ready", user, teamId: user.currentTeamId, context }
  } catch (e) {
    if (isAccessAnswer(e)) return { kind: "no-access", user }
    throw e
  }
}

/** The portal's session. Cache-first like every other read, so moving between
 * screens never re-asks the question the shell already answered. */
export function usePortalSession(): {
  session: PortalSession
  error: unknown
  refresh: () => void
} {
  const { data, error, refresh } = useCached<Resolved>(cacheKeys.session, resolveSession)

  const session = React.useMemo<PortalSession>(() => {
    // A REAL ERROR IS NOT A SIGN-OUT. `resolveSession` already turns a 401/403/409
    // into an ANSWER (signed-out / no-access) — so anything still throwing here is
    // a 500 or a dropped connection. Reading that as "signed out" sent a client to
    // the login screen mid-session and told them nothing, on a day when the only
    // thing wrong was ours.
    //
    // NOT reported here any more (was, until `useCached` reported for itself):
    // its own catch now calls `reportError` for exactly this failure, so a
    // second call here would double-log the same row. This branch is left
    // purely to read the state, same as every other one below it.
    if (!data && error) return { state: "unavailable" }
    if (!data) return { state: "loading" }
    if (data.kind === "signed-out") return { state: "signed-out" }
    if (data.kind === "needs-name") return { state: "needs-name", user: data.user }
    if (data.kind === "no-access") return { state: "no-access", user: data.user }
    return {
      state: "ready",
      user: data.user,
      teamId: data.teamId,
      accounts: data.context.accounts,
      currentAccountId: data.context.currentAccountId as string,
    }
  }, [data, error])

  return { session, error, refresh }
}
