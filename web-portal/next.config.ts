import type { NextConfig } from "next"

// Mirrors web/next.config.ts — same build shape, different door. BUILD_STATIC=1
// switches on Next's static export (a plain `out/` folder) that the PORTAL
// gateway worker serves as assets. Left OFF in dev for the full dev server.
const staticExport = process.env.BUILD_STATIC
  ? { output: "export" as const, images: { unoptimized: true } }
  : {
      // Dev only: forward /api to the locally running workers, so signing in and
      // reading the client's world work on localhost exactly as they do behind
      // the deployed portal gateway. Only the prefixes the portal's door names.
      async rewrites() {
        // …OR AT A DEPLOYED ENVIRONMENT, when what you need is REAL ROWS. The
        // agency config has carried this since e31398fd and this one never did,
        // which made the portal the half of the product that could only be
        // looked at by deploying. It is the same flag, the same reasoning and
        // the same safety: dev-only by construction (this whole branch is the
        // non-BUILD_STATIC one), reads are ordinary GETs, and a WRITE from here
        // is refused by the CSRF check at the far door (the Origin will be
        // localhost). `/media/*` is forwarded too, because on this door that is
        // the file a client sent us.
        if (process.env.DEV_API_ORIGIN)
          return [
            { source: "/api/:path*", destination: `${process.env.DEV_API_ORIGIN}/api/:path*` },
            { source: "/media/:path*", destination: `${process.env.DEV_API_ORIGIN}/media/:path*` },
          ]
        return [
          { source: "/api/auth/:path*", destination: "http://127.0.0.1:8787/api/auth/:path*" },
          { source: "/api/tenancy/:path*", destination: "http://127.0.0.1:8788/api/tenancy/:path*" },
          { source: "/api/content/:path*", destination: "http://127.0.0.1:8789/api/content/:path*" },
        ]
      },
    }

const nextConfig: NextConfig = {
  // `transpilePackages: ["@kwapso/ui"]` used to sit here, because the library
  // arrived from GitHub as TypeScript SOURCE and node_modules is not transpiled
  // by default. The library now lives in `shared/ui/`, so it is not a package
  // and there is nothing to name: it is compiled by `externalDir` below.
  //
  // Lets us import the repo-level shared/ tree — the shapes, the two host seams
  // the laws say there may be only one of (FormShell, formatCount), and now the
  // component library itself. See tsconfig paths.
  experimental: { externalDir: true },
  ...staticExport,
}

export default nextConfig
