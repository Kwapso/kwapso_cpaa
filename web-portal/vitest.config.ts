import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Portal unit tests. jsdom by default; the rule + fence guards are pure source
// scans and don't care which env they run in. The `@/` and `@shared/` aliases
// mirror web-portal/tsconfig.json so tests import the same way the app does —
// and, like the tsconfig, there is no `@web` alias: the portal does not compile
// out of the agency app's tree.
export default defineConfig({
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
