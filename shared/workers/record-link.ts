// WHERE A RECORD LIVES, FOR THE PERSON BEING EMAILED — the one helper every
// outbound email uses to build a link back to the thing it is about.
//
// THE TRAP THIS FILE EXISTS TO CLOSE. The same ticket has TWO addresses. A staff
// member reads it in the agency app; a client contact reads it in the portal.
// Send a client an agency URL and you have sent them a link they cannot open —
// and, worse, advertised a door they may not pass (R21). So the audience is an
// ARGUMENT here, and neither hostname is ever spelled at a call site: the two
// origins arrive as configuration (PUBLIC_APP_URL / PUBLIC_PORTAL_URL) and this
// is the only file that knows what to do with them.
//
// portal.kwapso.app IS NOT THE PORTAL. It resolves to a live third-party no-code
// product of the owner's (see workers/portal-gateway/wrangler.jsonc and
// shared/workers/front-door.ts). The portal's real addresses are
// client.kwapso.app and staging-client.kwapso.app, which is exactly why the value
// is configuration and not a constant anybody can retype from memory.
//
// WHAT IT REFUSES TO DO. A record kind with no screen on one of the two front
// doors gets `null` for that audience, and the caller sends no button. A dead
// link is worse than no link, and an INVENTED screen is worse than both — the
// portal has no to-do detail page, so a to-do notice points at the portal home,
// where the item actually sits, and says so.

import type { D1Rest } from "./d1-rest"
import { d1Query } from "./d1-rest"
import { idBatches } from "./limits"

/** Which front door this person reads the app through. Decided per RECIPIENT,
 * never per send: one ticket reply goes to both kinds of person at once. */
export type Audience = "agency" | "portal"

/** The two public origins, as they arrive on a worker's env. Optional because a
 * fresh environment may not have set them yet — an unset origin means NO button,
 * never a link to nowhere. */
export type LinkEnv = { PUBLIC_APP_URL?: string; PUBLIC_PORTAL_URL?: string }

/** The record kinds an email can be about. Adding one here is how a new email
 * earns a button; R29's census is what makes forgetting impossible. */
export type RecordKind = "ticket" | "ticketList" | "todo" | "invite" | "member" | "portalHome"

/** What is known about the record being linked to. Every field is optional and
 * every destination below checks what it needs, so a caller that cannot supply
 * an id gets `null` rather than a URL with `undefined` in it. */
export type RecordRef = {
  kind: RecordKind
  /** The team the record belongs to. The AGENCY address is team-qualified
   * (/t/<teamId>/…) because a staff member is often in more than one team and
   * the clean top-level URL resolves "the active team" from whatever they last
   * looked at. A link that lands on the right record in the wrong team is the
   * kind of near-miss nobody reports. */
  teamId?: string
  /** The record's own id. */
  id?: string
  /** The account a to-do was raised on — the agency screen that lists to-dos is
   * the account's own record, so this is what an agency-side to-do link needs. */
  accountId?: string
}

type Destination = { label: string; path: (ref: RecordRef) => string | null }

/** THE MAP: one row per record kind, one column per front door. `null` where a
 * front door genuinely has no screen for that kind — said out loud, because the
 * alternative is a link that 404s in a client's inbox.
 *
 * The paths are the two apps' real deep-link grammars, both of which resolve to a
 * client-side shell: the agency gateway serves /t/* at any depth, the portal
 * gateway serves /tickets/* at any depth. */
