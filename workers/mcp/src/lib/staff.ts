// THE MACHINE SURFACE IS FOR STAFF. A client login may not hold a token, and a
// token may not act for one.
//
// WHY THIS EXISTS. A client-portal contact IS an ordinary team member — grant →
// invite → accept is the only way to make a working portal login, so by
// construction they hold a role and a session. Everything they reach through
// their own front door is fenced twice: the portal gateway names a closed set of
// doors, and each of those doors resolves their account set. But a token is
// minted at the AGENCY origin, and this worker had no opinion about who was
// asking — `requireUser` was a bare "are you signed in?".
//
// So a client could sign in at the agency address, mint a personal access token,
// and call `list_learning` or `export_learning_csv` with their Client role's
// rights: every internal how-to article, in full, as a CSV. Nothing was
// bypassed. The gate ran and PASSED — `learning:read` is on the Client role
// because the portal's own doors need nothing from it, and the reason those
// articles are safe is that the client's gateway REFUSES that door outright
// ("the team's how-to articles are INTERNAL and carry no account fence").
//
// That is the whole shape of the finding: the fence is a DOOR-LEVEL idea, and
// the machine surface had no door-level opinion. It has one now, and it is the
// same sentence the portal gateway already makes — this surface is not theirs.
//
// WHERE THE ANSWER COMES FROM. `portal_users` lives in the per-TEAM database and
// this worker holds no CF_D1_TOKEN, so it cannot read the row and must not try.
// It asks the worker that owns the fence: tenancy resolves `accountScope()` on
// every account door already, and its portal-standing door now says `kind`
// out loud. One question, one existing door, no second implementation of who is
// a client — which is the rule this whole lane exists to keep.

import { forwardToDoor } from "../../../../shared/workers/http"
import { GuardError } from "../../../../shared/workers/gating"
import type { Env } from "../env"

/** Refuse the machine surface to a client login. `cookie` is a session for the
 * caller in the team being asked about — their own when they are minting a
 * token, the bridged team-pinned one when a token is being used.
 *
 * FAILS CLOSED, in both directions. Anything other than a clean "staff" is a
 * refusal: a caller who reads as `portal` (live grant OR revoked — portal-ness
 * is decided by the PRESENCE of the row, never its absence), and equally a
 * tenancy that could not answer. A door that assumed "staff" whenever the check
 * itself broke would hand the surface back to exactly the caller it excludes,
 * on exactly the day something is wrong. */
export async function requireStaff(env: Env, cookie: string): Promise<void> {
  const res = await forwardToDoor(env.TENANCY, {
    path: "/api/tenancy/portal/context",
    method: "GET",
    cookie,
  })
  if (!res.ok)
    throw new GuardError(502, "standing_unknown", "Couldn't check your access right now. Try again.")
  const { kind } = (await res.json().catch(() => ({}))) as { kind?: string }
  if (kind !== "staff")
    throw new GuardError(
      403,
      "portal_login",
      "Access tokens are for the team's own staff. Your login is a client portal login — sign in at your portal address instead."
    )
}
