// kwapso GATEWAY — the one front door. Serves the app's screens (static
// assets), uploaded media from R2, and passes every /api request to the right
// worker behind it. Same address for screens and brains = login cookies just
// work everywhere. This is also where the MCP front desk will live.

// The four things BOTH front doors do identically — refuse a write another site
// started, serve an uploaded file (with its key validated at the boundary and its
// security headers), record a client crash, and answer their own crash without
// leaking a raw 1101. One implementation, so a hardening change cannot reach one
// door and miss the other.
import {
  recordClientError,
  recordGatewayCrash,
  refuseForeignOrigin,
  serveMedia,
  isRead,
} from "@shared/workers/front-door"
import { fail } from "@shared/workers/http"
import { requestId, stampTrace } from "@shared/workers/trace"

/** The top-level module pages that are CLIENT-RESOLVED SHELLS: /stories is a real
 * static file, but /stories/<id> is the same shell with the id read off
 * window.location, so any depth under one of these must be served the module's
 * own shell instead of the 404 page.
 *
 * IT IS EXPORTED BECAUSE IT IS HALF A CONTRACT. The other half is
 * `assets.run_worker_first` in wrangler.jsonc: that field is an ARRAY, and an
 * array means every path NOT listed skips this Worker entirely and is answered by
 * the asset layer. So a module named here but missing there never reaches the
 * loop below — the asset layer 404s /tickets/<id> before we see it, which is
 * exactly what a tester hit when they shared a ticket link. The list stood at two
 * prefixes, one of them a `/help/*` that is not even a URL segment in this app,
 * while this loop had grown to fifteen modules. test/shell-routing.test.ts reads
 * both off disk and holds them together. */
export const SHELL_MODULES = [
  "accounts", "tickets", "knowledge", "processes",
  // THE WORK ENGINE'S FOUR. `work` became `stories` when the sprints moved
  // out to a page of their own — the segment follows the heading, because a
  // URL that disagrees with the title on the page is a cost paid for ever.
  "stories", "sprints", "waves", "apps", "tasks",
  // TIME — the destination a work log never had. No records of its own (a
  // row of time is only ever read in a list of its neighbours), but it is
  // forwarded like the rest so the shell survives a reload at any depth.
  "time",
  // Meetings. A sidebar page with records of its own, so it needs the shell
  // at every depth for the same reason the four above it do.
  "meetings",
  // The agency's own housekeeping. `purposes` is here even though it is a
  // CONTEXTUAL section rather than a sidebar one: it still has records with
  // their own URLs, and a deep link that 404s on reload is a deep link whether
  // or not the nav rail offers it. `processes` above is here for exactly the
  // same reason, and became contextual on the same day.
  "brand", "purposes",
]

type Env = {
  ASSETS: Fetcher
  AUTH: Fetcher
  TENANCY: Fetcher
  REALTIME: Fetcher
  CONTENT: Fetcher
  DATAOPS: Fetcher
  MCP: Fetcher
  MEDIA: R2Bucket
  LEARNING_MEDIA: R2Bucket
  /** the agency's own files — brand assets, staff photos, certificate PDFs. */
  INTERNAL_MEDIA: R2Bucket
  /** shared secret for auth's /internal/* doors (same value as auth/tenancy/content). */
  INTERNAL_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // THE NAME IS GIVEN HERE, at the door, once — this is the only place on the
    // agency side that knows a request has begun. Everything below forwards it,
    // and every worker behind it re-reads the same id instead of minting its
    // own, so one failing click is one query in `error_logs` rather than eight
    // rows nobody can line up. See shared/workers/trace.ts.
    const traced = stampTrace(request, requestId(request))
    try {
      return await handle(traced, env)
    } catch (e) {
      return recordGatewayCrash(traced, env.AUTH, "gateway", env.INTERNAL_KEY, e)
    }
  },
} satisfies ExportedHandler<Env>

