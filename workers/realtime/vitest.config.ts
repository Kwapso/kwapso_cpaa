import { fileURLToPath } from "node:url"

import { defineConfig, mergeConfig } from "vitest/config"

import shared from "../../vitest.workers.config"

// The realtime worker is the only one with a Durable Object, so it is the only
// one that needs `cloudflare:workers` to resolve at test time. Everything else
// (the `@shared/*` map) comes from the one config the eight workers share.
//
// The alias is what lets the DO be RUN rather than read: its concurrency
// behaviour — one broadcast, many sockets, one of them already dead — is not
// something a source regex can check.
export default mergeConfig(
  shared,
  defineConfig({
    resolve: {
      alias: {
        "cloudflare:workers": fileURLToPath(
          new URL("./test/cloudflare-workers-stub.ts", import.meta.url)
        ),
      },
    },
  })
)
