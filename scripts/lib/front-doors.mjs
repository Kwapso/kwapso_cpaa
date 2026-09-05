// WHERE A SCRIPT LEARNS THE APP'S TWO PUBLIC ADDRESSES, and why neither is
// written down here.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
//
// Thirteen scripts in this folder each spelled a hostname out:
//
//   staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
//   production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
//
// Five of them carried that exact pair, character for character. Nothing was
// broken by it and nothing would have gone red if one of the thirteen had been
// left behind on a rename — the script would simply have talked to an address
// that no longer answers, or, on the day a hostname is REUSED, to the wrong app.
// That is the same class of fault as the account id these scripts used to carry
// (see check-cloudflare-account.mjs, whose header makes the argument first): a
// value copied is a decision made once, months ago, by somebody who is not in
// the room when it runs.
//
// ── WHERE THE ANSWER ACTUALLY LIVES ─────────────────────────────────────────
//
// In the workers' own wrangler configs, because that is where it is DEPLOYED
// from. `PUBLIC_APP_URL` / `PUBLIC_PORTAL_URL` (tenancy, content) and
// `APP_ORIGIN` / `PORTAL_ORIGIN` (auth) are what the running app tells a person
// its address is — the origin an invite email links to, the origin the OAuth
// callback is allowed to return to. A script that wants to talk to the app
// should ask the app's own configuration, not remember.
//
// So this reads all four names out of every workers/*/wrangler.jsonc and
// requires them to AGREE, exactly as `expectedAccount()` requires the ten
// declared account ids to agree. Three declarations behind each of the four
// answers today. A fork changes those configs and every script here follows it;
// a fork would have to remember to change thirteen literals.
//
// ── HOW STAGING IS TOLD FROM PRODUCTION ─────────────────────────────────────
//
// By the hostname carrying "staging", which is the convention every config in
// this repo follows — the same convention `backup.mjs` splits buckets on, and
// its caveat applies here too: a convention is a weaker thing than a parse. It
// is not load-bearing on its own. The AGREEMENT check is what makes it safe: a
// config that broke the convention would put two different hosts in one
// environment's bucket and this would refuse rather than pick one.
//
// It REFUSES rather than guesses, for the same reason cf-credentials.mjs does.
// An environment with no host, or with two that disagree, is a thrown error
// naming the fix — never a silent fallback onto a literal, which is the thing
// this file exists to delete.

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const WORKERS = join(ROOT, "workers")

/** The two var names each door is declared under. Two spellings because auth
 * names an ORIGIN (what a browser may be redirected back to) and the others name
 * a URL (what a link in an email points at); they are the same address and both
 * are load-bearing, so both are read. */
const DOOR_VARS = {
  agency: ["PUBLIC_APP_URL", "APP_ORIGIN"],
  portal: ["PUBLIC_PORTAL_URL", "PORTAL_ORIGIN"],
}

/** Every origin the deployment configs declare, and where each was found:
 * `{ agency: { staging: Map<url, files>, production: … }, portal: … }`.
 *
 * A quoted https:// literal after the var's own name — narrow on purpose, the
 * same shape as `declaredAccounts()`, so a comment mentioning the variable
 * cannot become a second opinion about the address. */
export function declaredOrigins() {
  const found = {
    agency: { staging: new Map(), production: new Map() },
    portal: { staging: new Map(), production: new Map() },
  }
  for (const worker of readdirSync(WORKERS)) {
    let source
    try {
      source = readFileSync(join(WORKERS, worker, "wrangler.jsonc"), "utf8")
    } catch {
      continue // not a worker directory
    }
    for (const [door, names] of Object.entries(DOOR_VARS)) {
      for (const name of names) {
        const re = new RegExp(`"${name}"\\s*:\\s*"(https://[^"]+)"`, "g")
        for (const [, url] of source.matchAll(re)) {
          const bucket = found[door][url.includes("staging") ? "staging" : "production"]
          if (!bucket.has(url)) bucket.set(url, [])
          bucket.get(url).push(`workers/${worker}/wrangler.jsonc`)
        }
      }
    }
  }
  return found
}

/** The app's two public addresses per environment, as
 * `{ staging: { agency, portal }, production: { agency, portal } }`.
 *
 * Throws rather than guessing: every failure here ends in "we do not know which
 * app this is", and the moment a script is about to seed, wipe or smoke-test
 * something is the wrong moment to find out. */
export function frontDoors(found = declaredOrigins()) {
  const out = { staging: {}, production: {} }
  for (const door of Object.keys(DOOR_VARS)) {
    for (const environment of ["staging", "production"]) {
      const urls = found[door][environment]
      if (urls.size === 0) {
        throw new Error(
          `No ${DOOR_VARS[door].join(" or ")} for ${environment} in any workers/*/wrangler.jsonc, ` +
            `so this cannot say where the ${door} front door is. If the configs changed shape, teach this file.`
        )
      }
      if (urls.size > 1) {
        const shown = [...urls]
          .map(([url, files]) => `  ${url} — ${[...new Set(files)].join(", ")}`)
          .join("\n")
        throw new Error(
          `The worker configs name more than one ${environment} ${door} origin:\n${shown}`
        )
      }
      out[environment][door] = [...urls.keys()][0]
    }
  }
  return out
}

/** The common case, resolved once. A script reads `FRONT_DOORS.staging.agency`
 * where it used to carry the hostname. */
export const FRONT_DOORS = frontDoors()
