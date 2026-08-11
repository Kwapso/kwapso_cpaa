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
