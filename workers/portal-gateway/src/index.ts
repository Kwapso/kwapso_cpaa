// kwapso PORTAL GATEWAY — the CLIENT portal's one public address (SCOPE ch.04,
// "two front doors, one building"). It serves the portal's screens and passes a
// NAMED, closed set of /api calls to the same workers the agency app uses. Same
// origin for screens and brains, so the session cookie just works.
//
// HOW THIS DIFFERS FROM THE AGENCY GATEWAY, and why it matters.
//
// The agency gateway forwards by PREFIX: /api/tenancy/* goes to tenancy, whole.
// That is right for a surface whose users are the agency. It is wrong here. A
// prefix forward on this door would publish EVERY tenancy route to the client
// internet — roles, invites, members, dropdown values, the screen-recipe
// overrides, the admin doors — plus data-ops (import + the assistant) and the
// MCP endpoint. Each of those still gates on a role right, so a prefix forward
// would probably hold. "Probably holds" is not a front door. One misconfigured
// client role, one new route that lands ungated for an hour, and the portal is
// the way in.
//
// So this gateway is an ALLOW-LIST, keyed the way the domain workers key their
// own route tables: `METHOD /path` → the worker behind it. Anything not named
// below is 404, including every /api/data-ops/* and /mcp path. Adding a door to
// the portal is a deliberate line in this file — and the portal-fence test reads
// this table off disk, so a read added here must ALSO carry the account fence
// (shared/workers/account-scope.ts) or the build goes red.
//
// The fence itself is NOT re-implemented here. This worker never decides who may
// see what; it only decides which questions may be asked. Every answer comes
// from a door that already resolves the caller's account set.

// The four things BOTH front doors do identically — refuse a write another site
// started, serve an uploaded file (with its key validated at the boundary and its
// security headers), record a client crash, and answer their own crash without
// leaking a raw 1101. ONE implementation, deliberately: this door's media serving
// was once written a second time from memory and shipped without the key check the
// agency door had carried for weeks.
import {
  recordClientError,
  recordGatewayCrash,
  refuseForeignOrigin,
  serveMedia,
} from "@shared/workers/front-door"
import { fail } from "@shared/workers/http"

/** The workers a portal door may be forwarded to. */
type Upstream = "AUTH" | "TENANCY" | "CONTENT" | "REALTIME"

/**
 * THE PORTAL SURFACE — every door a client login may knock on, and nothing else.
 * Read off disk by workers/portal-gateway/test/portal-door.test.ts (the closed-
 * door suite) and by web-portal/test/portal-fence.test.ts (which walks each READ
 * through to the lib function behind it and demands the fence).
 *
 * Deliberately ABSENT, each for a reason:
 *   • /api/tenancy/{roles,members,invites,selectable,config,admin,team*} — the
 *     agency's own machinery; a client has no business seeing it exists.
 *   • /api/tenancy/portal-users + /api/tenancy/accounts (writes) — granting a
 *     login and editing the books are staff decisions (SCOPE ch.03).
 *   • /api/content/learning — the team's how-to articles are INTERNAL and carry
 *     no account fence; publishing them here would be a disclosure, not a
 *     feature (see the report / ROADMAP note).
 *   • /api/content/help/stakeholders — a stakeholder list names the staff on a
 *     ticket. "The portal shows work status but never which staff member is
 *     doing it" (SCOPE ch.06).
 *   • /api/data-ops/* and /mcp — import, the assistant and the machine surface
 *     are agency tools. The portal spends none of the team's AI allowance.
 */
