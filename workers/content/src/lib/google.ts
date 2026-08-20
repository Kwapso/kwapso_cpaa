// GOOGLE CONNECTIONS — the rows, and the one place a token is ever read back.
//
// The module's whole shape in one sentence: a connection belongs to a PERSON,
// not to a team, and everything reachable through it is something that person
// could already reach. There is no service account, no shared mailbox, no
// team-wide Drive. The assistant acting for somebody borrows exactly their sight
// and nothing more, which is the same promise the permission spine already makes
// everywhere else in the base — this module just makes it true across a
// boundary the base does not own.
//
// WHAT LIVES WHERE:
//   • this file      — the rows, the tokens, and the audit of every act;
//   • google-oauth   — the handshake with Google (a different OAuth app from
//                      sign-in; see that file's header);
//   • google-crypto  — the tokens at rest;
//   • google-api     — the four services' own calls;
//   • google-read    — the neutral seam the retrieval lane reads through.

import { logActivity, type Actor } from "@shared/workers/activity"
import { d1ExecScript, d1Query, sqlString, type D1Rest } from "@shared/workers/d1-rest"
import { GuardError, type MemberGuard } from "@shared/workers/gating"
import { ulid } from "@shared/workers/id"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import {
  GOOGLE_NAMED_SERVICES,
  GOOGLE_SERVICES,
  GOOGLE_SHELVES,
  type GoogleConnection,
  type GoogleNamedService,
  type GoogleService,
  type GoogleShelf,
  type GoogleSourceKind,
  type GoogleSource,
} from "@shared/types"
import { GOOGLE_MAIL_BIN_KINDS, type GoogleMailBinKind } from "./google-api"
import { openToken, sealToken, type TokenKeyEnv } from "./google-crypto"
import {
  connectCredentials,
  missingScopes,
  refreshAccessToken,
  revokeAtGoogle,
  unrequestedScopes,
  type ConnectEnv,
  type GoogleTokens,
} from "./google-oauth"

/** Everything this file needs from the worker env. */
export type GoogleEnv = TokenKeyEnv & ConnectEnv

/** Every column a screen sees. `access_token` and `refresh_token` are NOT in it,
 * and that is enforcement rather than tidiness: the read used by every list, every
 * detail and every response body physically cannot carry a token, so no future
 * edit can leak one by forgetting to strip a field. */
const PUBLIC_COLUMNS = `id, user_id, service, google_email, scopes, last_used_at, last_error,
                        deactivated_at, created_at, creator_name, updated_at, editor_name`

