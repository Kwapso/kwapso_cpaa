// THE KEY IS THE CREDENTIAL.
//
// `/media/*` is served by the gateway with NO session and NO membership check —
// a deliberate, recorded decision (SCOPE ch.06 "Files"; BASE-MANUAL §5). The
// whole decision rests on one premise: only someone holding a file's exact key
// can fetch it. That premise was FALSE for two of the three key shapes — profile
// photos were `users/<userId>` and team logos `teams/<teamId>`, both derivable
// from an id anyone had already seen in a normal URL — so this suite pins the
// premise instead of trusting it:
//
//   1. mediaKey mints an unguessable key (a random tail, never just ids), and
//   2. EVERY upload in the whole repo goes through it — derived by reading each
//      worker's source, so a new bucket written tomorrow can't quietly go back
//      to a predictable key, and
//   3. the door refuses a key it would never have written (traversal probes and
//      junk get the same 404 a miss gets).

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"
import { mediaKey, ownedMediaKey, safeMediaKey } from "@shared/workers/image"

const ROOT = join(__dirname, "..", "..", "..")

/** Every worker's src .ts file, as [repo-relative path, source]. */
function workerSources(): [string, string][] {
  const srcDirs = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
    .filter((w) => w.isDirectory())
    .map((w) => join(ROOT, "workers", w.name, "src"))
  return sourceFiles(srcDirs, { extensions: [".ts"], relativeTo: ROOT }).map((f) => [f.rel, f.source])
}

