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

// A RECLAIM THAT CANNOT FIRE IS WORSE THAN NO RECLAIM.
//
// `ownedMediaKey` answers null for anything it cannot prove — a foreign prefix, a
// pasted external link, a deeper path — and `reclaimMedia` skips a null without a
// murmur. That is exactly right for a hostile input and exactly wrong for a
// DEVELOPER MISTAKE, because the two are indistinguishable at runtime: give the
// reclaim `/media/` where the module writes to `/media/internal/`, or the owners
// list of a neighbouring module, and every call returns null, nothing is ever
// deleted, and the code reads as if the leak were closed. Ten of the app's upload
// doors write to the internal shelf and six to the public one, so this is not a
// hypothetical.
//
// So the pairing is checked rather than trusted: every reclaim's owners list must
// be one some door actually MINTS with, and its base must be the one that door's
// bucket is served under.
describe("a reclaim is proved against the key some door actually mints", () => {
  /** `ownedMediaKey(<stored>, "<base>", <owners…>)` — the base and the owners, as
   * written. Text, deliberately: the point is that the two call sites say the
   * SAME thing, and normalising them apart is how they would be allowed to
   * differ. */
  const RECLAIM = /ownedMediaKey\(\s*[^,]+,\s*"([^"]+)"\s*,\s*([^)]*)\)/g
  /** `mediaKey(<owners…>)` — the mint. */
  const MINT = /mediaKey\(\s*([^)]*)\)/g
  const tidy = (owners: string) => owners.replace(/\s+/g, " ").trim()

  /** Which base a file's uploads are served under, from the bucket it writes to.
   * `INTERNAL_MEDIA` is the agency-only shelf and is served at
   * `/media/internal/` by the agency gateway alone; everything else is
   * `/media/`. Derived from the source rather than listed, so a module that
   * changes shelves cannot leave a stale base behind in its reclaim. */
  function baseOf(src: string): string | null {
    if (/INTERNAL_MEDIA\.put\(/.test(src)) return "/media/internal/"
    if (/MEDIA\.put\(|storeImageDataUrl\(\s*env\.MEDIA/.test(src)) return "/media/"
    return null
  }

  it("every owners list a reclaim proves against is one a door mints with", () => {
    const mints = new Map<string, string[]>() // owners → the files that mint them
    for (const [path, src] of workerSources())
      for (const m of src.matchAll(MINT)) {
        const owners = tidy(m[1])
        mints.set(owners, [...(mints.get(owners) ?? []), path])
      }
    // The tripwire: a scan that found no mints would pass every assertion below.
    expect(mints.size, "expected to find the upload doors' key mints").toBeGreaterThan(5)

    let reclaims = 0
    for (const [path, src] of workerSources())
      for (const m of src.matchAll(RECLAIM)) {
        reclaims++
        const [, base, ownersRaw] = m
        const owners = tidy(ownersRaw)
        const minters = mints.get(owners)
        expect(
          minters,
          `${path} reclaims keys under \`${owners}\` and no upload door mints that — a prefix nothing wrote matches nothing, so this deletes NOTHING and looks like it works`
        ).toBeTruthy()
        // …and the shelf has to agree, which is the half a reader's eye slides
        // over: `/media/` against an INTERNAL_MEDIA key fails `startsWith` and
        // silently reclaims nothing.
        for (const minter of minters ?? []) {
          const want = baseOf(readFileSync(join(ROOT, minter), "utf8"))
          if (!want) continue // the mint and the put are in different files
          expect(
            base,
            `${path} reclaims \`${owners}\` at "${base}", but ${minter} writes those objects to the shelf served at "${want}" — every key would fail the prefix test and nothing would ever be deleted`
          ).toBe(want)
        }
      }
    expect(
      reclaims,
      "expected the reclaims: profile photo, team logo, account logo+cover, app logo, brand file, deliverable link+picture, staff photo, certificate file"
    ).toBeGreaterThanOrEqual(7)
  })

  it("no two modules mint into the same owners prefix", () => {
    // THE BUG THIS CLOSES, MEASURED 5 SEP 2026: knowledge, brand assets, staff and
    // deliverables all minted `mediaKey(guard.teamId)` into the SAME bucket, so
    // `ownedMediaKey(url, base, teamId)` proved "this team" and could never prove
    // "this module". A brand asset's URL pasted into a staff certificate's file
    // field passes that proof — and the staff door's reclaim would then destroy the
    // brand library's file. One more segment makes it impossible by construction;
    // this keeps it that way.
    const byOwners = new Map<string, Set<string>>()
    for (const [path, src] of workerSources()) {
      if (!/\.put\(|storeImageDataUrl\(/.test(src)) continue
      for (const m of src.matchAll(MINT)) {
        const owners = tidy(m[1])
        byOwners.set(owners, (byOwners.get(owners) ?? new Set()).add(path))
      }
    }
    expect(byOwners.size, "expected to find the upload doors").toBeGreaterThan(5)
    for (const [owners, files] of byOwners)
      expect(
        [...files],
        `\`mediaKey(${owners})\` is minted by more than one module, so no reclaim on either can prove which module an object belongs to`
      ).toHaveLength(1)
  })
})

// "FIND, COUNT, MOVE OR DELETE ONE TENANT'S OBJECTS" HAS TO BE ANSWERABLE.
//
// R2 has no folders — a prefix is whatever the keys happen to start with — so the
// set of prefixes a tenant's objects live under IS the answer to that question,
// and it was never written down. Nine different shapes were live at once across
// three incompatible conventions (kind-first `story/<team>`, team-first
// `<team>/apps`, and a bare `<team>` shared by four modules), one of which
// (`users/<id>`) carries no team at all.
//
// A key cannot be renamed once it is written, so the fix is not one shape: it is
// that the SET is derived off disk, pinned with a reason each, and cannot grow by
// accident. It fails both ways — a new shape nobody listed, and a listed shape
// nothing mints any more — so the table is a description of the bucket rather
// than a record of what the bucket used to look like.
//
// There is no tenant-DELETE path today (deactivate, never delete), so this is
// latent. It becomes real the first time a client asks for erasure, and that is
// the worst possible moment to be discovering the shapes.
describe("every object prefix a tenant's files live under is written down", () => {
  const PREFIXES: Record<string, string> = {
    '"users", user.id': "a person's profile photo — the ONE shape with no team in it, because a photo belongs to the person and follows them between teams (workers/auth/src/lib/profile.ts)",
    '"teams", teamId': "the team's own logo, keyed by the team it IS rather than by a team it belongs to (workers/tenancy/src/lib/teams.ts)",
    '"ticket", guard.teamId': "a ticket's attachments — kind-first, from before the team-first convention (workers/content/src/routes/help.ts)",
    '"story", guard.teamId': "a story's attachments — kind-first, same vintage (workers/content/src/routes/stories.ts)",
    '"todo", guard.teamId': "the file a CLIENT sends back through the portal to close a to-do — kind-first, same vintage (workers/content/src/routes/todos.ts)",
    'guard.teamId, "accounts"': "a client's logo and cover (workers/tenancy/src/routes/accounts.ts)",
    'guard.teamId, "apps"': "an app's logo (workers/tenancy/src/routes/processes.ts)",
    'guard.teamId, "tasks"': "the photo of the letter on a piece of our own admin (workers/content/src/routes/todos.ts)",
    'guard.teamId, "knowledge"': "the material behind a knowledge source (workers/content/src/routes/knowledge.ts)",
    'guard.teamId, "brand"': "the brand library's files (workers/content/src/routes/brand-assets.ts)",
    'guard.teamId, "staff"': "staff photos and certificates — one generic upload door, two destination columns (workers/content/src/routes/staff.ts)",
    'guard.teamId, "deliverables"': "what we handed over on an app (workers/content/src/routes/deliverables.ts)",
  }

  const minted = () => {
    const found = new Set<string>()
    for (const [, src] of workerSources())
      for (const m of src.matchAll(/mediaKey\(\s*([^)]*)\)/g))
        found.add(m[1].replace(/\s+/g, " ").trim())
    return found
  }

  it("finds the mints at all", () => {
    // The tripwire: both assertions below are set differences, and a scan that
    // found nothing would satisfy the first one.
    expect(minted().size, "expected to find the upload doors' key mints").toBeGreaterThan(8)
  })

  it("no upload writes under a prefix nobody has described", () => {
    const undescribed = [...minted()].filter((o) => !PREFIXES[o])
    expect(
      undescribed,
      "these mint object keys under a prefix this table does not describe, so 'which objects belong " +
        "to this tenant' has an answer nobody has written down. Add a line naming what lives there " +
        `and which door writes it: ${undescribed.map((o) => `mediaKey(${o})`).join(", ")}`
    ).toEqual([])
  })

  it("…and no line describes a prefix nothing writes any more", () => {
    const stale = Object.keys(PREFIXES).filter((o) => !minted().has(o))
    expect(
      stale,
      `this table describes prefixes no door mints: ${stale.join(", ")}. Delete the line — a description ` +
        "of a bucket that no longer exists is worse than none, because it is read as current."
    ).toEqual([])
  })
})
