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
import { requestId, stampTrace } from "@shared/workers/trace"

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
 *   • /api/content/brand-assets + /api/content/delivery/* — the agency's own
 *     material and the taxonomy of why it meets are INTERNAL and carry no
 *     account fence; publishing either here would be a disclosure, not a
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
  // A contact choosing the language they read their own portal in. On the
  // allow-list deliberately: SCOPE's point about the portal is that a client
  // sees their world in their own words, and the door touches exactly one column
  // on the caller's own user row. It reveals nothing about the agency and
  // nothing about any other account.
  "POST /api/auth/language": "AUTH",
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
  // SHOWING US WHAT THEY MEAN (CHECKLIST 5.10). Several files and several links
  // on one ticket, "from BOTH front doors" — a screenshot of the thing that is
  // wrong is the client's half of a support conversation, and they had no way to
  // send one. The file goes into the SHARED media bucket, which this gateway
  // already serves at /media/*, so they can read their own back.
  "GET /api/content/help/attachments": "CONTENT",
  "POST /api/content/help/attachments": "CONTENT",
  "POST /api/content/help/attachments/remove": "CONTENT",
  // THE ONE LIFECYCLE DOOR A CLIENT MAY PUSH (CHECKLIST 5.13, Aurora's ap2). An
  // extra, a request or a piece of feedback waits for the company that pays for
  // it to confirm they want it — a question or an issue never waits at all. It is
  // the deliberate exception to the paragraph above, and it is narrow by
  // construction rather than by this table: the account fence rides its UPDATE,
  // and R17's predicate means the ONLY move it can make is
  // awaiting_validation → new. It cannot reopen, resolve, or touch a request
  // somebody here has already started.
  "POST /api/content/help/validate": "CONTENT",

  // ── what we are waiting on them for ────────────────────────────────────────
  // The only rows in the work engine a client writes to. They read their own
  // company's and complete one, with the file we asked for. Raising and
  // withdrawing are ours (`todos:create` / `todos:delete`), and both refuse a
  // portal caller at the door as well as being absent from this list.
  "GET /api/content/todos": "CONTENT",
  "POST /api/content/todos/complete": "CONTENT",

  // ── what we handed over ────────────────────────────────────────────────────
  // The owner, 18 August 2026, asked whether a client should see deliverables:
  // "yes of course.. the deliverables are for them! but only once we mark it as
  // visible yeah?" — a yes with a condition, and the condition is PER ROW.
  //
  // So this is ONE line, and it is not the agency's read. `GET
  // /api/content/deliverables` — the shelf on one app, with our own staff names
  // on every card and the archived rows still in it — is deliberately still
  // absent, and still refuses a client login at the door. The line below opens a
  // door of its own that takes NO parameters and answers exactly one question:
  // what has been shared with the company this caller is standing in. Two
  // clauses decide it and both are on the server — their account fence, and
  // `visible_to_client_at IS NOT NULL`.
  "GET /api/content/portal/deliverables": "CONTENT",

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
  // refused at the door as well as unnamed here, and R24 fails the build if a
  // line for one of them ever appears in this table.
  // WHICH SECTION OF THEIR APP a ticket is about. The READ only, and it is the
  // one module door on this surface: a client picks a section when they raise a
  // request ("it's not difficult to identify the module — most of the times it's
  // the active page on the sidebar"), and the fence on the door is their own
  // account's, so this answers with the sections of their systems and nobody
  // else's. The three WRITES are absent and refuse a portal caller at the door
  // besides: a client files tickets AGAINST the structure of the software we
  // built them, they do not author it, exactly as they do not author the app.
  "GET /api/tenancy/app-modules": "TENANCY",

  "GET /api/tenancy/impact": "TENANCY",
  "GET /api/tenancy/processes/comments": "TENANCY",
  "POST /api/tenancy/processes/comments": "TENANCY",

  // ── live ───────────────────────────────────────────────────────────────────
  // The WebSocket upgrade. The realtime worker re-checks membership on the
  // handshake with the same rule the API uses, so this is a pass-through.
  "GET /api/realtime": "REALTIME",
}

/** The portal paths that are CLIENT-RESOLVED SHELLS: /tickets is a real static
 * file, but /tickets/<id> is the same shell with the id read off
 * window.location, so any depth under one of these must be served the shell
 * instead of the 404 page.
 *
 * IT IS EXPORTED BECAUSE IT IS HALF A CONTRACT — the same half the agency
 * gateway's own SHELL_MODULES is. The other half is `assets.run_worker_first`
 * in wrangler.jsonc: that field is an ARRAY, and an array means every path NOT
 * listed skips this Worker entirely and is answered by the asset layer, which
 * with `not_found_handling: "404-page"` is a 404.
 *
 * THIS EXACT FAULT SHIPPED TWICE. The agency door had it on 17 Aug 2026 — the
 * array named a `/help/*` that was not a URL segment in the app — and it was
 * fixed and locked with a test the same day. The portal was never given that
 * test, and its array still read `/support/*`, a path that appears NOWHERE in
 * this codebase but here. So the handler forwarded /tickets/* and the asset
 * layer 404'd it first, and the only reason it looked fine is that clicking a
 * ticket in the app never leaves the page. A RELOAD, a pasted link, and every
 * ticket-notification email a client has ever received all landed on the 404
 * page (shared/workers/record-link.ts builds them as `/tickets/<id>`).
 *
 * test/shell-routing.test.ts now reads both halves off disk, in every
 * environment, because wrangler envs do not inherit a parent's assets block. */
export const SHELL_MODULES = ["tickets"]

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
    // The client door names its requests too, from the same seam and for the
    // same reason as the agency door — a client's failing click crosses just as
    // many workers, and "which hop broke" is the same question. The label on the
    // `error_logs` row differs; the thread joining the rows does not.
    const traced = stampTrace(request, requestId(request))
    try {
      return await handle(traced, env)
    } catch (e) {
      return recordGatewayCrash(traced, env.AUTH, "portal-gateway", env.INTERNAL_KEY, e)
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
      // A RANGE, IF THEY ASKED FOR ONE — the same seekable, resumable serving the
      // agency door gives, because it is the same function.
      return serveMedia(env.MEDIA, pathname, "/media/", request.headers.get("Range"))

    // The tickets tree: /tickets/<ticketId> is ONE client-resolved screen. The
    // static export emits a single shell, so serve it for any /tickets/* depth
    // (the browser keeps the real URL; the page parses it client-side). Without
    // this, a deep link a client was emailed would 404 before the worker saw it
    // — the static-export reload trap, EDGE-CASES.md.
    for (const mod of SHELL_MODULES) {
      if (pathname.startsWith(`/${mod}/`)) {
        const shell = new URL(request.url)
        shell.pathname = `/${mod}`
        return env.ASSETS.fetch(new Request(shell, request))
      }
    }

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web-portal/public/_headers — Workers
    // Static Assets serves matching files BEFORE this Worker runs, so per-asset
    // headers must live there, not here.
    return env.ASSETS.fetch(request)
}
