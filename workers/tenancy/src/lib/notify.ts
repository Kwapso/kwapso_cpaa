// Member notifications — when something happens TO a member that they did NOT
// trigger (their role changes, they're removed, their invite is revoked), tell
// them. Required communication: the change affects them but they didn't make it,
// so they wouldn't otherwise know. Sent through the SAME branded template +
// auth-worker sender as login/invite emails, so every email looks identical.
//
// Best-effort by design: a failed notification must NEVER fail the action that
// triggered it, so each helper swallows its own errors (the action already
// happened and is logged in activity).

import { brand } from "@shared/brand"
import { sendBrandedEmail as send, teamName } from "@shared/workers/notify"
import { type Audience, recordLink } from "@shared/workers/record-link"
import type { Env } from "../env"

/** A member's role was changed by someone else.
 *
 * `member` is who it happened to and which front door they read us through — the
 * caller has already asked, because it is the caller that holds the team database
 * this answer lives in. A STAFF member gets a link to their own membership, which
 * is the record this email is about; a CLIENT login gets none, and that is the
 * point of carrying the audience at all. The portal has no members screen, so the
 * only link that could exist for them is an agency URL, which is a door they may
 * not pass and a door an email must never advertise (R21). */
export async function notifyRoleChanged(
  env: Env,
  teamId: string,
  to: string,
  actorName: string,
  roleTitle: string,
  member: { userId: string; audience: Audience }
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    const link = recordLink(env, member.audience, {
      kind: "member",
      teamId,
      id: member.userId,
    })
    await send(env, to, `Your role in ${name} changed`, {
      heading: `Your role in ${name} changed`,
      intro: `${actorName || "An admin"} changed your role in ${name} on ${brand.name} to ${roleTitle}.`,
      ctaLabel: link?.label,
      ctaUrl: link?.url,
      footnote: "If you weren't expecting this, reach out to a team admin.",
    })
  } catch (e) {
    console.error("role-change notice failed:", e)
  }
}

/** A member was removed from the team by someone else. */
export async function notifyRemoved(
  env: Env,
  teamId: string,
  to: string,
  actorName: string
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    await send(env, to, `You were removed from ${name}`, {
      heading: `You were removed from ${name}`,
      intro: `${actorName || "An admin"} removed you from ${name} on ${brand.name}. You no longer have access to it.`,
      footnote: "If you think this was a mistake, a team admin can invite you back.",
    })
  } catch (e) {
    console.error("removal notice failed:", e)
  }
}

/** A pending invite was revoked before the person joined. */
export async function notifyInviteRevoked(
  env: Env,
  teamId: string,
  to: string,
  // Who withdrew it, kept in the signature and NOT in the email: the caller has
  // to know the actor anyway, and every sibling notice takes it — but naming a
  // staff member to someone outside the team is not this message's job.
  _actorName: string
): Promise<void> {
  if (!to) return
  try {
    const name = await teamName(env, teamId)
    await send(env, to, `Your invite to ${name} was withdrawn`, {
      heading: `Your invite to ${name} was withdrawn`,
      intro: `Your invite to join ${name} on ${brand.name} was withdrawn. No action is needed.`,
      footnote: "If you think this was a mistake, ask a team admin to invite you again.",
    })
  } catch (e) {
    console.error("revoke notice failed:", e)
  }
}
