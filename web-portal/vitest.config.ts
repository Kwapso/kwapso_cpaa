import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Portal unit tests. jsdom by default; the rule + fence guards are pure source
// scans and don't care which env they run in. The `@/` and `@shared/` aliases
// mirror web-portal/tsconfig.json so tests import the same way the app does —
// and, like the tsconfig, there is no `@web` alias: the portal does not compile
// out of the agency app's tree.
export default defineConfig({
  // web-portal/tsconfig.json leaves JSX to Next (`preserve`), which a plain
  // vitest run can't parse — so the transform is told to compile it here, the
  // same line and the same reason as web/vitest.config.ts. Without it a test
  // that RENDERS a portal component can't even be loaded, which is why the
  // portal's suites were all source scans.
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
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "out"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
})
