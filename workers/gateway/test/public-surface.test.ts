// HOW MANY ADDRESSES DOES THIS APP ANSWER ON?
//
// Earned on 11 Aug 2026. OPERATIONS.md said production was reachable only at its
// custom domains, and the handover notes said production "has no public address at
// all". Both were wrong: neither gateway declared `workers_dev`, so both defaulted
// to ON, and `https://kwapso.kwapso.workers.dev/` answered 200 — a live production
// front door with a live sign-in behind it, at an address nobody had written down.
//
// The danger is not the extra name. It is that a *.workers.dev name answers BEFORE
// anything bound to the custom hostname: a rate limit, a WAF rule, a country rule,
// an Access policy. Configure the front door and leave the side door open and you
// have configured nothing. The same is true of a per-version PREVIEW url, which is
// a public address for code nobody has decided to ship.
//
// So this suite asks each config the question directly, PER ENVIRONMENT — because
// wrangler envs do not inherit, and "the word false appears somewhere in the file"
// is exactly the sloppiness that let a worker be open in one environment and read
// as closed (see web/test/doc-claims.test.ts, which learned the same lesson).
//
// It parses the JSON rather than grepping it: a comment, a line break or a
// reordering must not change the answer. The roster comes from `workers/` on disk,
// so a new worker is covered the day it lands.

import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..", "..")

/** The two front doors. Everything else is reachable only by service binding. */
const GATEWAYS = ["gateway", "portal-gateway"]

/** A worker is a directory under workers/ that HAS a wrangler config — asked by
 * trying to read it, because that is the only question this suite cares about and
 * a config it cannot read is one it cannot check. */
const WORKERS = readdirSync(join(ROOT, "workers"))
  .filter((d) => {
    try {
      readFileSync(join(ROOT, "workers", d, "wrangler.jsonc"), "utf8")
      return true
    } catch {
      return false
    }
  })
  .sort()

/** Strip JSONC comments WITHOUT eating a `//` that lives inside a string — a var
 * holding "https://..." would otherwise silently truncate the rest of the file and
 * leave this suite parsing a fragment. Scans character by character, tracking quote
 * and escape state, which is the only way to be sure. */
function stripComments(src: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++
      out += "\n"
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i++
      continue
    }
    out += c
  }
  return out
}

type Block = Record<string, unknown>

const configOf = (w: string): Block =>
  JSON.parse(stripComments(readFileSync(join(ROOT, "workers", w, "wrangler.jsonc"), "utf8")))

/** Every DEPLOYABLE environment in one config: the top level IS production, and
 * each key under `env` is another. A setting must be stated in each — they do not
 * inherit, and the one that is forgotten is the one that is open. */
function environmentsOf(cfg: Block): { env: string; block: Block }[] {
  const envs = (cfg.env ?? {}) as Record<string, Block>
  return [
    { env: "production", block: cfg },
    ...Object.entries(envs).map(([env, block]) => ({ env, block })),
  ]
}

describe("the public surface is exactly what the docs say it is", () => {
  it("the roster is readable and both front doors are present", () => {
    expect(WORKERS.length, "workers/ must hold the domain workers + both gateways").toBeGreaterThanOrEqual(8)
    for (const g of GATEWAYS) expect(WORKERS, `${g} must exist`).toContain(g)
  })

  it("no worker, in any environment, exposes a per-version preview URL", () => {
    // No exceptions, gateways included. A preview URL addresses an UPLOADED but
    // undeployed version — code that has not been released, on a public name.
    const open: string[] = []
    for (const w of WORKERS) {
      for (const { env, block } of environmentsOf(configOf(w))) {
        if (block.preview_urls !== false) open.push(`${w} [${env}] → preview_urls = ${JSON.stringify(block.preview_urls)}`)
      }
    }
    expect(
      open,
      `A worker can be reached at a per-version preview URL. Set "preview_urls": false in ` +
        `EVERY environment block of its wrangler.jsonc (they do not inherit):\n` + open.join("\n")
    ).toEqual([])
  })

  it("only the two gateways have a workers.dev address, and only on staging", () => {
    // Production is custom-domain-only (agency.kwapso.app / client.kwapso.app), so
    // there is no second address bypassing what is bound to those hostnames.
    // Staging keeps its workers.dev name — the smoke and the seed reach it there.
    const wrong: string[] = []
    for (const w of WORKERS) {
      const gateway = GATEWAYS.includes(w)
      for (const { env, block } of environmentsOf(configOf(w))) {
        const expected = gateway && env === "staging"
        const actual = block.workers_dev
        if (actual !== expected) {
          wrong.push(
            `${w} [${env}] → workers_dev = ${JSON.stringify(actual)}, expected ${expected}` +
              (actual === undefined ? " (absent means ON — Cloudflare's default)" : "")
          )
        }
      }
    }
    expect(
      wrong,
      `The set of public addresses is not what OPERATIONS.md describes. A domain worker ` +
        `must be reachable only by service binding; a gateway must be reachable in ` +
        `production only at its custom domain:\n` + wrong.join("\n")
    ).toEqual([])
  })

  it("production answers on no workers.dev name at all", () => {
    // Stated separately from the rule above because it is the sentence the docs
    // make, and a reader should be able to find it failing by name.
    const open = WORKERS.filter((w) => configOf(w).workers_dev !== false)
    expect(
      open,
      `These workers answer on *.workers.dev IN PRODUCTION: ${open.join(", ")}. ` +
        `Production's front doors are agency.kwapso.app and client.kwapso.app; nothing else.`
    ).toEqual([])
  })
})
