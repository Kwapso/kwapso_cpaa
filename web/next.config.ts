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
        // one, so nothing here can reach the shipped build. Reads are ordinary
        // GETs; a WRITE from here is refused by the CSRF check at the far door
        // (shared/workers/front-door.ts — the Origin will be localhost), which
        // is the correct answer and worth knowing before you try.
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
  ...staticExport,
}

export default nextConfig