type ConnectionRow = {
  id: string
  user_id: string
  service: string
  google_email: string
  scopes: string
  last_used_at: string | null
  last_error: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

function toConnection(r: ConnectionRow): GoogleConnection {
  const service = r.service as GoogleService
  return {
    id: r.id,
    userId: r.user_id,
    service,
    googleEmail: r.google_email,
    grantedScopes: r.scopes,
    // WHAT GOOGLE GRANTED THAT WE DID NOT ASK FOR — decided HERE, in the one
    // place that already knows both halves, and never in the browser. The scope
    // table is the worker's (google-oauth.ts); shipping it to a screen so the
    // screen could do this subtraction would put the app's own ask on the wire
    // and make "did the narrowing work?" a question two files answer.
    //
    // It is normally empty. When it is not, a person is holding a grant wider
    // than the app asks for — an old approval Google is still honouring — and
    // the settings card says so and points at the fix (disconnect, then connect
    // again). See the essay above GOOGLE_SCOPES for why that is the only fix.
    extraScopes: unrequestedScopes(r.scopes),
    // AND THE SAME SUBTRACTION THE OTHER WAY. A scope added to this app AFTER
    // somebody connected is a permission they have never been asked for, so
    // every door that needs it refuses them and blames a grant nobody touched
    // (CHECKLIST 14.5, `gmail.modify`). The fix is the same two clicks, which is
    // why both facts live on the same row and point at the same sentence.
    missingScopes: missingScopes(service, r.scopes),
    lastUsedAt: r.last_used_at,
    lastError: r.last_error,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** Is this string one of the four services? The allow-list IS the check (R20) —
 * a service name reaches a scope list and a URL, so an unknown one is refused at
 * the boundary rather than carried. */
export function asService(value: unknown): GoogleService {
  if (typeof value !== "string" || !(GOOGLE_SERVICES as readonly string[]).includes(value))
    throw new GuardError(400, "invalid_input", "Pick one of: Drive, Gmail, Calendar or Chat.")
  return value as GoogleService
}

/** ONE SERVICE, OR ALL OF THEM. The connect and disconnect doors take this wider
 * word; every other door still takes `asService`, because reading Drive is a
 * question about Drive and "all" is not an answer to it.
 *
 * `all` exists because Google keeps one grant per person per OAuth client, so
 * connecting the four services one at a time made each one evict the last (see
 * `connectScopes`). It is the ONLY shape that leaves four working connections
 * behind, which is why the screen leads with it. */
export function asServiceOrAll(value: unknown): GoogleService | "all" {
  if (value === "all") return "all"
  return asService(value)
}

/** The two services that are reached through NAMED sources. */
export function asNamedService(value: unknown): GoogleNamedService {
  if (typeof value !== "string" || !(GOOGLE_NAMED_SERVICES as readonly string[]).includes(value))
    throw new GuardError(400, "invalid_input", "Only Drive folders and Chat spaces are named this way.")
  return value as GoogleNamedService
}

/** A draft, one message, or a whole conversation? The allow-list IS the check
 * (R20), same as `asService` above and for the same reason: this word chooses
 * which Gmail endpoint is called, so an unknown one is refused at the boundary
 * rather than carried to a URL. */
export function asMailBinKind(value: unknown): GoogleMailBinKind {
  if (typeof value !== "string" || !(GOOGLE_MAIL_BIN_KINDS as readonly string[]).includes(value))
    throw new GuardError(400, "invalid_input", "Say what to bin: a draft, a message or a conversation.")
  return value as GoogleMailBinKind
}

/** Private, or the team's? Defaults to `private`, and the default is the point:
 * the safe answer must be the one you get by not deciding. */
export function asShelf(value: unknown): GoogleShelf {
  if (value === undefined || value === null || value === "") return "private"
  if (typeof value !== "string" || !(GOOGLE_SHELVES as readonly string[]).includes(value))
    throw new GuardError(400, "invalid_input", "Say who may read it: just you, or the team.")
  return value as GoogleShelf
}

// ── reading the rows ─────────────────────────────────────────────────────────

/** The caller's OWN connections, newest first.
 *
 * ALWAYS the caller's — `userId` comes from the guard at every call site and is
 * never a request parameter, because "show me Ana's connections" is a question
 * this module has no reason to be able to answer. R14: hard cap, and a person
 * cannot have more than four rows live anyway (one per service). */
export async function listConnections(
  cfg: D1Rest,
  guard: MemberGuard
): Promise<GoogleConnection[]> {
  const rows = await d1Query<ConnectionRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: four services × however many times somebody has connected
    // and disconnected. The ceiling is far above any real history.
    `SELECT ${PUBLIC_COLUMNS} FROM google_connections
      WHERE user_id = ? ORDER BY created_at DESC LIMIT ${LIST_HARD_CAP}`,
    [guard.userId]
  )
  return rows.map(toConnection)
}

/** The caller's live connection for one service, or null. */
async function activeConnection(
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<GoogleConnection | null> {
  const rows = await d1Query<ConnectionRow>(
    cfg,
    guard.databaseId,
    // R14: one row by a unique index.
    `SELECT ${PUBLIC_COLUMNS} FROM google_connections
      WHERE user_id = ? AND service = ? AND deactivated_at IS NULL LIMIT 1`,
    [guard.userId, service]
  )
  return rows[0] ? toConnection(rows[0]) : null
}

type SourceRow = {
  id: string
  connection_id: string
  user_id: string
  service: string
  external_id: string
  name: string
  shelf: string
  kind: string
  account_id: string | null
  account_name: string | null
  deactivated_at: string | null
  created_at: string
  creator_name: string | null
  updated_at: string | null
  editor_name: string | null
}

const SOURCE_COLUMNS = `id, connection_id, user_id, service, external_id, name, shelf, kind, account_id,
                        (SELECT a.name FROM accounts a WHERE a.id = google_sources.account_id) AS account_name,
                        deactivated_at, created_at, creator_name, updated_at, editor_name`

function toSource(r: SourceRow): GoogleSource {
  return {
    id: r.id,
    connectionId: r.connection_id,
    userId: r.user_id,
    service: r.service as GoogleNamedService,
    externalId: r.external_id,
    name: r.name,
    shelf: r.shelf as GoogleShelf,
    // WHAT WAS SHARED, not merely which service it came from. A Drive row is now
    // a folder OR a single file, and the two behave differently everywhere they
    // are read — one is a place to look inside, the other is the thing itself.
    // Anything unrecognised reads as a folder, which is what every row was
    // before 0035 and is the only value that cannot surprise an old reader.
    kind: r.kind === "file" ? "file" : r.kind === "space" ? "space" : "folder",
    accountId: r.account_id,
    accountName: r.account_name,
    active: r.deactivated_at === null,
    createdAt: r.created_at,
    creatorName: r.creator_name,
    updatedAt: r.updated_at,
    editorName: r.editor_name,
  }
}

/** The folders and spaces the CALLER has named. Same rule as the connections
 * above: whose is decided by the guard, never by a parameter. */
export async function listNamedSources(
  cfg: D1Rest,
  guard: MemberGuard,
  service?: GoogleNamedService
): Promise<GoogleSource[]> {
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    // R14 hard cap: a person names folders by hand, so this is a small list by
    // construction — the ceiling is a backstop, not a paging decision.
    `SELECT ${SOURCE_COLUMNS} FROM google_sources
      WHERE user_id = ?${service ? " AND service = ?" : ""}
      ORDER BY created_at DESC LIMIT ${LIST_HARD_CAP}`,
    service ? [guard.userId, service] : [guard.userId]
  )
  return rows.map(toSource)
}

/** One named source of the caller's, or a clean 404. Never another person's: a
 * source id that belongs to a colleague answers exactly the same way one that
 * does not exist does, so an id is not an oracle. */
export async function ownSourceOrThrow(
  cfg: D1Rest,
  guard: MemberGuard,
  id: string
): Promise<GoogleSource> {
  const rows = await d1Query<SourceRow>(
    cfg,
    guard.databaseId,
    // R14: one row by primary key.
    `SELECT ${SOURCE_COLUMNS} FROM google_sources WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, guard.userId]
  )
  if (!rows[0]) throw new GuardError(404, "google_source_not_found", "That folder or space isn't one of yours.")
  return toSource(rows[0])
}

// ── writing the rows ─────────────────────────────────────────────────────────

/**
 * Store a completed handshake. An UPSERT rather than a read-then-write, because
 * connecting is a browser round-trip a person can genuinely finish twice (two
 * tabs, an impatient second click) — and two rows would mean two refresh tokens
 * for one account, one of which nothing would ever revoke. The partial unique
 * index is the lock and this statement rides it (CONCURRENCY rule 2).
 *
 * Reconnecting REPLACES the tokens and clears `last_error`, which is exactly
 * what somebody is doing when they reconnect: fixing it.
 */
export async function saveConnection(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { service: GoogleService; googleEmail: string; tokens: GoogleTokens }
): Promise<string> {
  const { tokens } = input
  if (!tokens.refreshToken)
    throw new GuardError(
      502,
      "google_no_refresh",
      "Google didn't hand over a lasting connection. Remove kwapso from your Google account's third-party access, then connect again."
    )
  const id = ulid()
  const now = new Date().toISOString()
  const access = await sealToken(env, tokens.accessToken)
  const refresh = await sealToken(env, tokens.refreshToken)
  const rows = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `INSERT INTO google_connections
       (id, user_id, service, google_email, scopes, access_token, access_expires_at, refresh_token,
        created_at, creator_id, creator_email, creator_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, service) WHERE deactivated_at IS NULL DO UPDATE SET
       google_email = excluded.google_email,
       scopes = excluded.scopes,
       access_token = excluded.access_token,
       access_expires_at = excluded.access_expires_at,
       refresh_token = excluded.refresh_token,
       last_error = NULL,
       updated_at = excluded.created_at,
       editor_id = excluded.creator_id,
       editor_email = excluded.creator_email,
       editor_name = excluded.creator_name
     RETURNING id`,
    [
      id,
      guard.userId,
      input.service,
      input.googleEmail,
      tokens.grantedScopes,
      access,
      tokens.expiresAt,
      refresh,
      now,
      actor.id,
      actor.email,
      actor.name,
    ]
  )
  const rowId = rows[0]?.id ?? id
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Google account connected",
    description: `${actor.name} connected ${input.googleEmail} for ${serviceLabel(input.service)}`,
    relatedTable: "google_connections",
    relatedRowId: rowId,
  })
  return rowId
}

/** Disconnect one service. Our row is deactivated FIRST and is the authority;
 * telling Google is best-effort and reported, never a reason to fail a
 * disconnect somebody asked for (google-oauth.ts says why that direction).
 * R17: the current-status predicate rides the UPDATE, so a double-click moves
 * zero rows and writes no second history row. */
/**
 * DISCONNECT EVERY SERVICE, because Google does anyway.
 *
 * The four services share one OAuth client, and Google keeps ONE grant per
 * person per client — so `revokeAtGoogle` on any single service takes the grant
 * behind all four with it. Before this, the other three rows stayed `active`
 * holding refresh tokens Google had already thrown away, and the settings screen
 * showed three working connections that could not answer a request. The person
 * found out when a sweep failed, if they ever found out at all.
 *
 * So the door tells the truth: disconnecting is an act on the Google ACCOUNT,
 * not on one service. It loops the four rather than doing one wide UPDATE
 * because each service has its own named sources to retire and its own line in
 * the history — and because a service that was already disconnected must move
 * zero rows and write nothing (R17), which the per-service function already
 * gets right.
 */
export async function disconnectAll(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor
): Promise<{ changed: boolean; revokedAtGoogle: boolean }> {
  let changed = false
  let revoked = false
  for (const service of GOOGLE_SERVICES) {
    const one = await disconnect(env, cfg, guard, actor, service)
    changed = changed || one.changed
    // ONE SUCCESSFUL REVOKE IS THE ANSWER FOR ALL FOUR. After the first, Google
    // answers the rest with `invalid_token` — which `revokeAtGoogle` correctly
    // reads as "already gone" and reports as success — so this is an OR over
    // four attempts at one grant, not four independent results.
    revoked = revoked || one.revokedAtGoogle
  }
  return { changed, revokedAtGoogle: revoked }
}

export async function disconnect(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  service: GoogleService
): Promise<{ changed: boolean; revokedAtGoogle: boolean }> {
  const secret = await liveSecrets(cfg, guard, service)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    `UPDATE google_connections
        SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)},
            deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)},
            access_token = NULL, access_expires_at = NULL, updated_at = ?
      WHERE user_id = ? AND service = ? AND deactivated_at IS NULL
      RETURNING id`,
    [now, now, guard.userId, service]
  )
  if (!changed[0]) return { changed: false, revokedAtGoogle: false }

  // The named folders and spaces go with it. They are meaningless without the
  // connection — an orphan source would reappear the moment somebody reconnected,
  // silently re-sharing a folder they may have meant to stop sharing.
  await d1ExecScript(
    cfg,
    guard.databaseId,
    // The caller's own id rides this one too, for the reason given at the read in
    // addNamedSource: uniform beats transitively-safe.
    `UPDATE google_sources SET deactivated_at = ${sqlString(now)},
        deactivator_id = ${sqlString(actor.id)}, deactivator_email = ${sqlString(actor.email)},
        deactivator_name = ${sqlString(actor.name)}, updated_at = ${sqlString(now)}
      WHERE connection_id = ${sqlString(changed[0].id)} AND user_id = ${sqlString(guard.userId)}
        AND deactivated_at IS NULL;`
  )

  // TELL GOOGLE. This is what actually narrows a scope — a grant is an additive
  // set at Google's end, so nothing the app stops doing can take a power off it
  // (google-oauth.ts, the essay above GOOGLE_SCOPES).
  //
  // THE UNSEALING IS INSIDE THE TRY, and that is not tidiness. `revokeAtGoogle`
  // already swallows a network failure, but the decrypt ahead of it did not: a
  // row sealed under a key this deploy no longer has threw AFTER the connection
  // had been deactivated, so the person got a 500 for a disconnect that had
  // already happened, no history row, and no revoke. The safe direction here is
  // always "our row is gone, Google's grant might not be" — never a half-done
  // disconnect nobody can finish.
  let revoked = false
  try {
    if (secret) revoked = await revokeAtGoogle(await openToken(env, secret.refresh_token))
  } catch {
    revoked = false
  }
  await logActivity(cfg, guard.databaseId, actor, {
    type: "Google account disconnected",
    description: `${actor.name} disconnected ${serviceLabel(service)}${revoked ? "" : " (remove it in your Google account too)"}`,
    relatedTable: "google_connections",
    relatedRowId: changed[0].id,
  })
  return { changed: true, revokedAtGoogle: revoked }
}

/** Name a Drive folder or a Chat space. The connection is resolved from the
 * CALLER's own live row, so a source can never be hung off a colleague's. */
export async function addNamedSource(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: {
    service: GoogleNamedService
    externalId: string
    name: string
    shelf: GoogleShelf
    /** a Drive FOLDER or a single Drive FILE; a Chat share is always a space. */
    kind: GoogleSourceKind
    /** which client this folder or space is about — null for the agency's own.
     * It is the COMPARTMENT everything inside it is filed under when the
     * knowledge base reads it, which is why the screen asks for it here rather
     * than guessing from the contents later. */
    accountId?: string | null
  }
): Promise<string> {
  const connection = await activeConnection(cfg, guard, input.service)
  if (!connection)
    throw new GuardError(
      409,
      "google_not_connected",
      `Connect ${serviceLabel(input.service)} first, then choose what to share.`
    )
  const existing = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    // R14: one row by a unique index. A repeat is not an error — somebody
    // sharing the same folder twice means it, and answering with the row they
    // already have is kinder than a refusal they have to interpret.
    //
    // `user_id = ?` is redundant TODAY — the connection was already resolved as
    // the caller's own, so the connection id could only be theirs. It is here
    // because the redundancy is what makes the rule uniform, and a rule that
    // holds on every statement is one a check can prove; a rule that holds on
    // most of them, with the rest safe "because of where the id came from", is a
    // rule whose next exception nobody notices. (A test wrote this line: the
    // scan in test/google-doors.test.ts found this one statement fenced only
    // transitively.)
    `SELECT id FROM google_sources
      WHERE connection_id = ? AND user_id = ? AND external_id = ? AND deactivated_at IS NULL LIMIT 1`,
    [connection.id, guard.userId, input.externalId]
  )
  if (existing[0]) return existing[0].id

  // A folder filed under a client has to name one this team really has, for the
  // reason lib/knowledge.ts gives about a source: a compartment built from an id
  // nobody owns is a slice of the knowledge base nothing can ever reach again.
  if (input.accountId) {
    const rows = await d1Query<{ id: string }>(
      cfg,
      guard.databaseId,
      // R14: one row by primary key.
      "SELECT id FROM accounts WHERE id = ? LIMIT 1",
      [input.accountId]
    )
    if (!rows[0]) throw new GuardError(404, "not_found", "That account doesn't exist.")
  }

  const id = ulid()
  const now = new Date().toISOString()
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `INSERT INTO google_sources (id, connection_id, user_id, service, external_id, name, shelf, kind, account_id,
        created_at, creator_id, creator_email, creator_name)
     VALUES (${sqlString(id)}, ${sqlString(connection.id)}, ${sqlString(guard.userId)}, ${sqlString(input.service)},
        ${sqlString(input.externalId)}, ${sqlString(input.name)}, ${sqlString(input.shelf)}, ${sqlString(input.kind)}, ${sqlString(input.accountId ?? null)},
        ${sqlString(now)}, ${sqlString(actor.id)}, ${sqlString(actor.email)}, ${sqlString(actor.name)});`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.kind === "file" ? "Drive file shared" : input.kind === "space" ? "Chat space shared" : "Drive folder shared",
    // The shelf is IN the history sentence, not just in the row. "Who could read
    // this?" is the question somebody asks six months later, and an activity feed
    // that only says "shared" cannot answer it.
    description: `${actor.name} shared "${input.name}" with ${input.shelf === "team" ? "the team" : "just themselves"}`,
    relatedTable: "google_sources",
    relatedRowId: id,
  })
  return id
}

/** Take a folder or space away again, or put it back. R17: the current-status
 * predicate rides the UPDATE; zero rows moved = no history row and no ping. */
/* ─────────────────────── who users/1001836… actually is ─────────────────── */

/** EVERY NAME WE HAVE EVER LEARNED, as `users/…` → "Ishita Goyal".
 *
 * Read whole because it is small — one row per colleague who has ever been
 * @-mentioned in a shared space, so it is the size of a team and not of a
 * conversation. Team migration 0049_chat_people argues why remembering is the
 * only route left: every endpoint Google offers for "who is this person" was
 * measured and came back without a name. */
export async function knownChatPeople(cfg: D1Rest, guard: MemberGuard): Promise<Map<string, string>> {
  const rows = await d1Query<{ user_id: string; display_name: string }>(
    cfg,
    guard.databaseId,
    // R14 hard cap: one row per person ever seen in a shared space; the ceiling
    // is far above any real team.
    `SELECT user_id, display_name FROM chat_people LIMIT ${LIST_HARD_CAP}`
  )
  return new Map(rows.map((r) => [r.user_id, r.display_name]))
}

/** REMEMBER WHAT A CONVERSATION JUST TAUGHT US.
 *
 * Idempotent by construction: the id is the primary key and a repeat is an
 * UPDATE of the same name, so sweeping the same space twice writes the same row
 * twice and changes nothing. The name is allowed to CHANGE — somebody who
 * marries and updates their Google profile should not stay under the old one —
 * which is why this is an upsert rather than an insert-if-absent. */
export async function rememberChatPeople(
  cfg: D1Rest,
  guard: MemberGuard,
  learned: Map<string, string>
): Promise<void> {
  const rows = [...learned].filter(([id, name]) => id && name)
  if (!rows.length) return
  const now = new Date().toISOString()
  // Bounded per call so one enormous page cannot build a statement past D1's
  // limits; the next sweep picks up whatever did not fit.
  for (const [id, name] of rows.slice(0, 100))
    await d1Query(
      cfg,
      guard.databaseId,
      `INSERT INTO chat_people (user_id, display_name, learned_at, learned_from)
       VALUES (${sqlString(id)}, ${sqlString(name)}, ${sqlString(now)}, 'mention')
       ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, learned_at = excluded.learned_at`
    )
}

export async function setNamedSourceActive(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  id: string,
  active: boolean
): Promise<boolean> {
  const before = await ownSourceOrThrow(cfg, guard, id)
  const now = new Date().toISOString()
  const changed = await d1Query<{ id: string }>(
    cfg,
    guard.databaseId,
    active
      ? `UPDATE google_sources SET deactivated_at = NULL, deactivator_id = NULL, deactivator_email = NULL,
            deactivator_name = NULL, updated_at = ?
          WHERE id = ? AND user_id = ? AND deactivated_at IS NOT NULL RETURNING id`
      : `UPDATE google_sources SET deactivated_at = ?, deactivator_id = ${sqlString(actor.id)},
            deactivator_email = ${sqlString(actor.email)}, deactivator_name = ${sqlString(actor.name)},
            updated_at = ?
          WHERE id = ? AND user_id = ? AND deactivated_at IS NULL RETURNING id`,
    active ? [now, id, guard.userId] : [now, now, id, guard.userId]
  )
  if (!changed[0]) return false
  await logActivity(cfg, guard.databaseId, actor, {
    type: active ? "Shared again" : "Sharing stopped",
    description: `${actor.name} ${active ? "shared" : "stopped sharing"} "${before.name}"`,
    relatedTable: "google_sources",
    relatedRowId: id,
  })
  return true
}

// ── the tokens ───────────────────────────────────────────────────────────────

/** The two encrypted columns, read by NOTHING above this line. */
type Secrets = {
  id: string
  refresh_token: string
  access_token: string | null
  access_expires_at: string | null
  /** NOT a secret either, and read here for the same reason as `scopes` below:
   * this is the one query on the way to using a connection, so the freshness of
   * the "last used" stamp can be decided without a second read. */
  last_used_at: string | null
  /** NOT a secret, and here because this is the one read that happens on the way
   * to using a connection. A door that needs a particular permission can then
   * check for it BEFORE spending a call on Google (`grantedScopeOrThrow`), which
   * is the difference between "your Gmail connection was made before kwapso
   * could do that" and a 403 the caller has to interpret. */
  scopes: string
}

async function liveSecrets(
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<Secrets | null> {
  const rows = await d1Query<Secrets>(
    cfg,
    guard.databaseId,
    // R14: one row by a unique index.
    `SELECT id, refresh_token, access_token, access_expires_at, scopes, last_used_at
       FROM google_connections
      WHERE user_id = ? AND service = ? AND deactivated_at IS NULL LIMIT 1`,
    [guard.userId, service]
  )
  return rows[0] ?? null
}

/** A minute of head-room, so a token that expires while a request is in flight
 * is refreshed before it is used rather than after it fails. */
const EXPIRY_SKEW_MS = 60_000

/**
 * A USABLE ACCESS TOKEN for the caller's own connection — the single door every
 * Google call in this worker goes through.
 *
 * Three things happen here and nowhere else: the caller's connection is found
 * (by THEIR user id, always), the stored token is decrypted, and an expired one
 * is refreshed and re-sealed. A caller above this line never sees a token and
 * never has to know whether it was fresh.
 *
 * A refusal from Google is RECORDED on the row before it is thrown. A grant
 * revoked in somebody's Google account is the most common failure this module
 * will ever have, and it is silent by nature: the person is not told, the app
 * just starts answering "nothing found". Writing it down is what turns that into
 * a red line on their own settings card.
 */
/** How out of date the "last used" stamp may get before a read moves it. Five
 * minutes is finer than any question a person asks of that field ("is this
 * working?", "did last night's sweep run?") and coarse enough that a sweep
 * making hundreds of reads writes once. */
const USED_STAMP_STALE_MS = 5 * 60 * 1000

function stale(lastUsedAt: string | null | undefined): boolean {
  if (!lastUsedAt) return true
  const at = Date.parse(lastUsedAt)
  return !Number.isFinite(at) || Date.now() - at > USED_STAMP_STALE_MS
}

/** Best-effort: a stamp that failed to move must never cost somebody the read it
 * was describing. */
async function touchUsed(cfg: D1Rest, guard: MemberGuard, id: string): Promise<void> {
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE google_connections SET last_used_at = ${sqlString(new Date().toISOString())}
      WHERE id = ${sqlString(id)};`
  ).catch(() => undefined)
}

