// THE ACCOUNT GATE — refuse to deploy into somebody else's Cloudflare account.
//
//   node scripts/check-cloudflare-account.mjs
//
// FIRST in both deploy chains, ahead of everything, because it is the only check
// here whose failure is not recoverable by re-running: every other gate refuses
// before anything has happened, and this one guards the moment after which
// something has.
//
// ── WHAT IT PREVENTS ────────────────────────────────────────────────────────
//
// NOT ONE of the eight workers pins `account_id` in its wrangler.jsonc. Verified
// on 27 Aug 2026 and it has always been so. wrangler therefore deploys to
// whatever account the machine happens to be authenticated as, and on the machine
// this repo is developed on the default is a DIFFERENT Cloudflare account holding
// other clients' projects. `cf-exec` is the convention that fixes this — it reads
// the folder, resolves the account, and puts the id and key in the environment —
// and OPERATIONS.md opens by telling you to run every Cloudflare command through
// it. Until now nothing in the repository enforced that for a DEPLOY.
//
// The workers whose bindings name a database by id would fail in the wrong
// account, loudly and harmlessly. The ones that do not would simply succeed, and
// a live worker under another client's account is not a thing you notice; it is
// a thing somebody finds later. That is the accident this refuses.
//
// ── WHY IT IS ITS OWN CHECK, BESIDE THE MIGRATION GATE'S OWN GUARD ──────────
//
// `check-team-migrations.mjs` carries the identical guard, and both are correct.
// That gate is deliberately positioned AFTER tenancy deploys (its header says
// why — the robot ships inside the worker), which puts it three uploads too late
// to be the thing standing at this door. Its guard makes it safe to run alone;
// this one makes the chain safe. The overlap is belt and braces on the one
// question where a second pair is worth more than the tidiness of having one.
//
// ── WHERE THE ACCOUNT COMES FROM ────────────────────────────────────────────
//
// DERIVED, from every `CF_ACCOUNT_ID` in the workers' own wrangler configs — the
// account whose D1 REST door the app talks to. It has to be the account the
// workers run in: they also bind databases in it NATIVELY, and a native binding
// can only reach the account the worker was deployed to. So the id is already
// committed, in ten places, and this reads all ten and requires them to AGREE.
//
// Not hard-coded here, and the reason is not neatness. Two scripts already carry
// this id as a literal because they are destructive and were written before there
// was anywhere to read it from. A third copy would be the one that goes stale,
// and — worse — it would weld one client's account number into a base that is
// meant to be forked for the next product. A fork changes these configs and this
// check follows it; a fork would have to remember to change a literal.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORKERS = join(ROOT, "workers")

/** Every account id the deployment configs name, and where each was found.
 * A 32-hex literal after the var's own name — narrow on purpose, so a comment
 * mentioning the variable cannot become a second opinion about the account. */
export function declaredAccounts() {
  const found = new Map() // id → the files that name it
  for (const worker of readdirSync(WORKERS)) {
    let source
    try {
      source = readFileSync(join(WORKERS, worker, "wrangler.jsonc"), "utf8")
    } catch {
      continue // not a worker directory
    }
    for (const [, id] of source.matchAll(/"CF_ACCOUNT_ID"\s*:\s*"([0-9a-f]{32})"/g)) {
      if (!found.has(id)) found.set(id, [])
      found.get(id).push(`workers/${worker}/wrangler.jsonc`)
    }
  }
  return found
}

/** The one account this repository deploys to. Throws rather than guessing:
 * every failure mode here ends in "we do not know which account", and a deploy
 * is the wrong moment to find out. */
export function expectedAccount(found = declaredAccounts()) {
  if (found.size === 0) {
    throw new Error(
      "No CF_ACCOUNT_ID in any workers/*/wrangler.jsonc, so this cannot say which\n" +
        "account the app belongs to. If the configs changed shape, teach this script."
    )
  }
  if (found.size > 1) {
    const shown = [...found]
      .map(([id, files]) => `  ${id} — ${[...new Set(files)].join(", ")}`)
      .join("\n")
    throw new Error(`The worker configs name more than one Cloudflare account:\n${shown}`)
  }
  return [...found.keys()][0]
}

function main() {
  const expected = expectedAccount()
  const actual = process.env.CLOUDFLARE_ACCOUNT_ID
  if (actual === expected) {
    console.log(`OK: deploying to Cloudflare account ${expected}.`)
    return 0
  }
  console.error(
    `WRONG CLOUDFLARE ACCOUNT — nothing has been deployed.\n\n` +
      `  this repository deploys to: ${expected}\n` +
      `  CLOUDFLARE_ACCOUNT_ID is:   ${actual ?? "unset"}\n\n` +
      `No worker pins an account, so wrangler would have uploaded to whatever\n` +
      `account this machine is signed in to — which on a shared machine is\n` +
      `another client's. Run the deploy through cf-exec, which resolves the\n` +
      `account from the folder and fetches its key:\n\n` +
      `  cf-exec npm run deploy:staging\n\n` +
      `Or export CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN yourself first.\n` +
      `\`npx wrangler whoami\` says who you are signed in as (OPERATIONS.md § 0).`
  )
  return 1
}

// Only when RUN, never when imported — the suite reads the derivations.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