async function handle(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    // CROSS-SITE WRITES DIE HERE, in front of every forward below — the session
    // cookie is SameSite=Lax, and "site" is kwapso.app, which we share with a
    // third-party app on portal.kwapso.app. See refuseForeignOrigin: a browser
    // always announces itself on a non-GET, and a script never does.
    const foreign = refuseForeignOrigin(request)
    if (foreign) return foreign

    if (pathname.startsWith("/api/auth/")) return env.AUTH.fetch(request)
    if (pathname.startsWith("/api/tenancy/")) return env.TENANCY.fetch(request)
    // Content modules (Learning, Tickets) and data-ops (import + the AI agent).
    if (pathname.startsWith("/api/content/")) return env.CONTENT.fetch(request)
    if (pathname.startsWith("/api/data-ops/")) return env.DATAOPS.fetch(request)
    // The MCP front desk: token management (session-gated) + the MCP endpoint
    // itself (bearer-token-gated JSON-RPC) — ARCHITECTURE "gateway / MCP".
    if (pathname.startsWith("/api/mcp/")) return env.MCP.fetch(request)
    if (pathname === "/mcp") return env.MCP.fetch(request)
    // Live channels (WebSocket upgrade + health) → the realtime switchboard.
    if (pathname.startsWith("/api/realtime")) return env.REALTIME.fetch(request)

    // Client error beacon → console + the central error_logs table (the shared
    // seam does the session verification; see shared/workers/front-door.ts).
    if (pathname === "/api/log/client" && request.method === "POST")
      return recordClientError(request, env.AUTH, "web", env.INTERNAL_KEY)

    if (pathname.startsWith("/api/")) {
      return fail(404, "not_found", "No such API.")
    }

    // A RANGE, IF THEY ASKED FOR ONE. Read once for all three buckets below: an
    // attachment may be a 25 MB video, and without this a player's seek re-fetched
    // the whole object from byte zero. serveMedia decides what a range means; this
    // only hands it the header.
    const range = request.headers.get("Range")

    // ── Uploaded media: a CAPABILITY URL, on purpose ───────────────────────
    // No session, no membership check — a recorded, deliberate decision whose
    // reasoning (and the fork warning that goes with it) lives on serveMedia in
    // shared/workers/front-door.ts, which also validates the key at the boundary.

    // THE BYTES THAT OUTLIVED THEIR MODULE. Learning was purged on 17 Aug 2026,
    // but its 41 articles had already been indexed into the knowledge base and
    // their bodies still name the images and clips that were uploaded with them.
    // Nothing writes to this bucket any more — the upload doors went with the
    // module — and this route stays so that what was written before it can still
    // be read. Same serving shape as /media/* below; just a different bucket,
    // matched first since it's a more specific prefix.
    if (pathname.startsWith("/media/learning/") && isRead(request.method))
      return serveMedia(env.LEARNING_MEDIA, pathname, "/media/learning/", range, request.method)

    // The agency's own files — brand assets, staff photos, certificate PDFs.
    // Its own bucket, matched before the generic prefix for the same reason the
    // one above is: a more specific prefix has to win, or every internal URL
    // would be looked up in the wrong bucket and 404.
    //
    // ON THE AGENCY DOOR ONLY. The client portal serves no /media/internal/ path
    // at all, so a capability URL that leaked into a client's hands would have
    // nowhere to be redeemed — which is the same shape as the API refusal one
    // layer up, said in routing instead of in a gate.
    if (pathname.startsWith("/media/internal/") && isRead(request.method))
      return serveMedia(env.INTERNAL_MEDIA, pathname, "/media/internal/", range, request.method)

    // Uploaded files (profile photos, team logos). URLs carry ?v= for cache
    // busting, so the file itself can be cached hard.
    if (pathname.startsWith("/media/") && isRead(request.method))
      return serveMedia(env.MEDIA, pathname, "/media/", range, request.method)

    // Deep-link tree: /t/<teamId>/<module>/<id>/… is ONE client-resolved screen.
    // Static export emits a single shell (t.html), so serve it for ANY /t/* depth
    // (the browser keeps the real URL; web/app/t/[[...path]] parses it client-side
    // and re-checks permissions — see SCREEN-ENGINE-PLAN §10). Without this, an
    // unknown /t/* path would hit the 404 page.
    if (pathname.startsWith("/t/")) {
      // Fetch the CLEAN path (/t), not /t.html — Static Assets canonicalizes
      // .html → clean URL with a 307, which would otherwise leak to the client.
      const shell = new URL(request.url)
      shell.pathname = "/t"
      return env.ASSETS.fetch(new Request(shell, request))
    }

    // Top-level module pages (/accounts, /tickets, /knowledge) are ALSO client-resolved
    // deep-link shells (their own clean URLs, active team from context). Serve the
    // module's shell for any sub-path (e.g. /accounts/<id>); the bare /accounts is a
    // real static file served below.
    for (const mod of SHELL_MODULES) {
      if (pathname.startsWith(`/${mod}/`)) {
        const shell = new URL(request.url)
        shell.pathname = `/${mod}`
        return env.ASSETS.fetch(new Request(shell, request))
      }
    }

    // Static screens/assets. Long-cache headers for the content-hashed
    // /_next/static/** files are set in web/public/_headers — Workers Static
    // Assets serves matching files BEFORE this Worker runs, so per-asset headers
    // must live in _headers, not here.
    return env.ASSETS.fetch(request)
}