export async function accessTokenFor(
  env: GoogleEnv,
  cfg: D1Rest,
  guard: MemberGuard,
  service: GoogleService
): Promise<{ token: string; connectionId: string; grantedScopes: string }> {
  const row = await liveSecrets(cfg, guard, service)
  if (!row)
    throw new GuardError(
      409,
      "google_not_connected",
      `Connect ${serviceLabel(service)} in Settings first, kwapso only ever uses your own account.`
    )
  const fresh =
    row.access_token &&
    row.access_expires_at &&
    Date.parse(row.access_expires_at) - EXPIRY_SKEW_MS > Date.now()
  if (fresh) {
    // AND THE FRESH PATH SAYS SO TOO, at most once every few minutes.
    //
    // Stamping only on the refresh left a working connection reading "Never used
    // yet" for up to an hour at a time — which is the exact sentence a dead one
    // shows, on the exact screen somebody checks when they suspect a dead one.
    // Stamping on EVERY read would put a database write on the hot path of a
    // sweep that makes hundreds, so it is conditional: the row was already read
    // a line above, so the comparison is free and the write only happens when
    // the answer would actually change.
    if (stale(row.last_used_at)) await touchUsed(cfg, guard, row.id)
    return {
      token: await openToken(env, row.access_token as string),
      connectionId: row.id,
      grantedScopes: row.scopes,
    }
  }

  const creds = connectCredentials(env)
  if (!creds)
    throw new GuardError(503, "google_not_ready", "Google connections aren't set up on this environment yet.")
  let tokens: GoogleTokens
  try {
    tokens = await refreshAccessToken(creds, await openToken(env, row.refresh_token))
  } catch (e) {
    await noteFailure(cfg, guard, row.id, e)
    throw e
  }
  await d1ExecScript(
    cfg,
    guard.databaseId,
    // `last_used_at` MOVES HERE TOO, and not only on a write.
    //
    // It was stamped by `recordGoogleAct` alone — which every WRITE door calls
    // and no read does — so it meant "last time kwapso put something INTO
    // Google". The settings card renders it as "Last used…" or "Never used
    // yet", and a person reads that as "is this connection working?".
    //
    // So a Chat connection that had answered several hundred reads in one night
    // sat on the screen saying "Never used yet", which is indistinguishable from
    // one that has never worked. On the morning of 20 Aug 2026 that mattered
    // more than usual: three connections really WERE dead, and the one that was
    // fine looked exactly the same. The whole lesson of that night was that a
    // screen telling a comfortable lie about a connection costs days.
    //
    // Here rather than on every read, because this write already exists — a
    // refresh happens about hourly under use and stamps nothing extra to do it.
    // The sentence it now tells is "the last time this connection successfully
    // produced a token", which is what the card was always trying to say.
    `UPDATE google_connections SET access_token = ${sqlString(await sealToken(env, tokens.accessToken))},
        access_expires_at = ${sqlString(tokens.expiresAt)}, last_error = NULL,
        last_used_at = ${sqlString(new Date().toISOString())}
      WHERE id = ${sqlString(row.id)};`
  )
  // THE STORED `scopes` IS WHAT CONSENT GRANTED, and it is not overwritten here
  // on purpose. A refresh response MAY carry `scope` and may leave it out, and
  // `redeem` reads an absent one as the empty string — so writing it back would
  // let an ordinary hourly refresh erase the record of what the person actually
  // approved, and every screen would then report the connection as missing
  // everything. What consent said is a fact with a date on it; a refresh is not
  // a new consent.
  return { token: tokens.accessToken, connectionId: row.id, grantedScopes: row.scopes }
}

