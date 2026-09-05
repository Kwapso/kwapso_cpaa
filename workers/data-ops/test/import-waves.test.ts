// THE IMPORT WRITES ITS ROWS IN WAVES, AND STILL COUNTS THEM IN ORDER.
//
// `BULK_CONCURRENCY` was written on 25 Aug 2026 with three paragraphs explaining
// exactly the failure the CSV import had — a serial `for` loop over rows, each
// row a door hop, each hop several database trips at ~150ms — and for eleven
// days it had ONE call site, the bulk ticket action, while the biggest bulk path
// in the product was still the loop the constant existed to replace.
//
// Measured 5 Sep 2026 (scripts/speed-bench.mjs, staging): 1,799ms per row one at
// a time, 190ms per row twelve at a time. A 1,000-row file went from 30 minutes
// to 3.2 minutes.
//
// TWO THINGS THIS PINS, and the second is the one a rewrite would lose.
//
// 1. The wave itself. Read off the source, the same way `bulk-waves.test.ts`
//    pins its sibling and for the same stated reason: `node:sqlite` is
//    synchronous, so peak concurrency cannot be observed from inside the
//    harness. What CAN be read is that the loop steps by a wave and that
//    nothing awaits one row at a time again.
//
// 2. The exception, which is not tidiness. Two import targets declare a
//    reference with `onMissing: "create"`, which lands on `ensureSelectableValue`
//    — a SELECT followed by an INSERT with no unique constraint underneath it.
//    Serially that is safe. Twelve rows naming the same NEW dropdown value at
//    once would each miss the SELECT and insert their own copy, and the person
//    would find their vocabulary list holding the same word twelve times with
//    nothing in the import report to explain it. Those targets keep the serial
//    loop, DERIVED from the target's own references so a target that gains such
//    a reference tomorrow is covered without anybody remembering this comment.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BULK_CONCURRENCY } from "@shared/workers/limits"
import { TARGETS } from "../src/lib/targets"

function source(file: string): string {
  return readFileSync(join(__dirname, "..", "src", "lib", file), "utf8")
}

describe("the import writes in waves", () => {
  const src = source("import-batch.ts")

  it("steps by a wave rather than by a row", () => {
    expect(src).toMatch(/i \+= wavefront/)
    expect(src).toMatch(/const wavefront = createsVocabulary \? 1 : BULK_CONCURRENCY/)
    expect(src).toMatch(/await Promise\.all\(/)
  })

  it("no longer awaits one write per iteration of the row loop", () => {
    // The exact line that WAS the finding: `const out = await writeRow(...)`
    // sitting directly inside `for (let i = 0; i < scans.length; i++)`.
    expect(src).not.toMatch(/for \(let i = 0; i < scans\.length; i\+\+\)/)
  })

  it("the counters are folded AFTER the wave, never inside the callback", () => {
    // A counter incremented from twelve concurrent callbacks is a counter nobody
    // can reason about, and `report.rejections` is what a person downloads to
    // fix their file — so it has to stay in row order. The fold is what keeps
    // both true, and it is the half a rewrite would drop as noise.
    const wave = src.slice(src.indexOf("const wavefront"))
    const fold = wave.indexOf("for (const r of results)")
    const promiseAll = wave.indexOf("await Promise.all(")
    expect(promiseAll).toBeGreaterThan(-1)
    expect(fold).toBeGreaterThan(promiseAll)
    expect(wave.slice(fold)).toMatch(/report\.rejections\.push\(\{ file: file\.name, row: r\.row/)
  })

  it("the row NUMBER is computed from the wave's offset, so it still names the right line", () => {
    // In the serial loop the row number was the loop index + 1. In a wave it is
    // the wave's offset plus the position within it — get that wrong and every
    // rejection past the first twelve points a person at the wrong line of their
    // own spreadsheet, which is worse than no report at all.
    expect(src).toMatch(/const row = i \+ n \+ 1/)
  })

  it("the wave is still inside confirmBatch, after the claim", () => {
    // `import-idempotency.test.ts` reads `confirmBatch`'s own body and requires
    // the claim to precede the first `writeRow(` INSIDE it. Lifting the loop into
    // a helper would empty that body and quietly turn that assertion green
    // against nothing. Stated here too, because the trap is invisible from there.
    const body = src.slice(src.indexOf("export async function confirmBatch"))
    const claim = body.indexOf("overall_status = 'running'")
    const write = body.indexOf("writeRow(")
    expect(claim).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(claim)
  })
})

describe("the vocabulary-creating targets keep their serial loop", () => {
  it("there really are targets whose rows can mint a dropdown value", () => {
    // The canary. If no target declares `onMissing: "create"` any more, the
    // exception above is protecting nothing and the discriminator can go —
    // and this test would otherwise stay green while guarding an empty set.
    const creators = Object.entries(TARGETS).filter(([, def]) =>
      (def.references ?? []).some((r) => r.onMissing === "create")
    )
    expect(creators.length).toBeGreaterThan(0)
  })

  it("the check is derived from the target, not from a list of names", () => {
    const src = source("import-batch.ts")
    expect(src).toMatch(/\(def\.references \?\? \[\]\)\.some\(\(r\) => r\.onMissing === "create"\)/)
    // A hand-written list of target keys is the shape this must never become:
    // a target that gains such a reference tomorrow would be silently waved.
    expect(src).not.toMatch(/createsVocabulary = \[/)
  })

  it("BULK_CONCURRENCY is a real wave size, not one", () => {
    expect(BULK_CONCURRENCY).toBeGreaterThan(1)
  })
})
