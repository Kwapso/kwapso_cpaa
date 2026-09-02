import type { NextConfig } from "next"

// BUILD_STATIC=1 switches on Next's static export (a plain `out/` folder) that
// the gateway worker serves as assets. Left OFF in dev for the full dev server.
const staticExport = process.env.BUILD_STATIC
  ? { output: "export" as const, images: { unoptimized: true } }
  : {
      // Dev only: forward /api to the locally running auth worker
      // (`npm run dev:auth` → wrangler dev on :8787) so login works on
      // localhost exactly like it does behind the deployed gateway.
      async rewrites() {
        // …OR AT A DEPLOYED ENVIRONMENT, when what you need is REAL ROWS.
        //
        // The local rewrites below need four wrangler processes and a seeded
        // database, which is the right answer for working on a door. It is the
        // wrong answer for the question "does this screen actually show the
        // owner's two screenshots" — that one needs HIS data, and the only ways
        // to see it were to deploy the branch or to take somebody's word for it.
        // Both are how a screen ships looking finished. `DEV_API_ORIGIN=<origin>
        // npm run dev` points every door and `/media/*` at a deployed
        // environment instead, so a branch can be LOOKED at before it is merged.
        //
        // Dev only, by construction: this whole branch is the non-BUILD_STATIC
        // one, so nothing here can reach the shipped build.
        //
        // AND HERE IS ITS BLIND SPOT, named beside the benefit rather than
        // discovered later. Reads are ordinary GETs and work. A WRITE does not:
        // the far door's CSRF check refuses it 403 `foreign_origin`, because the
        // browser sends `Origin: http://localhost:3000` and
        // `shared/workers/front-door.ts` compares it to its own. Proved, both
        // ways — a real POST came back 403 and a census of every row afterwards
        // showed nothing had been written.
        //
        // That refusal is the property that makes this safe to have, and it is
        // also exactly what this tool CANNOT verify: any path whose bug lives in
        // a browser write is invisible here. On the lane that added this, the
        // story edit dialog's upload path was precisely such a path — it was
        // verified by reading rows out of the door with curl instead, and the
        // one defect this tool could not have caught was found by a person. Use
        // it to see what a screen SHOWS; do not mistake it for coverage of what
        // a screen DOES.
        if (process.env.DEV_API_ORIGIN)
          return [
            { source: "/api/:path*", destination: `${process.env.DEV_API_ORIGIN}/api/:path*` },
            { source: "/media/:path*", destination: `${process.env.DEV_API_ORIGIN}/media/:path*` },
          ]
        return [
          { source: "/api/auth/:path*", destination: "http://127.0.0.1:8787/api/auth/:path*" },
          { source: "/api/tenancy/:path*", destination: "http://127.0.0.1:8788/api/tenancy/:path*" },
          // …and the content worker, which web-portal's config has always
          // forwarded and this one never did. It is not a new capability, it is
          // a gap: the agency app's Accounts, Tickets and Knowledge screens are
          // ALL /api/content, so none of them could be opened on localhost while
          // the portal's could. Found while verifying the knowledge page by hand
          // — which is the point of verifying by hand.
          { source: "/api/content/:path*", destination: "http://127.0.0.1:8789/api/content/:path*" },
          // /media/* has no local server (the gateway serves it when deployed)
          // — avatars gracefully fall back to initials in dev.
        ]
      },
    }

const nextConfig: NextConfig = {
  // `transpilePackages: ["@kwapso/ui"]` used to sit here, because the library
  // arrived from GitHub as TypeScript SOURCE and node_modules is not transpiled
  // by default. The library now lives in `shared/ui/`, so it is not a package
  // and there is nothing to name: it is compiled by `externalDir` below, on the
  // same line as every other repo-level file the app imports.
  //
  // Lets us import the repo-level shared/ tree — the shapes, the host seams, and
  // now the component library itself.
  experimental: { externalDir: true },
  // NEXT_DIST_DIR — an isolated `.next` for a one-off dev server run beside
  // an already-running one on the same checkout. Several agent sessions can
  // each be running `next dev` against this same `web/` at once, and every
  // one of them defaults to `web/.next`: two writers on one build cache
  // stepped on each other mid-session (2026-08-31) — ENOENT on
  // `app-paths-manifest.json`, then on `_not-found/page.js` — corrupting
  // BOTH servers rather than just the newer one. Unset (the default), this
  // changes nothing. Set to a scratch path for a throwaway verification
  // server and it gets its own cache, so it can't corrupt or be corrupted by
  // a sibling dev server reading the default `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  ...staticExport,
}

export default nextConfig