/**
 * A DOOR NAMES THE PERMISSION IT NEEDS, and says so in words if it is missing.
 *
 * Without this, a scope added to the app after somebody connected shows up as a
 * 403 from Google, which `googleFetch` translates into "the connection may have
 * been removed in your Google account" — true about the status code and wrong
 * about the cause, pointing a person at a grant nobody has touched. It cost
 * CHECKLIST 14.5 an afternoon: filing a message under a label had been built,
 * driven and marked blocked, against a Gmail connection made before
 * `gmail.modify` was on the list.
 *
 * Checked BEFORE the call rather than after the refusal, because the honest
 * sentence is available before the call and the refusal never carries it.
 */
export function grantedScopeOrThrow(grantedScopes: string, needed: string, service: GoogleService): void {
  const held = grantedScopes.split(/\s+/).map((s) => s.trim())
  if (held.includes(needed)) return
  throw new GuardError(
    409,
    "google_scope_missing",
    `Your ${serviceLabel(service)} connection was made before kwapso could do that. Disconnect ${serviceLabel(service)} in Settings and connect it again.`
  )
}

/** Write down what Google said, so a broken grant is visible on the card instead
 * of only in an answer that quietly has nothing in it. Best-effort: a failure to
 * record must never replace the failure it was recording. */
