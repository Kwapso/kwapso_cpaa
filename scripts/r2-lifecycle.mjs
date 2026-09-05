// R2 LIFECYCLE RULES — the one thing in this system that had no expiry at all.
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────
//
// Every other store here has a lifetime somebody decided. Sessions expire; the
// error log has a retention sweep and an hourly write ceiling; `db_growth` keeps
// two readings per database rather than one a night; D1 has a size alarm, a
// growth rate and (since 5 Sep 2026) an account-level ceiling. R2 had none of
// that: no lifecycle rule on any bucket, in any environment, since the day the
// first one was created. An object written in June 2026 is still being paid for,
// and — because `scripts/backup.mjs` uses the bucket as its own inventory, by
// design and for good reasons — it is also copied on every nightly backup run.
//
// ── WHY EXPIRY-BY-AGE IS NOT THE RULE, AND WILL NOT BE ──────────────────────
//
// The obvious lifecycle rule is "delete objects older than N days", and it is
// the wrong one here and always will be: a team logo uploaded two years ago is
// live, and an object's age says nothing whatever about whether a row still
// points at it. Deleting by age would take a client's brand mark off their
// record. Garbage in this bucket is identified by REFERENCE, not by date, which
// is `reclaimMedia`'s job at the door that supersedes it (shared/workers/image.ts).
//
// So this sets the two rules that are safe BY CONSTRUCTION — neither can ever
// remove a byte anything points at:
//
//   1. ABORT INCOMPLETE MULTIPART UPLOADS after 7 days. A part uploaded for a
//      multipart that was never completed is unreachable by any key: no row can
//      reference it, no door can serve it, and it is billed as storage until
//      somebody aborts it. R2's own recommended baseline rule.
//   2. (OPT-IN) TRANSITION TO INFREQUENT ACCESS after 90 days. Same bytes, same
//      keys, same URLs — a cheaper storage class with a retrieval fee. It is a
//      COST decision rather than a correctness one, so it is off unless
//      `--infrequent` is passed, and OPERATIONS.md carries the arithmetic.
//
// ── HOW THE BUCKET LIST IS DECIDED ──────────────────────────────────────────
//
// Read off the wrangler configs, exactly as `scripts/backup.mjs` does it, plus
// the one bucket no worker binds (the Glide archive). A bucket is covered
// because a worker declares it, so adding a binding adds it here and there is no
// second list to keep in step — and `workers/gateway/test/r2-lifecycle.test.ts`
// re-derives both halves off disk so the two can never drift.
//
// Usage (every Cloudflare command on this machine takes the cf-exec prefix — a
// bare wrangler resolves to the wrong company's account):
//
//   cf-exec node scripts/r2-lifecycle.mjs staging
//   cf-exec node scripts/r2-lifecycle.mjs production --infrequent
//   cf-exec node scripts/r2-lifecycle.mjs staging --dry-run
//
// It is idempotent: `r2 bucket lifecycle set` replaces the rule set, so running
// it twice leaves the same rules. Nothing here reads or writes an object.

import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/** Days an unfinished multipart upload is kept before its parts are abandoned.
 * Seven, not one: a resumable upload that a person came back to on Monday is a
 * real thing, and a part nobody claims costs a few megabytes for a week. */
export const ABORT_INCOMPLETE_DAYS = 7

/** Days before an object may move to Infrequent Access, when that rule is on.
 * R2's minimum billable duration in that class is 30 days, so anything below
 * that can cost MORE than it saves; 90 is comfortably past it and is well beyond
 * the window in which an attachment is actually opened. */
export const INFREQUENT_AFTER_DAYS = 90

/** WHICH BUCKETS THIS ENVIRONMENT OWNS — the same derivation `backup.mjs` uses,
 * off the wrangler configs, split on the `-staging` suffix. Exported so the test
 * can re-derive it rather than restate it. */
export function bucketsFor(environment, root = ROOT) {
  const names = new Set()
  const workers = join(root, "workers")
  for (const worker of readdirSync(workers)) {
    const cfg = join(workers, worker, "wrangler.jsonc")
    if (!existsSync(cfg)) continue
    for (const [, name] of readFileSync(cfg, "utf8").matchAll(/"bucket_name"\s*:\s*"([^"]+)"/g))
      if (isThisEnvironment(name, environment)) names.add(name)
  }
  // The bucket no worker binds, on purpose: the rescued Glide files belong to no
  // team yet. `backup.mjs` adds it back by hand for the same reason, and its
  // objects age exactly like everybody else's.
  names.add(environment === "staging" ? "kwapso-glide-archive-staging" : "kwapso-glide-archive")
  return [...names].sort()
}

const isThisEnvironment = (name, environment) =>
  environment === "staging" ? name.endsWith("-staging") : !name.endsWith("-staging")

/** The rule set, as wrangler's `lifecycle set` wants it. */
export function rules({ infrequent }) {
  const out = [
    {
      id: "abort-incomplete-multipart",
      enabled: true,
      conditions: { prefix: "" },
      abortMultipartUploadsTransition: {
        condition: { type: "Age", maxAge: ABORT_INCOMPLETE_DAYS * 86_400 },
      },
    },
  ]
  if (infrequent)
    out.push({
      id: "infrequent-access-after-90-days",
      enabled: true,
      conditions: { prefix: "" },
      storageClassTransitions: [
        {
          storageClass: "InfrequentAccess",
          condition: { type: "Age", maxAge: INFREQUENT_AFTER_DAYS * 86_400 },
        },
      ],
    })
  return out
}

function main() {
  const [environment, ...flags] = process.argv.slice(2)
  if (environment !== "staging" && environment !== "production") {
    console.error("usage: cf-exec node scripts/r2-lifecycle.mjs <staging|production> [--infrequent] [--dry-run]")
    process.exit(2)
  }
  const infrequent = flags.includes("--infrequent")
  const dryRun = flags.includes("--dry-run")
  const set = rules({ infrequent })
  const buckets = bucketsFor(environment)

  console.log(
    `R2 lifecycle · ${environment} · ${buckets.length} bucket(s) · ${set.length} rule(s)${dryRun ? " · DRY RUN" : ""}`
  )
  for (const bucket of buckets) {
    const file = join(mkdtempSync(join(tmpdir(), "r2-lifecycle-")), `${bucket}.json`)
    writeFileSync(file, JSON.stringify({ rules: set }, null, 2))
    console.log(`  ${bucket}: ${set.map((r) => r.id).join(", ")}`)
    if (dryRun) continue
    // `execFileSync` rather than a shell string: a bucket name goes into an
    // argument, and this repo does not build commands by concatenation.
    execFileSync("npx", ["wrangler", "r2", "bucket", "lifecycle", "set", bucket, "--file", file], {
      cwd: ROOT,
      stdio: "inherit",
    })
  }
  if (!infrequent)
    console.log(
      "\nInfrequent Access is OFF. Pass --infrequent to add the 90-day transition (OPERATIONS.md, R2 lifecycle) — it is a cost decision, not a correctness one."
    )
}

// Only when run as a script, so the test can import the derivations.
if (process.argv[1] && process.argv[1].endsWith("r2-lifecycle.mjs")) main()
