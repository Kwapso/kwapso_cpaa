// EVERY BUCKET HAS A LIFETIME SOMEBODY DECIDED, AND IT IS DERIVED FROM THE
// CONFIGS RATHER THAN TYPED.
//
// R2 was the one store in this system with no expiry of any kind — no lifecycle
// rule on any bucket, in any environment, since the first one was created. That
// is not merely a storage bill: `scripts/backup.mjs` uses the bucket as its own
// inventory (deliberately, and its header says why), so anything abandoned in
// there is copied on every nightly run for ever.
//
// The rules `scripts/r2-lifecycle.mjs` applies are the two that CANNOT remove a
// byte anything points at — an incomplete multipart's orphaned parts, and an
// optional storage-class transition that changes the price and not the key.
// Deleting by AGE is deliberately not among them: a team logo uploaded two years
// ago is live, and reference-garbage is `reclaimMedia`'s job at the door.
//
// What this suite locks is the half a script cannot lock about itself: that its
// bucket list is the same set the wrangler configs declare. A bucket added to a
// worker tomorrow and missed here would have no lifetime and nothing would say
// so — the exact silence the rules exist to end.

import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

import { bucketsFor, rules, ABORT_INCOMPLETE_DAYS } from "../../../scripts/r2-lifecycle.mjs"

const ROOT = join(__dirname, "..", "..", "..")

/** Every `bucket_name` any worker declares, read straight off the configs — the
 * oracle this suite compares the script against. It is a separate READ from the
 * script's own (the shared walker rather than the script's directory listing, and
 * no environment split), because a check that calls the very function it is
 * checking proves only that the function agrees with itself. */
function declaredBuckets(): string[] {
  const names = new Set<string>()
  for (const f of sourceFiles(join(ROOT, "workers"), { extensions: [".jsonc"], relativeTo: ROOT }))
    for (const [, name] of f.source.matchAll(/"bucket_name"\s*:\s*"([^"]+)"/g)) names.add(name)
  return [...names]
}

describe("R2 lifecycle covers every bucket the workers declare", () => {
  it("finds the buckets at all", () => {
    // The tripwire: a regex that matched nothing would make every assertion
    // below vacuously true.
    expect(declaredBuckets().length, "expected the wrangler configs to declare buckets").toBeGreaterThan(2)
  })

  it.each(["staging", "production"] as const)("%s: no declared bucket is left without a lifetime", (env) => {
    const covered = new Set(bucketsFor(env, ROOT))
    const missing = declaredBuckets()
      .filter((n) => (env === "staging" ? n.endsWith("-staging") : !n.endsWith("-staging")))
      .filter((n) => !covered.has(n))
    expect(
      missing,
      `these buckets are bound by a worker and have no lifecycle rule — add nothing, the derivation should have found them: ${missing.join(", ")}`
    ).toEqual([])
    expect(covered.size, "and the derivation must actually be finding buckets").toBeGreaterThan(2)
  })

  it("includes the one bucket no worker binds", () => {
    // The Glide archive belongs to no team yet, so no binding names it and the
    // config-derived list cannot see it. `backup.mjs` adds it back by hand for
    // the same reason; its objects age exactly like everybody else's.
    expect(bucketsFor("production", ROOT)).toContain("kwapso-glide-archive")
    expect(bucketsFor("staging", ROOT)).toContain("kwapso-glide-archive-staging")
  })

  it("never expires an object by age, in either mode", () => {
    // THE ASSERTION THAT MATTERS MOST. An age-based delete would take a live team
    // logo off a client's record, and it would look exactly like a tidy-up. The
    // rules may abort an unfinished upload and may change a storage class; they
    // may not remove an object.
    for (const infrequent of [false, true]) {
      const set = rules({ infrequent })
      for (const rule of set)
        expect(
          Object.keys(rule as Record<string, unknown>),
          `${(rule as { id: string }).id} may not carry a deletion rule — garbage here is identified by REFERENCE (reclaimMedia), never by date`
        ).not.toContain("deleteObjectsTransition")
    }
  })

  it("aborts an incomplete multipart, always", () => {
    const [first] = rules({ infrequent: false })
    expect((first as { id: string }).id).toBe("abort-incomplete-multipart")
    expect(
      (first as { abortMultipartUploadsTransition: { condition: { maxAge: number } } })
        .abortMultipartUploadsTransition.condition.maxAge
    ).toBe(ABORT_INCOMPLETE_DAYS * 86_400)
  })

  it("keeps the storage-class transition opt-in", () => {
    // It changes what a retrieval costs, which is the owner's call and not a
    // developer's. Off by default, and the flag is the only way on.
    expect(rules({ infrequent: false })).toHaveLength(1)
    expect(rules({ infrequent: true })).toHaveLength(2)
  })
})
