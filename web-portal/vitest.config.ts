import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Portal unit tests. jsdom by default; the rule + fence guards are pure source
// scans and don't care which env they run in. The `@/`, `@shared/` and `@web/`
// aliases mirror web-portal/tsconfig.json so tests import the same way the app
// does.
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
      "@web": fileURLToPath(new URL("../web", import.meta.url)),
    },
  },
})
