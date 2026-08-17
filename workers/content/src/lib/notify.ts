// Ticket notifications — when someone replies to a ticket or @mentions a member,
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

/** How many sends run at once, and how many one call will run at all.
 *
 * WHY A CONCURRENCY BOUND AT ALL, when `Promise.all` looks like it already
 * parallelises: a Worker may have only SIX outgoing connections waiting for
 * response headers at a time (Cloudflare Workers limits, checked 14 Aug 2026), so
 * `Promise.all` over 500 sends does not run 500 in parallel — it queues 494 of
 * them behind six, inside one invocation, and the invocation is what runs out
 * first. A cron gets 15 minutes of wall clock. Five hundred sends at a couple of
 * hundred milliseconds each, six at a time, is most of that for ONE team, and the
 * digest loops over a whole window of them.
 *
 * So the fan-out is bounded twice: SEND_CONCURRENCY matches the platform's own
 * ceiling (asking for more parallelism than the runtime will give buys nothing but
 * a longer queue), and SEND_FAN_CAP is the ceiling on ONE call's recipients — past
 * it the send stops and says so, rather than turning a nudge into the reason the
 * whole tick died with nothing recorded. */
const SEND_CONCURRENCY = 6
const SEND_FAN_CAP = 100

/** Send to many people with a bounded number in flight. Every failure is already
 * each caller's own `.catch` — this only decides HOW MANY are in the air, so a
 * best-effort notice stays best-effort and never becomes the thing that spends an
 * invocation's whole budget.
 *
 * Over SEND_FAN_CAP the extra recipients are DROPPED and NAMED. Silently sending
 * to the first hundred would be the shape this base refuses everywhere else (a
 * short answer that looks complete); a digest is a nudge, and the honest failure
 * for a nudge nobody can deliver at that size is a loud line in the log plus a
 * decision for a person to make. */
async function sendToMany(
  who: string,
  people: { email: string }[],
  // `unknown`, not `void`: every caller's body is `send(...).catch(console.error)`,
  // whose value is whatever the catch returned. What comes back is discarded —
  // saying so here is what keeps the call sites free of a `void` nobody reads.
  one: (person: { email: string }) => Promise<unknown>
): Promise<void> {
  const list = people.slice(0, SEND_FAN_CAP)
  if (people.length > list.length)
    console.error(
      `${who}: ${people.length} recipients is past the ${SEND_FAN_CAP} one send may fan out to — ` +
        `${people.length - list.length} were NOT emailed. This wants a queue, not a bigger number.`
    )
  for (let i = 0; i < list.length; i += SEND_CONCURRENCY)
    await Promise.all(list.slice(i, i + SEND_CONCURRENCY).map(one))
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
          footnote: "Open the ticket to read the full conversation and reply.",
        }).catch((e) => console.error("help reply notice failed:", e))
      })
    )
  } catch (e) {
    console.error("help notify failed:", e)
  }
}

/* ────────────────── the two emails the CLIENT ever receives ────────────────── */
// BUILD-1 §7 is a closed list, and it is short on purpose: "only ticket
// resolutions and to-dos. Nothing else emails the client; everything else lives
// in the portal for them to look at."
//
// The reason is worth keeping in front of whoever adds the third one. This app
// is a place a client goes to look at their own work — the moment it also becomes
// a thing that arrives in their inbox twice a week, the portal stops being where
// they look and the email becomes the product. So: something we NEED FROM THEM,
// and the ANSWER to something they asked. Both are moments where the next move is
// theirs and they cannot make it from a screen they are not on.
//
// Both sends are best-effort, like every other notification here: a failed email
// must never fail the write that triggered it. The row is already saved and
// already on their screen.

/** Everybody at one account with a LIVE portal login, and their addresses.
 *
 * Two reads rather than a join, because the two halves live in two databases: who
 * may sign in is a per-team fact (`portal_users`) and what their address is is a
 * global one (`users`). Only LIVE grants: a revoked login is a person we stopped
 * telling things, and mailing them anyway is the quiet half of an offboarding
 * that looked complete. */
