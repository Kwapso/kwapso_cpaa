// R15, THE CLAUSE A GREEN BUILD MISSED — a record's OWN cache key is reached by
// the ping about that record.
//
// The law says every published resource reaches a listener, and it was true: a
// `stories` ping patched the row in the stories LIST and refreshed the activity
// feed. But `story-detail.tsx` does not read its row out of the list. It fetches
// the one story into a key of its own, `story:one:<id>`, and a row patch cannot
// reach a key nothing names.
//
// So starting a timer moved the story to In progress on the server, published the
// ping, patched the list, refreshed the feed — and left the open record saying
// "Open" until somebody reloaded the page. The owner watched it happen on 19 Aug
// 2026 and asked whether it was a network glitch. It was not.
//
// `knowledge-detail.tsx` had the same shape and got it right — `knowledge:one:`
// is in its own registry entry's deps. One module remembered, two forgot, which
// is the definition of a rule that needs a machine. The census found the second
// (`meeting:one:`) on its first run, in a branch a reader would have to notice:
// the meeting detail reads its row from the LIST when the meeting is on the page
// it has, and only falls back to a one-fetch when it is not — so the bug was
// invisible for exactly the meetings somebody browses to and live for every
// meeting they deep-link into.
//
// THE CENSUS IS POSITIONAL, like R20's. A per-record key is a template literal of
// the form `<word>:one:${…}`; wherever one is read, that prefix must appear in
// live-resources.ts. Reading the KEY rather than the screen is what makes this
// survive a screen being renamed or split in two.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")

/** Every per-record key a component holds, as `<module>:one:`. Comments stripped
 * through the one stripper, or the note above would satisfy the rule it explains. */
function perRecordKeys(): { key: string; rel: string }[] {
  const out: { key: string; rel: string }[] = []
  for (const f of sourceFiles(join(WEB, "components"), {
    extensions: [".ts", ".tsx"],
    skipTests: true,
    relativeTo: WEB,
  }))
    for (const m of stripComments(f.source).matchAll(/`([a-z_]+):one:\$\{/g))
      out.push({ key: `${m[1]}:one:`, rel: f.rel })
  return out
}

describe("R15 · a record's own cache key is reached by the ping about that record", () => {
  it("every `<module>:one:` key a component reads is named in live-resources.ts", () => {
    const registry = readFileSync(join(WEB, "lib", "live-resources.ts"), "utf8")
    const unreachable = [
      ...new Set(
        perRecordKeys()
          .filter(({ key }) => !registry.includes(key))
          .map(({ key, rel }) => `${rel} reads \`${key}\``)
      ),
    ]
    expect(
      unreachable,
      "a detail screen holds a record in its own cache key and no live-resources entry names it — a ping about that record patches the list and leaves the OPEN record stale until a reload (the story/timer bug, 19 Aug 2026). Add the key to that resource's `deps`."
    ).toEqual([])
  })

  // THE CENSUS HAS TO FIND SOMETHING, or it passes over an empty set and reports
  // "all clear" for ever. Naming the three is deliberate: a fourth is a screen
  // that needs the same thought, and a missing one means the spelling moved.
  it("the census actually reaches the keys it is about", () => {
    expect(
      [...new Set(perRecordKeys().map((k) => k.key))].sort(),
      "the per-record key spelling has changed and this check is watching nothing"
    ).toEqual(["knowledge:one:", "meeting:one:", "story:one:"])
  })
})
