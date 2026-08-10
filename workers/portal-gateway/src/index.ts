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

// The two things BOTH front doors do identically — serve an uploaded file (with
// its key validated at the boundary and its security headers) and record a
// client crash. ONE implementation, deliberately: this door's media serving was
// once written a second time from memory and shipped without the key check the
// agency door had carried for weeks.
import { recordClientError, serveMedia } from "../../../shared/workers/front-door"
import { fail } from "../../../shared/workers/http"
import { safeMediaKey } from "../../../shared/workers/image"

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

  // ── support ────────────────────────────────────────────────────────────────
  // A client raises tickets and follows their own. The list, the count and the
  // thread are all pinned to the caller by the help fence.
  "GET /api/content/help": "CONTENT",
  "GET /api/content/help/thread": "CONTENT",
  "POST /api/content/help": "CONTENT",
  "POST /api/content/help/reply": "CONTENT",

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
      // A public door must never answer a stranger with Cloudflare's raw 1101.
      // This worker binds no database, so the crash goes out the same internal
      // pipe the client beacon uses — best-effort, because a door that cannot
      // report is still a door that must answer.
      console.error("portal_gateway_error", new URL(request.url).pathname, e)
      await env.AUTH.fetch("https://internal/internal/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": env.INTERNAL_KEY ?? "" },
        body: JSON.stringify({
          source: "portal-gateway",
          place: new URL(request.url).pathname,
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        }),
      }).catch(() => null)
      return fail(500, "server_error", "Something went wrong.")
    }
  },
} satisfies ExportedHandler<Env>

async function handle(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

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

    // The support tree: /support/<ticketId> is ONE client-resolved screen. The
    // static export emits a single shell, so serve it for any /support/* depth
    // (the browser keeps the real URL; the page parses it client-side). Without
    // this, a deep link a client was emailed would 404 before the worker saw it
    // — the static-export reload trap, EDGE-CASES.md.
    if (pathname.startsWith("/support/")) {
      const shell = new URL(request.url)
      shell.pathname = "/support"
      return env.ASSETS.fetch(new Request(shell, request))
    }

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web-portal/public/_headers — Workers
    // Static Assets serves matching files BEFORE this Worker runs, so per-asset
    // headers must live there, not here.
    return env.ASSETS.fetch(request)
}
