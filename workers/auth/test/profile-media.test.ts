// NOTHING IN THIS REPO EVER DELETED AN R2 OBJECT.
//
// A profile photo is stored under a NEW key every time (mediaKey appends a
// random segment) so an existing URL keeps working and no object is ever
// overwritten in place. That part is deliberate and stays. What was missing was
// the other end: the object the save STOPS pointing at was simply abandoned —
// no cron, no lifecycle rule, no delete anywhere — so every photo change leaked
// up to MAX_IMAGE_BYTES for the life of the account.
//
// The reclaim has three rules, and each one is a test below:
//   1. the old key is read off the row BEFORE the write, because afterwards
//      nothing in the system remembers it;
//   2. it is deleted only AFTER the row points at the new object;
//   3. a delete that fails NEVER fails the save — the photo is changed, and a
//      leftover object is exactly the situation we already lived with.
// And a fourth that is a security rule rather than a housekeeping one: the key
// comes out of a stored string, so it is deleted only when it proves it is this
// person's own.

import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"

import { updateProfile } from "../src/lib/profile"
import type { UserRow } from "../src/lib/users"
import { d1 } from "./core-sqlite"

/** A 1x1 PNG, as the web app sends it (a data URL). */
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function fresh(opts: { deleteFails?: boolean } = {}) {
  const db = new DatabaseSync(":memory:")
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT,
      image_url TEXT, onboarding_completed_at TEXT, current_team_id TEXT,
      created_at TEXT, updated_at TEXT, deactivated_at TEXT);
    CREATE TABLE team_members (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, deactivated_at TEXT);
    CREATE TABLE account_activity (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, description TEXT, created_at TEXT);
    CREATE TABLE error_logs (id TEXT PRIMARY KEY, at TEXT, source TEXT, place TEXT, message TEXT,
      stack TEXT, team_id TEXT, user_id TEXT, url TEXT, status TEXT DEFAULT 'open',
      resolved_at TEXT, resolution_note TEXT);
    INSERT INTO users (id, email, onboarding_completed_at, created_at, updated_at)
      VALUES ('U1', 'me@example.com', '2026-01-01', '2026-01-01', '2026-01-01');
  `)

  /** The bucket, as a Map — so "what is actually still stored" is countable. */
  const bucket = new Map<string, Uint8Array>()
  const deleted: string[] = []
  const env = {
    DB: d1(db),
    MEDIA: {
      put: async (key: string, bytes: Uint8Array) => {
        bucket.set(key, bytes)
      },
      delete: async (key: string) => {
        deleted.push(key)
        if (opts.deleteFails) throw new Error("R2 said no")
        bucket.delete(key)
      },
    },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never

  const row = () => db.prepare("SELECT * FROM users WHERE id = 'U1'").get() as unknown as UserRow
  const save = (extra: Partial<{ imageDataUrl: string }> = {}) =>
    updateProfile(env, row(), { firstName: "Mar", lastName: "Ruiz", ...extra })
  const errorsLogged = () =>
    db.prepare("SELECT place, message FROM error_logs").all() as unknown as {
      place: string
      message: string
    }[]
  return { db, bucket, deleted, env, row, save, errorsLogged }
}

describe("a changed photo reclaims the one it replaces", () => {
  it("keeps exactly one object however many times the photo changes", async () => {
    const t = fresh()
    await t.save({ imageDataUrl: PHOTO })
    const first = [...t.bucket.keys()][0]
    expect(t.bucket.size, "the first photo is stored").toBe(1)

    for (let i = 0; i < 5; i++) await t.save({ imageDataUrl: PHOTO })

    expect(
      t.bucket.size,
      "six saves used to leave six objects, and nothing ever deleted one"
    ).toBe(1)
    expect(t.deleted, "and each save reclaimed exactly the one before it").toHaveLength(5)
    expect(t.deleted[0]).toBe(first)
    // The row and the bucket agree: the object still there is the one being served.
    expect(t.row().image_url).toContain([...t.bucket.keys()][0])
  })

  it("leaves the object alone when the photo is not being changed", async () => {
    const t = fresh()
    await t.save({ imageDataUrl: PHOTO })
    await t.save() // a name-only edit
    expect(t.deleted, "a name change must not touch anyone's photo").toEqual([])
    expect(t.bucket.size).toBe(1)
  })

  it("has nothing to reclaim on the first photo", async () => {
    const t = fresh()
    await t.save({ imageDataUrl: PHOTO })
    expect(t.deleted).toEqual([])
    expect(t.bucket.size).toBe(1)
  })
})

describe("housekeeping never costs the person their save", () => {
  it("a delete that fails is recorded, not raised", async () => {
    const t = fresh({ deleteFails: true })
    await t.save({ imageDataUrl: PHOTO })
    const saved = await t.save({ imageDataUrl: PHOTO })

    expect(saved, "the profile save must still succeed").toHaveProperty("user")
    expect(t.row().image_url).toContain([...t.bucket.keys()].at(-1) as string)
    // Never swallowed: a bucket that has started refusing deletes has to be
    // visible somewhere (ERROR-HANDLING.md — the one recording seam).
    const logged = t.errorsLogged()
    expect(logged).toHaveLength(1)
    // The place must say RECLAIM, not just the route. Whoever reads this row at
    // 2am needs to know the save worked and only the housekeeping did not — a
    // bare "POST /api/auth/profile" reads as "the person could not save".
    expect(logged[0].place, "the place must name the step that failed").toContain("reclaim")
    expect(logged[0].place).toContain("/api/auth/profile")
    expect(logged[0].message).toContain("R2 said no")
  })
})

// A DELETE DRIVEN BY A STORED STRING HAS TO PROVE THE OBJECT IS OURS.
// image_url is read back out of the row; the photo URL is a capability (the
// /media door checks no session), so "the column said so" is not a good enough
// reason to remove an object. Only `/media/users/<this user's id>/…` qualifies.
describe("it will only reclaim this person's own object", () => {
  const leaveAlone = async (stored: string) => {
    const t = fresh()
    t.db.prepare("UPDATE users SET image_url = ? WHERE id = 'U1'").run(stored)
    await t.save({ imageDataUrl: PHOTO })
    expect(t.deleted, `must not delete anything for: ${stored}`).toEqual([])
  }

  it("refuses another person's prefix", () => leaveAlone("/media/users/U2/01ABCDEF"))
  it("refuses a team's logo", () => leaveAlone("/media/teams/T1/01ABCDEF"))
  it("refuses an address we never minted", () => leaveAlone("https://elsewhere.example/photo.png"))
  it("refuses a traversal dressed as a key", () => leaveAlone("/media/users/U1/../../secret"))

  it("…and still strips the cache-buster off a real one", async () => {
    const t = fresh()
    t.db.prepare("UPDATE users SET image_url = ? WHERE id = 'U1'").run("/media/users/U1/01ABCDEF?v=123")
    await t.save({ imageDataUrl: PHOTO })
    expect(t.deleted, "the ?v= is ours, not part of the key").toEqual(["users/U1/01ABCDEF"])
  })
})