async function accountInboxes(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string
): Promise<{ email: string; name: string }[]> {
  // THE GUARD CORRIDOR'S QUESTION, ASKED FROM THE OTHER END. A portal grant sits
  // on a PERSON's own account row, not on the company — the company is where the
  // fence then reaches from (shared/workers/account-scope.ts ROOTS_SQL: their row
  // hangs under it, or they are linked to it). So "who at this company can sign
  // in" is not `portal_users WHERE account_id = <company>`; that finds only the
  // freelancer whose own row IS the account, and misses every ordinary contact.
  // Getting this wrong is silent: the to-do is written, nobody is told, and the
  // client discovers it the next time they happen to open the portal.
  const grants = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    // Bounded (R14): the people at one company who can sign in.
    `SELECT pu.user_id FROM portal_users pu
      WHERE pu.deactivated_at IS NULL
        AND (pu.account_id = ?
             OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = pu.account_id AND a.parent_account_id = ?)
             OR EXISTS (SELECT 1 FROM account_links l
                         WHERE l.person_account_id = pu.account_id AND l.account_id = ?
                           AND l.deactivated_at IS NULL))
      LIMIT 100`,
    [accountId, accountId, accountId]
  )
  const ids = grants.map((g) => g.user_id).filter(Boolean)
  if (!ids.length) return []
  const { results } = await env.DB.prepare(
    `SELECT email, first_name, last_name FROM users WHERE id IN (${ids.map(() => "?").join(", ")})`
  )
    .bind(...ids)
    .all<{ email: string; first_name: string | null; last_name: string | null }>()
  return (results ?? [])
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
    }))
}

/** WHO IS TOLD THE ANSWER (CHECKLIST 5.7) — "the RAISER and the app's main
 * stakeholder", Aurora's ts3 over the owner's "raiser only".
 *
 * TWO NAMED PEOPLE, NOT THE WHOLE COMPANY, and that narrowing is the change. This
 * used to mail every live portal login at the account, which is right for a to-do
 * (anybody can send us the file) and wrong for an answer: a resolution is a reply
 * to somebody's question, and copying eleven colleagues on it is how a client
 * mutes us.
 *
 * WHO THE RAISER IS. The CONTACT the ticket names, when it names one — that is
 * the person who asked, and it is not always the person who typed: 220 of the 221
 * seeded requests were typed by staff on a client's behalf. When no contact is
 * named we fall back to whoever created the row, which is only ever an address if
 * they were a client login in the first place.
 *
 * WHO THE MAIN STAKEHOLDER IS. `account_links.is_main_stakeholder` — the person
 * at the company who owns the relationship. The APP-level stakeholder set
 * (CHECKLIST 8.5) does not exist yet and is another lane's work; when it lands,
 * this is the one function that changes, and the sentence it implements does not.
 *
 * DE-DUPED BY ADDRESS, because the raiser very often IS the main stakeholder at a
 * small client, and two copies of one answer reads as a system that is not paying
 * attention. Only LIVE portal grants: a revoked login is a person we stopped
 * telling things. */
async function resolutionInboxes(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  accountId: string,
  ticket: { raised_by_contact_id: string | null; creator_id: string | null }
): Promise<{ email: string; name: string }[]> {
  // The two PEOPLE, as account rows: whoever asked, and whoever owns the
  // relationship. One read, because they are one question about one company.
  const rows = await d1Query<{ user_id: string }>(
    cfg,
    guard.databaseId,
    `SELECT pu.user_id FROM portal_users pu
      WHERE pu.deactivated_at IS NULL
        AND (pu.account_id = ?
             OR EXISTS (SELECT 1 FROM account_links l
                         WHERE l.person_account_id = pu.account_id AND l.account_id = ?
                           AND l.deactivated_at IS NULL AND l.is_main_stakeholder = 1))
      LIMIT 100`, // R14 bound
    [ticket.raised_by_contact_id ?? "", accountId]
  )
  const ids = new Set(rows.map((r) => r.user_id).filter(Boolean))
  // …and the person who TYPED it, when that was a client login. A contact who
  // raises their own question through the portal names no contact on the row, so
  // this is the ordinary path for a ticket a client raised themselves.
  if (ticket.creator_id) {
    const own = await d1Query<{ user_id: string }>(
      cfg,
      guard.databaseId,
      `SELECT user_id FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL LIMIT 1`,
      [ticket.creator_id]
    )
    if (own[0]) ids.add(own[0].user_id)
  }
  if (!ids.size) return []
  const list = [...ids]
  const { results } = await env.DB.prepare(
    `SELECT email, first_name, last_name FROM users WHERE id IN (${list.map(() => "?").join(", ")})`
  )
    .bind(...list)
    .all<{ email: string; first_name: string | null; last_name: string | null }>()
  const seen = new Set<string>()
  return (results ?? [])
    .filter((r) => r.email && !seen.has(r.email) && seen.add(r.email))
    .map((r) => ({
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
    }))
}

