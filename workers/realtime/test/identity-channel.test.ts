// THE `?user=` BRANCH — the door half nothing exercised, and what that cost.
//
// A signed-in person could open their OWN identity channel and send
// `x-listener-shard: <someone else's team>:0` with it. That branch handed the
// Durable Object the caller's RAW request, so the header survived; inside the DO
// it is parsed into `{team, shard}` and used to address that team's interest
// registry and write to it. The registry decides which shards a ping reaches, so
// the effect is another team's live layer going quiet — a write into somebody
// else's world, with no membership of it anywhere in the path.
//
// `stamped()` had existed the whole time, one branch away, and its own header
// says "a header the CALLER sent is never allowed to survive". It was called on
// `?team=` and on nothing else.
//
// WHY THIS TEST IS A CENSUS AND NOT A CASE. The obvious test — "the identity
// branch calls stamped" — would have been written the day the branch was fixed
// and would guard exactly the line somebody just looked at. The bug was never
// that one line; it was that a SECOND door to the same object existed and nobody
// asked it the question they had asked the first. So the assertion is over EVERY
// call site: whatever hands a request to a channel, on any branch added later,
// goes through the one function that strips the caller's headers.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")

/** Every `…getByName(<anything>).fetch(<argument>)` in the worker, with the
 * argument it passes — read off the disk rather than listed here, so a branch
 * added tomorrow is in the census without anyone remembering to add it. */
function channelFetchSites(): { at: number; arg: string }[] {
  const out: { at: number; arg: string }[] = []
  const re = /getByName\([^)]*\)\s*\.fetch\(/g
  for (let m = re.exec(SRC); m; m = re.exec(SRC)) {
    // Walk to this call's own closing paren, so a nested call in the argument
    // (`stamped(request, …)`) does not end the scan early.
    let i = re.lastIndex
    let depth = 1
    while (i < SRC.length && depth > 0) {
      const ch = SRC[i]
      if (ch === "(") depth++
      else if (ch === ")") depth--
      i++
    }
    out.push({
      at: SRC.slice(0, m.index).split("\n").length,
      arg: SRC.slice(re.lastIndex, i - 1).trim(),
    })
  }
  return out
}

describe("the realtime door never hands a channel the caller's own request", () => {
  it("finds the call sites at all — the canary this census needs", () => {
    // An empty census passes every assertion below while proving nothing. If the
    // shape of the code changes so the regex stops matching, THIS fails first and
    // says so, instead of the suite going quietly green over nothing.
    const sites = channelFetchSites()
    expect(sites.length, "no getByName().fetch() sites found — the census is broken, not the code").toBeGreaterThanOrEqual(2)
  })

  it("every call site passes a stamped request, never a bare one", () => {
    const bare = channelFetchSites().filter((s) => !s.arg.startsWith("stamped("))
    expect(
      bare.map((s) => `index.ts:${s.at} passes \`${s.arg.split("\n")[0]}\``),
      "a channel fetch that forwards the request unstamped lets a caller-sent x-listener-* header reach the Durable Object"
    ).toEqual([])
  })

  it("the identity branch is one of them, and it asks for no fence, no shard and no subscription", () => {
    // `stamped(request, null, null)` — three nulls is not laziness. An identity
    // channel's object name IS its fence (`user:<id>`, and the line above proves
    // the caller owns it), so every internal header is DELETED rather than set.
    expect(SRC).toMatch(/getByName\(`user:\$\{userId\}`\)\.fetch\(stamped\(request, null, null\)\)/)
  })

  it("stamped deletes all three internal headers when it is given nothing", () => {
    // The property the line above relies on. Read off the same file so the two
    // cannot drift apart: no teamId deletes the shard, no stamp deletes the
    // scope, no subs deletes the subscription.
    expect(SRC).toMatch(/else headers\.delete\(SHARD_HEADER\)/)
    expect(SRC).toMatch(/else headers\.delete\(SCOPE_HEADER\)/)
    expect(SRC).toMatch(/else headers\.delete\(SUBS_HEADER\)/)
  })

  it("you may still only join your own identity channel", () => {
    // The check that was already right, pinned so a later edit cannot drop it
    // while tidying the branch this fix rewrote.
    expect(SRC).toMatch(/if \(userId !== user\.id\)\s*\n?\s*return fail\(403/)
  })
})
