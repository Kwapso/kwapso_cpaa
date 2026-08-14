// THE BACKUP MUST COVER EVERY BUCKET THE CODE WRITES INTO.
//
// Earned by the shape of the gap this closed. `scripts/backup.mjs` dumped every
// database and said, in its own header and in the manifest it wrote, that R2 was
// not captured. It was honest and it was a hole: profile photos, team logos,
// learning attachments, brand assets, staff certificates and the whole knowledge
// base's files had no copy anywhere, and R2 has no Time Travel.
//
// The backup now enumerates the buckets themselves, so COMPLETENESS WITHIN a
// bucket is a property of the design rather than something to test. What is NOT
// structural is which buckets it looks at, and which columns it reconciles
// against — those are lists, and a list is the thing that goes stale. Add a
// worker that binds a fifth bucket, or a module whose upload lands in a new
// column, and nothing about the backup would fail; it would keep reporting a
// clean success over a bucket it never opened. That is the exact failure the
// script is shaped against everywhere else, so it gets a check.
//
// DERIVED FROM THE CODE, both sides. The R2 writes come from the worker source
// (`<binding>.put(`), the bucket names come from each `wrangler.jsonc`, and the
// script's own coverage rule is read out of `backup.mjs`. Nothing here is a
// hand-kept copy of anything.

import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(p, "utf8")
const BACKUP = read(join(ROOT, "scripts", "backup.mjs"))

/** Every worker on disk. */
const WORKERS = readdirSync(join(ROOT, "workers")).filter((d) => {
  try {
    return statSync(join(ROOT, "workers", d, "wrangler.jsonc")).isFile()
  } catch {
    return false
  }
})

/** Every `.ts` under a worker's src/, and the shared worker code with it — the
 * two places an R2 write can live. */
function workerSources(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(".ts")) out.push({ path, source: readFileSync(path, "utf8") })
    }
  }
  for (const w of WORKERS) {
    try {
      if (statSync(join(ROOT, "workers", w, "src")).isDirectory()) walk(join(ROOT, "workers", w, "src"))
    } catch {
      /* a worker with no src/ is not a worker with a hidden R2 write */
    }
  }
  walk(join(ROOT, "shared", "workers"))
  return out
}

/** Which BINDINGS are R2 buckets, per worker — off each worker's `r2_buckets`,
 * so the answer is the deployment's rather than a naming guess. Returns
 * binding → the bucket names it maps to across every environment block. */
function r2Bindings(): Map<string, Set<string>> {
  const bindings = new Map<string, Set<string>>()
  for (const w of WORKERS) {
    const cfg = read(join(ROOT, "workers", w, "wrangler.jsonc"))
    for (const [, binding, name] of cfg.matchAll(
      /"binding"\s*:\s*"([A-Z_]+)"\s*,\s*"bucket_name"\s*:\s*"([^"]+)"/g
    )) {
      if (!bindings.has(binding)) bindings.set(binding, new Set())
      bindings.get(binding)!.add(name)
    }
  }
  return bindings
}