async function noteFailure(cfg: D1Rest, guard: MemberGuard, id: string, e: unknown): Promise<void> {
  const message = e instanceof Error ? e.message : "Google refused the connection."
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE google_connections SET last_error = ${sqlString(message.slice(0, 300))}
      WHERE id = ${sqlString(id)};`
  ).catch(() => undefined)
}

/**
 * EVERY ACT kwapso PERFORMS IN GOOGLE LEAVES A ROW HERE.
 *
 * The base's rule is "keep an audit block on every write" (ARCHITECTURE §4), and
 * a write that lands in somebody else's system is the one that most needs it: a
 * mail we sent as Ana exists in Ana's Sent folder and nowhere in this product
 * unless this function is called. So each write door calls it, the connection's
 * `last_used_at` moves, and the sentence says what was done and to whom.
 *
 * It is also what makes those doors honest MUTATIONS under R1: they change a row
 * in this database, so they publish, so the card that says "last used" is live.
 */
export async function recordGoogleAct(
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  input: { connectionId: string; type: string; description: string }
): Promise<void> {
  await d1ExecScript(
    cfg,
    guard.databaseId,
    `UPDATE google_connections SET last_used_at = ${sqlString(new Date().toISOString())}, last_error = NULL
      WHERE id = ${sqlString(input.connectionId)};`
  )
  await logActivity(cfg, guard.databaseId, actor, {
    type: input.type,
    description: input.description,
    relatedTable: "google_connections",
    relatedRowId: input.connectionId,
  })
}

/** The word a person reads for each service. */
function serviceLabel(service: GoogleService): string {
  return { drive: "Drive", gmail: "Gmail", calendar: "Calendar", chat: "Google Chat" }[service]
}
