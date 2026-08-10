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
        return [
          { source: "/api/auth/:path*", destination: "http://127.0.0.1:8787/api/auth/:path*" },
          { source: "/api/tenancy/:path*", destination: "http://127.0.0.1:8788/api/tenancy/:path*" },
          { source: "/api/content/:path*", destination: "http://127.0.0.1:8789/api/content/:path*" },
        ]
      },
    }

const nextConfig: NextConfig = {
  // The Swift Struck UI library ships as TypeScript SOURCE from GitHub, so Next
  // must compile it the same way it compiles our own files.
  transpilePackages: ["@kwapso/ui"],
  // Lets us import the repo-level shared/ types AND the two host seams the laws
  // say there may be only one of (FormShell, formatCount) — see tsconfig paths.
  experimental: { externalDir: true },
  ...staticExport,
}

export default nextConfig