/** EMAIL ONE: we need something from you.
 *
 * A to-do is the only thing in the product where the next move is the client's
 * and they have no way to know it without being told. The mail carries the
 * reference they will quote back at us and the date, and nothing else — the
 * detail is on the screen, and an email that reproduces the screen is an email
 * that goes stale the moment somebody edits the row. */
export async function notifyTodoRaised(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  todoId: string
): Promise<void> {
  try {
    const rows = await d1Query<{
      ref: string | null
      title: string
      due_on: string | null
      account_id: string
    }>(
      cfg,
      guard.databaseId,
      `SELECT ref, title, due_on, account_id FROM todos WHERE id = ? LIMIT 1`,
      [todoId]
    )
    const todo = rows[0]
    if (!todo) return
    const people = await accountInboxes(env, cfg, guard, todo.account_id)
    if (!people.length) return
    const name = await teamName(env, guard.teamId)
    // NO STAFF NAME ANYWHERE IN IT. SCOPE ch.06 — the portal never says which
    // staff member is doing the work — and an email is a surface that leaves the
    // building, which is exactly where that promise is easiest to drop.
    await sendToMany("to-do notice", people, (p) =>
      send(env, p.email, `${brand.name}: we need something from you`, {
        heading: "One thing from you",
        intro: `${todo.title}${todo.due_on ? ` — by ${todo.due_on.slice(0, 10)}` : ""}.`,
        footnote: `Open ${todo.ref ? `${todo.ref} ` : ""}in your ${name} portal to mark it done, and send the file with it if there is one.`,
      }).catch((e) => console.error("to-do notice failed:", e))
    )
  } catch (e) {
    console.error("to-do notify failed:", e)
  }
}

/* ─────────────────── the ONE internal digest, once a morning ────────────────── */
// TWO NUDGES, ONE EMAIL, and that is a decision rather than a saving. BUILD-1
// asks for a morning digest of what has been sitting (§6) and a weekly nudge for
// missing time (§5). Two crons and two sends would be two things arriving in the
// same person's inbox on a Monday, from the same app, about the same week — and
// the second one anybody filters is the one they stop reading. So it is one
// message, to one person: the one on triage duty.

/** Every ACTIVE member of a team, with the name to print. Read from the core
 * database, which is where membership and identity both live. */
export async function teamMemberNames(
  env: { DB: D1Database },
  teamId: string
): Promise<{ userId: string; name: string; email: string }[]> {
  const { results } = await env.DB.prepare(
    // Bounded (R14): an agency's own staff list, and the digest reads it once a day.
    `SELECT u.id, u.email, u.first_name, u.last_name
       FROM users u JOIN team_members tm ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.deactivated_at IS NULL AND u.deactivated_at IS NULL
      LIMIT 500`
  )
    .bind(teamId)
    .all<{ id: string; email: string; first_name: string | null; last_name: string | null }>()
  return (results ?? [])
    .filter((r) => r.email)
    .map((r) => ({
      userId: r.id,
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
    }))
}