export const PORTAL_DOORS: Record<string, Upstream> = {
  // ── identity ───────────────────────────────────────────────────────────────
  // Sign-in is the SAME auth worker the agency uses: one person, one login,
  // whichever door they came through. Invite-only is absolute — none of these
  // routes creates access; they only prove who you already are.
  "POST /api/auth/email/start": "AUTH",
  "POST /api/auth/email/verify": "AUTH",
  // "Continue with Google" — the same two halves the agency app opens, named
  // here DELIBERATELY rather than inherited, because this file names everything.
  // Both are GET: Google's flow is a browser redirect, and the callback is the
  // address Google itself sends the browser to, so it has to answer at THIS
  // hostname (it is registered with Google separately from the agency's). A
  // client login proves the same identity through the same auth worker either
  // way; what it may then SEE is decided by every other door on this list.
  "GET /api/auth/google/start": "AUTH",
  "GET /api/auth/google/callback": "AUTH",
  "GET /api/auth/me": "AUTH",
  "POST /api/auth/profile": "AUTH",
  "POST /api/auth/logout": "AUTH",

  // ── the client's own world (every read fenced by the caller's account set) ──
  // NOT here, and worth recording: `GET /api/tenancy/active`. The portal wanted
  // it for one field — the team id the live channel is keyed by — and it answers
  // with the agency's team name, logo, the caller's role title and the agency's
  // MEMBER COUNT. None of that is a client's business, and `/api/auth/me`
  // already carries the same team id. The fence guard asked the question; the
  // answer was to close the door rather than write an exemption for it.
  //
  // The switcher: where this person may stand, and where they stand now.
  "GET /api/tenancy/portal/context": "TENANCY",
  "POST /api/tenancy/portal/switch-account": "TENANCY",
  // Their company and the people in it. Both doors resolve the account set
  // first and build every statement from it.
  "GET /api/tenancy/accounts": "TENANCY",
  "GET /api/tenancy/accounts/detail": "TENANCY",

  // ── tickets ────────────────────────────────────────────────────────────────
  // A client raises tickets and follows their COMPANY's. The list, the count and
  // the thread are all pinned by the ticket fence to the account they are standing
  // in and everything nested beneath it — the same fence as the accounts doors
  // above, reading the account a ticket was raised for.
  "GET /api/content/help": "CONTENT",
  "GET /api/content/help/thread": "CONTENT",
  "POST /api/content/help": "CONTENT",
  "POST /api/content/help/reply": "CONTENT",
  // EDIT AND RE-RANK, the two things SCOPE ch.07 says the account owns. Both are
  // governed by the LOCK rather than by this table: a client may correct their
  // own question and drag their company's requests into the order they want
  // them in, right up until a staff member reads one. The doors that would move
  // a ticket ALONG its lifecycle — status, bulk-status, archive — are absent
  // here AND refuse a portal caller at the door, because "resolved" is our word
  // and there is no client-side reopen button.
  "POST /api/content/help/update": "CONTENT",
  "POST /api/content/help/rank": "CONTENT",

  // ── what we are waiting on them for ────────────────────────────────────────
  // The only rows in the work engine a client writes to. They read their own
  // company's and complete one, with the file we asked for. Raising and
  // withdrawing are ours (`todos:create` / `todos:delete`), and both refuse a
  // portal caller at the door as well as being absent from this list.
  "GET /api/content/todos": "CONTENT",
  "POST /api/content/todos/complete": "CONTENT",

  // ── what they bought ───────────────────────────────────────────────────────
  // Sprints as named blocks with dates and two counts. NOT the agency's sprint
  // door — a different shape, with nowhere to put a price and no story titles in
  // it at all.
  "GET /api/content/portal/delivery": "CONTENT",

  // ── the value, and the conversation about it ───────────────────────────────
  // THREE doors, and the list of what is NOT here is the point. `/value` answers
  // with the savings drilled App → Process → Step for the accounts this caller
  // may see, plus — only when the owner has switched price visibility on for that
  // account — what they bought. The process LIST and DETAIL doors are absent: a
  // client reads their value and talks about it, they do not browse the agency's
  // map inventory. Every money door is absent, `/api/tenancy/margin` and
  // `/api/tenancy/internal-rates` most of all: those are the agency's own books,
  // refused at the door as well as unnamed here, and R23 fails the build if a
  // line for one of them ever appears in this table.
  "GET /api/tenancy/value": "TENANCY",
  "GET /api/tenancy/processes/comments": "TENANCY",
  "POST /api/tenancy/processes/comments": "TENANCY",

  // ── live ───────────────────────────────────────────────────────────────────
  // The WebSocket upgrade. The realtime worker re-checks membership on the
  // handshake with the same rule the API uses, so this is a pass-through.
  "GET /api/realtime": "REALTIME",
}

type Env = {
  ASSETS: Fetcher
  AUTH: Fetcher
  TENANCY: Fetcher
  CONTENT: Fetcher
  REALTIME: Fetcher
  MEDIA: R2Bucket
  /** shared secret for auth's /internal/* doors (same value as auth/tenancy/content). */
  INTERNAL_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (e) {
      return recordGatewayCrash(request, env.AUTH, "portal-gateway", env.INTERNAL_KEY, e)
    }
  },
} satisfies ExportedHandler<Env>

async function handle(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    // CROSS-SITE WRITES DIE HERE, in front of the allow-list below — the SAME
    // check the agency door runs, from the same function, because the cookie
    // both doors mint is the same cookie and the site it is loose on is the same
    // site. See refuseForeignOrigin.
    const foreign = refuseForeignOrigin(request)
    if (foreign) return foreign

    // The client error beacon → console AND the central error_logs table, the
    // same never-swallow seam the agency door uses (ERROR-HANDLING.md). The only
    // thing that differs is the label on the row.
    if (pathname === "/api/log/client" && request.method === "POST")
      return recordClientError(request, env.AUTH, "portal", env.INTERNAL_KEY)

    if (pathname.startsWith("/api/") || pathname === "/mcp") {
      const upstream = PORTAL_DOORS[`${request.method} ${pathname}`]
      // FAIL CLOSED, and say nothing useful. An unnamed door is "no such API" —
      // the same sentence the agency gateway gives a genuinely absent route, so
      // this surface never becomes an oracle for what the agency app can do.
      if (!upstream) return fail(404, "not_found", "No such API.")
      return env[upstream].fetch(request)
    }

    // Uploaded files (a company's logo, a person's photo). URLs carry ?v= for
    // cache busting, so the file itself can be cached hard. Same capability-URL
    // decision, same boundary validation, same headers as the agency door — one
    // function, so it cannot be otherwise.
    if (pathname.startsWith("/media/") && request.method === "GET")
      return serveMedia(env.MEDIA, pathname, "/media/")

    // The tickets tree: /tickets/<ticketId> is ONE client-resolved screen. The
    // static export emits a single shell, so serve it for any /tickets/* depth
    // (the browser keeps the real URL; the page parses it client-side). Without
    // this, a deep link a client was emailed would 404 before the worker saw it
    // — the static-export reload trap, EDGE-CASES.md.
    if (pathname.startsWith("/tickets/")) {
      const shell = new URL(request.url)
      shell.pathname = "/tickets"
      return env.ASSETS.fetch(new Request(shell, request))
    }

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web-portal/public/_headers — Workers
    // Static Assets serves matching files BEFORE this Worker runs, so per-asset
    // headers must live there, not here.
    return env.ASSETS.fetch(request)
}