describe("the backup covers R2", () => {
  const bindings = r2Bindings()

  it("finds the R2 bindings it is about to reason over", () => {
    // A guard on the guard. If the config shape ever changes and these regexes
    // stop matching, every assertion below would pass over an empty set and this
    // file would be a green light bolted to nothing.
    expect(bindings.size, "no r2_buckets found in any wrangler.jsonc").toBeGreaterThan(0)
  })

  it("names every bucket a worker binds, in both environments", () => {
    // The script derives its bucket list by reading `"bucket_name"` out of the
    // same configs, so what this proves is that the derivation still SEES them:
    // a bucket whose name breaks the `-staging` convention would be filed under
    // the wrong environment and silently skipped in the other one.
    const missed: string[] = []
    for (const names of bindings.values()) {
      for (const name of names) {
        const staging = name.endsWith("-staging")
        // Every bucket must belong to exactly one environment under the rule the
        // script splits on, and the pair must both exist.
        const partner = staging ? name.replace(/-staging$/, "") : `${name}-staging`
        const known = [...bindings.values()].some((s) => s.has(partner))
        if (!known) missed.push(`${name} has no ${staging ? "production" : "staging"} counterpart (${partner})`)
      }
    }
    expect(
      missed,
      "scripts/backup.mjs splits buckets by the `-staging` suffix. A bucket without a " +
        "counterpart is one environment's backup quietly covering nothing:\n" +
        missed.join("\n")
    ).toEqual([])
  })

  it("every R2 write in the workers lands in a bucket the backup enumerates", () => {
    // The whole point. Find `X.put(` where X is a known R2 binding, and require
    // that binding's buckets to be reachable by the script's own coverage rule —
    // it reads `"bucket_name"` from every `workers/*/wrangler.jsonc`, so a bound
    // bucket is covered and an UNBOUND one (the Glide archive) has to be named.
    const derivesFromConfigs =
      BACKUP.includes('"bucket_name"') && BACKUP.includes("wrangler.jsonc")
    expect(
      derivesFromConfigs,
      "scripts/backup.mjs no longer derives its bucket list from the wrangler configs — " +
        "if the list is now typed by hand, this check is guarding the wrong thing"
    ).toBe(true)

    const uncovered: string[] = []
    for (const { path, source } of workerSources()) {
      for (const [, binding] of source.matchAll(/\b(?:env\.)?([A-Z][A-Z_]*)\.put\(/g)) {
        if (!bindings.has(binding)) continue // not an R2 bucket — a KV or a Map
        for (const name of bindings.get(binding)!) {
          // Covered means: some wrangler.jsonc names it (which is how it got
          // into `bindings` at all), so the script's sweep will find it too.
          if (!name.startsWith("kwapso-")) uncovered.push(`${path}: ${binding} → ${name}`)
        }
      }
    }
    expect(
      uncovered,
      "these R2 writes go to buckets scripts/backup.mjs cannot recognise as this app's " +
        "(it only claims `kwapso-` buckets, so another client's data in the shared " +
        "account is never fetched):\n" + uncovered.join("\n")
    ).toEqual([])
  })

  it("reconciles against a column for every bucket that has a writer", () => {
    // The other half: the backup cross-checks the rows against the objects, and
    // that map is a hand-traced list of columns. It cannot be derived (the URL
    // is handed to a form and written by a different route), so what IS checked
    // is that no bucket with a writer is missing from it entirely — the shape of
    // "a new module's uploads are backed up but nothing notices when they go
    // missing".
    const written = new Set<string>()
    for (const { source } of workerSources()) {
      for (const [, binding] of source.matchAll(/\b(?:env\.)?([A-Z][A-Z_]*)\.put\(/g)) {
        if (bindings.has(binding)) written.add(binding)
      }
    }
    // The URL prefix each binding is served under, from the gateway's own door —
    // the same source the script mirrors when it routes a stored URL to a bucket.
    const gateway = read(join(ROOT, "workers", "gateway", "src", "index.ts"))
    const served = new Map<string, string>()
    for (const [, binding, base] of gateway.matchAll(
      /serveMedia\(env\.([A-Z_]+), pathname, "([^"]+)"/g
    )) {
      served.set(binding, base)
    }
    expect(served.size, "the gateway's media doors could not be read").toBeGreaterThan(0)

    const unreconciled: string[] = []
    for (const binding of written) {
      const base = served.get(binding)
      if (!base) continue // written but served by no door — HELP_MEDIA's shape
      if (!BACKUP.includes(`"${base}"`)) unreconciled.push(`${binding} (${base})`)
    }
    expect(
      unreconciled,
      "scripts/backup.mjs routes a stored URL to a bucket by the gateway's prefixes. " +
        "These bindings are written and served but the script does not know their " +
        "prefix, so a row pointing at a lost file would never be reported:\n" +
        unreconciled.join("\n")
    ).toEqual([])
  })

  it("refuses to run without a token, so there is no database-only backup", () => {
    // The R2 half needs CLOUDFLARE_API_TOKEN. Without the refusal, a missing
    // token would still produce a folder of dumps with no files in it and exit
    // 0 — a backup that reports success while being incomplete, which is the one
    // outcome this script exists to make impossible.
    expect(BACKUP).toContain("CLOUDFLARE_API_TOKEN")
    expect(BACKUP).toMatch(/!TOKEN[\s\S]{0,400}process\.exit\(2\)/)
  })

  it("cannot write an object outside the backup folder", () => {
    // A key becomes a path here, which makes it the one value in this script that
    // can escape. Two defences, and both must stay: a shape rule on the key and a
    // containment check on the resolved path.
    expect(BACKUP, "the key shape rule is gone").toContain("safeObjectKey")
    expect(BACKUP, "the resolved-path containment check is gone").toMatch(
      /resolve\([^)]*\)\.startsWith\(resolve\(r2Dir\) \+ sep\)/
    )
  })
})
