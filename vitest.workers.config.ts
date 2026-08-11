import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// THE ONE VITEST CONFIG THE EIGHT WORKERS SHARE.
//
// Every worker's tsconfig maps `@shared/*` onto the repo's shared/ folder, so a
// worker file says `@shared/workers/gating` instead of counting four directory
// levels back to it. tsc reads that mapping from the tsconfig; wrangler's esbuild
// reads it too (a dry-run bundle is byte-identical either way) — but vitest does
// NOT: Vite resolves aliases from `resolve.alias`, never from tsconfig `paths`.
// Without this file every worker test that imports a shared seam fails to load.
//
// It is ONE file rather than eight copies for the reason the seam scanner gives
// in its own header: eight copies of a resolution rule is not eight rules, it is
// one rule and seven things that look like it — and the one that drifts is the
// one whose worker stops testing what it thinks it tests. Each worker's `test`
// script points here with `--config`; vitest keeps the worker directory as its
// root (process.cwd()), so each run still collects only its own test/ folder.
//
// The alias is resolved against THIS file's location, not the run's root, so it
// is correct from whichever worker directory vitest was launched in.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
})
