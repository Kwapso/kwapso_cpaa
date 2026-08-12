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
} from "@shared/workers/front-door"
import { fail } from "@shared/workers/http"

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
  /** shared secret for auth's /internal/* doors (same value as auth/tenancy/content). */
  INTERNAL_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (e) {
      return recordGatewayCrash(request, env.AUTH, "gateway", env.INTERNAL_KEY, e)
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

    // ── Uploaded media: a CAPABILITY URL, on purpose ───────────────────────
    // No session, no membership check — a recorded, deliberate decision whose
    // reasoning (and the fork warning that goes with it) lives on serveMedia in
    // shared/workers/front-door.ts, which also validates the key at the boundary.

    // Learning attachments (images + short clips uploaded to a how-to article)
    // live in their own per-team bucket. Same serving shape as /media/* below;
    // just a different bucket, matched first since it's a more specific prefix.
    if (pathname.startsWith("/media/learning/") && request.method === "GET")
      return serveMedia(env.LEARNING_MEDIA, pathname, "/media/learning/")

    // Uploaded files (profile photos, team logos). URLs carry ?v= for cache
    // busting, so the file itself can be cached hard.
    if (pathname.startsWith("/media/") && request.method === "GET")
      return serveMedia(env.MEDIA, pathname, "/media/")

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

    // Top-level module pages (/accounts, /learning, /tickets) are ALSO client-resolved
    // deep-link shells (their own clean URLs, active team from context). Serve the
    // module's shell for any sub-path (e.g. /accounts/<id>); the bare /accounts is a
    // real static file served below.
    for (const mod of ["accounts", "learning", "tickets", "knowledge"]) {
    for (const mod of ["accounts", "learning", "tickets", "processes"]) {
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
