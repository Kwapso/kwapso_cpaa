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
    environment: "jsdom",
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