const DESTINATIONS: Record<RecordKind, Record<Audience, Destination | null>> = {
  ticket: {
    agency: {
      label: "Open the ticket",
      path: (r) => (r.teamId && r.id ? `/t/${r.teamId}/tickets/${r.id}` : null),
    },
    portal: {
      label: "Open the ticket",
      // NO teamId, and that is not a shortening. The portal's own address space
      // has no team in it — a client belongs to an account, not to our team —
      // so a portal URL cannot carry the agency's team identifier even by
      // accident. The id it does carry is the ticket the email is already about.
      path: (r) => (r.id ? `/tickets/${r.id}` : null),
    },
  },
  ticketList: {
    agency: {
      label: "Open Tickets",
      path: (r) => (r.teamId ? `/t/${r.teamId}/tickets` : null),
    },
    portal: { label: "Open your requests", path: () => "/tickets" },
  },
  todo: {
    agency: {
      // A to-do has no screen of its own in the agency app: it is a tab on the
      // account it was raised on, which is the nearest thing that genuinely
      // lists it.
      label: "Open the account",
      path: (r) => (r.teamId && r.accountId ? `/t/${r.teamId}/accounts/${r.accountId}` : null),
    },
    portal: {
      // …and none in the portal either. To-dos sit on the portal home, above
      // their own requests ("Waiting on you"), which is where this lands them.
      label: "Open your portal",
      path: () => "/home",
    },
  },
  member: {
    // A person's own membership: the role they hold in this team, on the record
    // that shows it.
    agency: {
      label: "See your role",
      path: (r) => (r.teamId && r.id ? `/t/${r.teamId}/members/${r.id}` : null),
    },
    // The portal has no members screen and will not be given one from an email.
    // A client login holds no rights over the agency's staff list, so the only
    // link that could exist here is one that refuses them on arrival.
    portal: null,
  },
  invite: {
    // The in-app invites inbox: an already-signed-in person lands on Accept,
    // a new one is sent to sign in and onboarding joins them. It is not
    // team-scoped — the whole point is that they are not in the team yet.
    agency: { label: "Open your invites", path: () => "/invitations" },
    // The portal has no invites screen, and an invite is how a portal login
    // comes into being in the first place — there is nowhere else to send it.
    portal: null,
  },
  // THE PORTAL ITSELF — the one destination that is not a record.
  //
  // Until 26 Aug 2026 nothing told a client their portal EXISTED. Switching a
  // login on wrote a row and sent nothing at all, so somebody at the agency had
  // to remember to type the address into a mail by hand — and the address is
  // configuration precisely because nobody should be typing it from memory
  // (portal.kwapso.app is a different product of the owner's; see the note at
  // the top of this file). This is the destination that email points at.
  portalHome: {
    // Never sent to staff: a colleague has no portal to be welcomed to, and a
    // link to one would be a door they may not pass (R21).
    agency: null,
    portal: { label: "Open your portal", path: () => "/home" },
  },
}

/** Does the CLIENT PORTAL have a screen for this kind of record at all? Read by
 * R29's check to work out which workers must have the portal's own origin
 * configured — derived from this map rather than from a list somebody keeps. */
export function hasPortalScreen(kind: RecordKind): boolean {
  return Boolean(DESTINATIONS[kind]?.portal)
}

/** WHICH ADDRESS THIS PERSON'S APP LIVES AT. Also what an email's LOGO is
 * resolved against — a mail client has no origin of its own, so an absolute src
 * is the only kind that renders, and resolving it against the recipient's own
 * front door is what keeps the agency's hostname out of a client's inbox
 * altogether. `undefined` when it is not configured, which the branded template
 * already handles by falling back to the wordmark. */
export function frontDoorOrigin(env: LinkEnv, audience: Audience): string | undefined {
  const configured = audience === "agency" ? env.PUBLIC_APP_URL : env.PUBLIC_PORTAL_URL
  return configured?.trim().replace(/\/+$/, "") || undefined
}

/** The link back to a record for ONE recipient, or `null` when there isn't an
 * honest one: no screen on that front door, no origin configured, or not enough
 * known about the record to address it.
 *
 * The DESTINATION is asked first, and the order is deliberate: "this front door
 * has no screen for this kind of record" is a fact about the product, and it must
 * not depend on whether somebody remembered to set a variable. */
export function recordLink(
  env: LinkEnv,
  audience: Audience,
  ref: RecordRef
): { label: string; url: string } | null {
  const destination = DESTINATIONS[ref.kind]?.[audience]
  if (!destination) return null
  const origin = frontDoorOrigin(env, audience)
  if (!origin) return null
  const path = destination.path(ref)
  return path ? { label: destination.label, url: `${origin}${path}` } : null
}

/** WHICH OF THESE PEOPLE ARE CLIENT LOGINS — the read that decides the audience.
 *
 * Fail-closed, and the direction matters: portal-ness is decided by the PRESENCE
 * of a `portal_users` row, never by its absence, so a revoked login is still a
 * client and never silently becomes staff for the purpose of what it is shown.
 * A deactivated grant still means "this person reads us through the portal".
 *
 * One read for a whole send, because one reply notice goes to both kinds of
 * person and the question is the same question for all of them.
 *
 * BATCHED, because the callers' lists are not all small. A ticket's mentions are
 * bounded at 51 and always were; the morning digest asks this about a WHOLE TEAM's
 * membership, which the read that produced it caps at 500 — five times what D1 will
 * bind in one statement. That failure is invisible in every suite here (local
 * SQLite allows 999) and a 500 in production, which is exactly the trap
 * `idBatches` exists for. */
export async function clientUserIds(
  cfg: D1Rest,
  databaseId: string,
  ids: string[]
): Promise<Set<string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return new Set()
  const found = new Set<string>()
  for (const batch of idBatches(unique)) {
    const rows = await d1Query<{ user_id: string }>(
      cfg,
      databaseId,
      // Bounded by its own WHERE (R14): at most one row per id asked about.
      `SELECT user_id FROM portal_users WHERE user_id IN (${batch.map(() => "?").join(", ")})`,
      batch
    )
    for (const r of rows) found.add(r.user_id)
  }
  return found
}

/** The front door one person reads, given the set above. */
export function audienceOf(clients: Set<string>, userId: string): Audience {
  return clients.has(userId) ? "portal" : "agency"
}
