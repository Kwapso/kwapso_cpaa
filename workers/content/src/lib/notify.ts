// Help notifications — when someone replies to a ticket or @mentions a member,
// tell the people who'd want to know: the ticket's raiser (someone answered them)
// and anyone mentioned. Required communication: it happened to them but they
// didn't trigger it. Sent through the SAME branded template + auth-worker sender
// as every other kwapso email, so they all look identical.
//
// Best-effort by design: a failed notification must NEVER fail the reply that
// triggered it — the reply already saved and published. Every path swallows its
// own errors. Mentions are notify-only: all tickets are team-visible anyway, so a
// mention grants no access (locked decision), it just pings.

import { brand } from "@shared/brand"
import { d1Query, type D1Rest } from "@shared/workers/d1-rest"
import type { MemberGuard } from "@shared/workers/gating"
import { sendBrandedEmail as send, teamName } from "@shared/workers/notify"
import type { Env } from "../env"

/** Look up email + display name for tagged ids — restricted to ACTIVE members of
 * THIS team (join team_members). A @mention can only notify a teammate, never an
 * arbitrary platform user, so it can't leak the team name + reply text to outsiders
 * or be used to spam from kwapso's trusted sender. Returns a map id → {email, name}. */
async function lookupUsers(
  env: Env,
  teamId: string,
  ids: string[]
): Promise<Map<string, { email: string; name: string }>> {
  const out = new Map<string, { email: string; name: string }>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return out
  const placeholders = unique.map(() => "?").join(", ")
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name
       FROM users u
       JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.deactivated_at IS NULL AND u.id IN (${placeholders})`
  )
    .bind(teamId, ...unique)
    .all<{ id: string; email: string; first_name: string | null; last_name: string | null }>()
  for (const r of results ?? []) {
    out.set(r.id, {
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
    })
  }
  return out
}

/** Which of these people are CLIENT logins (a `portal_users` row, TEAM DB)?
 *
 * Same fail-closed reading as the guard corridor: portal-ness is decided by the
 * PRESENCE of a row, never by its absence, so a revoked login is still a client
 * and never silently becomes staff for the purpose of who may be named to them. */
async function portalUserIds(cfg: D1Rest, guard: MemberGuard, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return new Set()
  const rows = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    `SELECT user_id FROM portal_users WHERE user_id IN (${unique.map(() => "?").join(", ")})`,
    unique
  )
  return new Set(rows.map((r) => r.user_id))
}

/** A short, safe preview of the reply text for the email body. */
function snippet(body: string): string {
  const clean = body.trim().replace(/\s+/g, " ")
  return clean.length > 160 ? clean.slice(0, 157) + "..." : clean
}

/** After a reply lands: email the ticket's raiser (someone answered them) and each
 * mentioned member (they were tagged). The reply's author is never emailed, and a
 * person is emailed at most once (a mention wins over the raiser notice). */
export async function notifyReplyAndMentions(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  teamId: string,
  ticket: { id: string; raiserId: string },
  author: { id: string; name: string },
  body: string,
  taggedUserIds: string[]
): Promise<void> {
  try {
    const mentioned = new Set(taggedUserIds.filter((id) => id && id !== author.id))
    const recipients = new Set<string>(mentioned)
    if (ticket.raiserId && ticket.raiserId !== author.id) recipients.add(ticket.raiserId)
    if (!recipients.size) return

    const name = await teamName(env, teamId)
    const users = await lookupUsers(env, teamId, [...recipients])
    // WHO THIS EMAIL SAYS IT IS FROM — the other half of staff anonymity, and the
    // half that was leaking. listReplies keeps the promise on the wire (a client
    // login is sent no name for anyone on the agency's side), and then this
    // notification arrived in the same person's inbox saying "Alice Smith replied
    // to your support ticket". Between them a client had a permanent
    // pseudonym → name linkage: the reply on screen carries the author's handle,
    // the email carries the handle's real name. SCOPE ch.06 — "the portal shows
    // work status but never which staff member is doing it" — is one promise, and
    // it has to be kept on every surface that leaves the building.
    //
    // ONE read decides it for everyone in this send: who among the author and the
    // recipients is a client. A staff reply is attributed to the agency for a
    // CLIENT recipient only — staff still see each other's names, and a client's
    // own colleague is still named to them (calling a colleague "kwapso" would be
    // a lie about who is talking, not anonymity).
    const clients = await portalUserIds(cfg, guard, [author.id, ...recipients])
    const authorIsClient = clients.has(author.id)
    const preview = snippet(body)

    await Promise.all(
      [...recipients].map(async (id) => {
        const u = users.get(id)
        if (!u?.email) return
        // Named, or the agency — decided per RECIPIENT, because one reply goes to
        // both kinds of person in the same send.
        const who = !authorIsClient && clients.has(id) ? brand.name : author.name || "Someone"
        const isMention = mentioned.has(id)
        const subject = isMention
          ? `${who} mentioned you on a ${name} ticket`
          : `New reply on your ${name} support ticket`
        const heading = isMention ? "You were mentioned" : "New reply on your ticket"
        const intro = isMention
          ? `${who} mentioned you in a support ticket reply on ${name} (${brand.name}): "${preview}"`
          : `${who} replied to your support ticket on ${name} (${brand.name}): "${preview}"`
        await send(env, u.email, subject, {
          heading,
          intro,
          footnote: "Open the ticket in Help to read the full conversation and reply.",
        }).catch((e) => console.error("help reply notice failed:", e))
      })
    )
  } catch (e) {
    console.error("help notify failed:", e)
  }
}
