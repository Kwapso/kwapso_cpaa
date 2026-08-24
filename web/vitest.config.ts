import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Web unit tests. jsdom by default (the store test renders a hook); the pure
// tests (identity / screens / shape) don't care which env they run in. The `@/`
// and `@shared/` aliases mirror web/tsconfig.json so tests import the same way
// the app does. Playwright e2e specs (web/e2e) are NOT vitest tests — excluded.
export default defineConfig({
  // web/tsconfig.json leaves JSX to Next (`preserve`), which a plain vitest run
  // can't parse — so the transform is told to compile it here. Without this a
  // test that RENDERS a component (the confirm panel) can't even be loaded.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    /* 20s, not vitest's 5s default. Three tests went red on the STOPWATCH in one
     * night — table-header-sorts (5492ms), splash, and knowledge-ceiling
     * (6730ms) — every one of them passing alone and passing again on a re-run.
     * Nothing was broken; the suite renders whole screens and walks the source
     * tree off disk, so its heavy tests genuinely sit either side of five
     * seconds once the machine is busy.
     *
     * This does not hide a hang. A hung test never finishes, so it fails at 20s
     * exactly as it failed at 5s — the line simply moves to where "slow" and
     * "stuck" actually separate for this codebase. The cost of leaving it was
     * higher: a gate that goes red when nothing is wrong teaches people to
     * re-run until green, and then the real red gets the same treatment. */
    testTimeout: 20_000,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["node_modules", "e2e/**", ".next", "out"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
})