describe("mediaKey — an uploaded object's URL is a capability, not a guess", () => {
  it("keeps the owning ids as a prefix (a bucket you can still read by eye)", () => {
    expect(mediaKey("users", "01USER").startsWith("users/01USER/")).toBe(true)
    expect(mediaKey("teams", "01TEAM").startsWith("teams/01TEAM/")).toBe(true)
    expect(mediaKey("01TEAM").startsWith("01TEAM/")).toBe(true)
  })

  it("adds a random tail with real entropy — the key can't be derived from the ids", () => {
    const tail = (k: string) => k.slice(k.lastIndexOf("/") + 1)
    const keys = Array.from({ length: 200 }, () => mediaKey("users", "01USER"))
    expect(new Set(keys).size, "two uploads must never collide").toBe(200)
    // A ULID is 10 time chars + 16 random ones. Knowing the user id (and roughly
    // when they uploaded) must still leave the key unguessable.
    for (const k of keys) expect(tail(k)).toMatch(/^[0-9A-Z]{26}$/)
    const randomHalves = new Set(keys.map((k) => tail(k).slice(10)))
    expect(randomHalves.size, "the tail's random half must actually vary").toBe(200)
  })

  it("is what EVERY upload uses — derived from the workers' own source", () => {
    // The rule that can't rot: find every R2 write in the repo and insist its key
    // came from the seam. A future module that writes `photos/<userId>` fails here.
    const writes: string[] = []
    for (const [path, src] of workerSources()) {
      for (const m of src.matchAll(/(\w+)\.put\(\s*([A-Za-z0-9_.]+)\s*,/g)) {
        if (!/MEDIA|BUCKET|R2/i.test(m[1])) continue
        const variable = m[2]
        writes.push(`${path}: ${m[1]}.put(${variable})`)
        // The key variable must be assigned from mediaKey() in the same file.
        expect(
          new RegExp(`(const|let)\\s+${variable}\\s*=\\s*mediaKey\\(`).test(src),
          `${path} writes to R2 with a key that didn't come from mediaKey() — a predictable key on a door with no session check`
        ).toBe(true)
      }
    }
    // The derivation must actually be finding the uploads (photos, logos, files).
    expect(writes.length, `expected to find the R2 uploads, found: ${writes.join(", ")}`).toBeGreaterThanOrEqual(3)
  })
})

// THE SAME SENTENCE, POINTED THE OTHER WAY. If only the holder of a key can READ
// an object, then a key is also the only thing that can DESTROY one — so a delete
// handed a key from anywhere but a row the caller already owns is a cross-tenant
// destroy. Nothing in this repo deleted an R2 object at all until the orphan leak
// was closed; this is the rule that keeps the first delete's discipline as more
// get written.
describe("a delete may only ever name an object the caller owns", () => {
  it("no worker destroys an object by hand — every delete goes through the seam", () => {
    for (const [path, src] of workerSources())
      for (const m of src.matchAll(/(\w+)\.delete\(/g))
        expect(
          /MEDIA|BUCKET|R2/i.test(m[1]),
          `${path} calls ${m[1]}.delete() directly — reclaim through reclaimMedia so the key is ownership-proved and the failure is recorded`
        ).toBe(false)
  })

  it("…and every reclaim's keys are proved against the caller's own ids", () => {
    let reclaimers = 0
    for (const [path, src] of workerSources()) {
      if (!/\breclaimMedia\(/.test(src)) continue
      reclaimers++
      expect(
        /\bownedMediaKey\(/.test(src),
        `${path} reclaims media with a key that didn't come from ownedMediaKey() — a delete is a reach, and the key must be re-proved from the caller's guard`
      ).toBe(true)
    }
    // The tripwire: a scan that finds no reclaims would report "all clear".
    expect(
      reclaimers,
      "expected the two reclaims (profile photo, team logo)"
    ).toBeGreaterThanOrEqual(2)
  })
})

describe("ownedMediaKey — what a reclaim is allowed to name", () => {
  const key = mediaKey("teams", "01TEAM")

  it("accepts a stored URL we minted for THIS owner, cache-buster and all", () => {
    expect(ownedMediaKey(`/media/${key}?v=1754900000000`, "/media/", "teams", "01TEAM")).toBe(key)
    expect(ownedMediaKey(`/media/${key}`, "/media/", "teams", "01TEAM")).toBe(key)
  })

  it("refuses anything that isn't this owner's own single object", () => {
    for (const [url, ...owners] of [
      [`/media/${key}`, "teams", "01OTHER"], // another team's
      [`/media/${key}`, "users", "01TEAM"], // another prefix
      [`https://elsewhere.example/media/${key}`, "teams", "01TEAM"], // not our origin
      ["/media/teams/01TEAM/", "teams", "01TEAM"], // the folder, not an object
      ["/media/teams/01TEAM/sub/01KEY", "teams", "01TEAM"], // a deeper path
      ["/media/teams/01TEAM/../users/01USER/01KEY", "teams", "01TEAM"], // a probe
      [null as unknown as string, "teams", "01TEAM"], // no logo at all
    ] as [string, ...string[]][])
      expect(ownedMediaKey(url, "/media/", ...owners), `${url} as ${owners.join("/")}`).toBeNull()
  })
})

describe("safeMediaKey — the door validates the key at the boundary", () => {
  it("accepts the keys we mint", () => {
    expect(safeMediaKey("users/01USER/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z")).toBe(
      "users/01USER/01J8ZQ4H7M9K2P5R7T9V1X3Y5Z"
    )
    expect(safeMediaKey(mediaKey("teams", "01TEAM"))).not.toBeNull()
    // Percent-encoded slashes are how a real URL carries the same key.
    expect(safeMediaKey("users%2F01USER%2F01J8ZQ")).toBe("users/01USER/01J8ZQ")
  })

  it("refuses a traversal probe, encoded or not", () => {
    for (const probe of [
      "../users/01USER",
      "users/../../etc/passwd",
      "..%2F..%2Fusers%2F01USER",
      "/users/01USER",
      "users//01USER",
    ])
      expect(safeMediaKey(probe), probe).toBeNull()
  })

  it("refuses junk: empty, oversized, spaces, control characters, backslashes, wildcards", () => {
    expect(safeMediaKey("")).toBeNull()
    expect(safeMediaKey("a".repeat(513))).toBeNull()
    expect(safeMediaKey("users/01 USER")).toBeNull()
    expect(safeMediaKey("users/01\u0000USER")).toBeNull()
    expect(safeMediaKey("users\\01USER")).toBeNull()
    expect(safeMediaKey("users/*")).toBeNull()
    expect(safeMediaKey("users/01USER?list")).toBeNull()
    expect(safeMediaKey("%E0%A4%A")).toBeNull() // a malformed escape is not a key
  })

  it("EVERY front door serves media through the one validating seam", () => {
    // Not "a validator exists" — the doors must USE it, or the boundary is a
    // decoration. This used to read the agency gateway alone and count two
    // `const key =` lines, which is exactly how a SECOND front door shipped a
    // third media door that decoded the path itself and validated nothing. So
    // the assertion is now the shape that cannot be sidestepped by writing
    // another one: the serving lives in ONE function, that function validates,
    // and no gateway builds a key of its own.
    const seam = readFileSync(
      join(ROOT, "shared", "workers", "front-door.ts"),
      "utf8"
    )
    expect(seam, "serveMedia must validate the key at the boundary").toContain("safeMediaKey(")

    let doors = 0
    for (const gw of ["gateway", "portal-gateway"]) {
      const src = readFileSync(join(ROOT, "workers", gw, "src", "index.ts"), "utf8")
      const uses = [...src.matchAll(/serveMedia\(/g)].length
      expect(uses, `${gw} must serve its media through the shared seam`).toBeGreaterThan(0)
      doors += uses
      expect(
        /const key = /.test(src),
        `${gw} builds a media key of its own — serve through serveMedia so the key is validated`
      ).toBe(false)
    }
    // The tripwire: a scan that finds no doors reports "all clear" like a pass.
    // FOUR now — the agency gateway grew /media/internal/ when the agency's own
    // housekeeping landed (brand assets, staff photos, certificate PDFs). It is
    // on the AGENCY door only, and deliberately: a capability URL that leaked
    // into a client's hands has nowhere on the portal to be redeemed, which is
    // the routing half of the refusal every one of those API doors already makes.
    expect(doors, "the two gateways ship four media doors between them").toBe(4)
  })
})