/** The morning digest, to the person whose week it is.
 *
 * TO ONE PERSON, not the team. "One named person is on triage duty" (§6) is the
 * whole point of the rota: a nudge addressed to everybody is addressed to nobody.
 * When nobody has been named for the week it falls back to the whole staff list,
 * because an unread backlog with no owner is worse than a slightly noisy morning
 * — and the fix for the noise is naming somebody, which is what the mail asks for.
 *
 * NOTHING CLIENT-FACING EVER (§6, and it is the reason the digest is not simply
 * "email whoever raised it"): a ticket that has been sitting is our failure, and
 * telling a client about it turns an internal prompt into an SLA nobody promised.
 * Every recipient here comes off the team's own membership. */
export async function sendTriageDigest(
  env: Env,
  teamId: string,
  to: { email: string; name: string }[],
  digest: { waiting: number; oldestDays: number; onDutyName: string | null; missingTime: string[] }
): Promise<void> {
  if (!to.length) return
  if (digest.waiting === 0 && digest.missingTime.length === 0) return
  try {
    const team = await teamName(env, teamId)
    const lines: string[] = []
    if (digest.waiting > 0)
      lines.push(
        `${digest.waiting} ${digest.waiting === 1 ? "request has" : "requests have"} been waiting to be read — the oldest for ${digest.oldestDays} days.`
      )
    if (digest.missingTime.length > 0)
      lines.push(
        `No time was logged last week by: ${digest.missingTime.join(", ")}.`
      )
    await sendToMany("triage digest", to, (p) =>
      send(env, p.email, `${team}: this morning`, {
          heading: digest.onDutyName ? `${digest.onDutyName} is on triage this week` : "Nobody is on triage this week",
          intro: lines.join(" "),
          footnote: digest.onDutyName
            ? "Open Tickets to read them."
          : "Put somebody on triage duty in Tickets — a backlog with no owner is the one nobody clears.",
      }).catch((e) => console.error("triage digest failed:", e))
    )
  } catch (e) {
    console.error("triage digest failed:", e)
  }
}

/** EMAIL TWO — and the last one. THE ANSWER TO WHAT THEY ASKED.
 *
 * The other half of BUILD-1 §7's closed list, and the one the whole product is
 * judged on: somebody asked us something, and this is us coming back. It is sent
 * BY A PERSON pressing send, never by a status moving — which is why the door
 * that calls it takes the words as an argument rather than reading them off the
 * draft. A draft is our working text; a resolution is a sentence somebody chose
 * to say.
 *
 * NO STAFF NAME, for the third time in this file and the same reason: SCOPE
 * ch.06 is a promise about every surface that leaves the building. The client is
 * told their request is answered and what the answer is; who wrote it is ours. */
export async function notifyTicketResolved(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  ticketId: string,
  resolution: string
): Promise<void> {
  try {
    const rows = await d1Query<{
      ref: string | null
      description: string
      account_id: string | null
      raised_by_contact_id: string | null
      creator_id: string | null
    }>(
      cfg,
      guard.databaseId,
      `SELECT ref, description, account_id, raised_by_contact_id, creator_id FROM help WHERE id = ? LIMIT 1`,
      [ticketId]
    )
    const ticket = rows[0]
    // No account means the agency's own question, asked and answered inside the
    // building. There is nobody outside it to tell.
    if (!ticket?.account_id) return
    const people = await resolutionInboxes(env, cfg, guard, ticket.account_id, ticket)
    if (!people.length) return
    const name = await teamName(env, guard.teamId)
    const asked = snippet(ticket.description)
    await sendToMany("resolution notice", people, (p) =>
      send(env, p.email, `${name}: ${ticket.ref ? `${ticket.ref} — ` : ""}answered`, {
        heading: "We've come back to you",
        // The ANSWER in full, and what they asked in one line above it, because
        // a resolution arriving with no reminder of the question is a paragraph
        // people have to go and look something up to understand.
        intro: `You asked: "${asked}"\n\n${resolution}`,
        footnote: "Open the ticket if you want to reply — the whole conversation is there.",
      }).catch((e) => console.error("resolution notice failed:", e))
    )
  } catch (e) {
    console.error("resolution notify failed:", e)
  }
}
