// AN APP'S LOGO IS BYTES IN R2 AND A PATH ON THE ROW — never the picture itself.
//
// The column exists because twenty-eight apps came across from Glide and every
// one of their logos stayed behind, so the apps screen drew the same stage glyph
// on every tile. What makes that fix worth a suite is the SHAPE of the fix
// rather than the column: the door takes a data URL and must turn it into an
// object, and the tempting version of the same feature — `optionalText` straight
// into the column — passes every other check in this repo while being wrong
// three ways over.
//
//   1. `safeSrc` REFUSES a data URL (shared/web/rich-text.ts allows http and
//      https only), so the tile would render nothing at all and the bug would
//      look fixed in the database and unfixed on screen;
//   2. a 512px JPEG is ~60 KB of base64, and the apps list is read WHOLE — so
//      twenty-eight of them is a megabyte and a half on every read of a screen
//      somebody opens all day;
//   3. the door's type allow-list is the stored-XSS boundary. `parseDataUrl`
//      takes png, jpeg and webp; an `image/svg+xml` served back from `/media/*`
//      on the app's own origin is a script running in a viewer's session.
//
// So the suite runs the REAL doors against a real SQLite database with the real
// migrations, and asks the row what it holds — not the handler what it returned.
//
// AND IT ASKS AT THE SIZE A PICTURE ACTUALLY IS. Every case below used a
// ONE-PIXEL PNG, 110 characters of base64, and every one of them passed while
// the door refused every real logo: the field was capped with `TEXT_LIMITS.long`
// (20,000 characters — the PROSE cap, about 14 KB of image) three lines above
// the seam that turns the bytes into an object, so the browser's own downsized
// 512px JPEG came back "Logo is too long" and the Glide migration reported it
// fifty-five times. A test that proves the SHAPE and never the SIZE proves half
// a door. The account door is in this suite for the same reason: it is the same
// sentence, said about `logoUrl` and `coverUrl`, and it had no suite at all.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { TEXT_LIMITS } from "@shared/workers/validate"

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

/** A one-pixel PNG, as the browser's picker would hand it over. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** A picked logo at the size a picked logo IS — ~45 KB, which is what
 * `web/lib/image.ts` hands back after downsizing a phone photo to 512px, and
 * what every logo in the Glide export turned out to be. The payload is filler
 * rather than a photograph on purpose: the door judges the declared type and the
 * base64 shape, and a real 45 KB image pasted into a test file is a test nobody
 * can read. What matters is the LENGTH. */
const PICKED = `data:image/jpeg;base64,${"A".repeat(60_000)}`
const PICKED_BYTES = 45_000

/** An R2 stub that records every object written. */
function bucket() {
  const puts: { key: string; contentType: string; bytes: number }[] = []
  return {
    puts,
    r2: {
      async put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }) {
        puts.push({ key, contentType: options.httpMetadata.contentType, bytes: bytes.byteLength })
      },
    },
  }
}

let media: ReturnType<typeof bucket>
const asStaff = () => ({ ...(makeEnv(() => holder.db as DatabaseSync, IDS.staffUser) as object), MEDIA: media.r2 }) as never

/** Record an app and hand back its id. The body is read ONCE — a Response can
 * only be drained once, so reading it inside an assertion message costs you the
 * body you were about to parse. */
async function recordApp(body: Record<string, unknown>): Promise<string> {
  const res = await worker.fetch(req("POST /api/tenancy/apps", body), asStaff())
  const text = await res.text()
  expect(res.status, text).toBe(200)
  return (JSON.parse(text) as { id: string }).id
}

/** What the ROW holds, read straight out of the database rather than off any
 * response — the whole point of this suite is that the two can disagree. */
const storedLogo = (id: string) =>
  (holder.db?.prepare("SELECT logo_url FROM apps WHERE id = ?").get(id) as { logo_url: string | null } | undefined)
    ?.logo_url ?? null

beforeEach(() => {
  holder.db = buildSpineDb()
  media = bucket()
})

describe("a picked logo becomes an object, and the row keeps the path", () => {
  it("stores the bytes and writes a /media path — never the data URL", async () => {
    const id = await recordApp({ name: "HORST", accountId: IDS.victimAccount, logoUrl: PNG })

    expect(media.puts, "the bytes must reach the bucket").toHaveLength(1)
    expect(media.puts[0].contentType).toBe("image/png")
    expect(
      media.puts[0].key.startsWith(`${IDS.team}/apps/`),
      `the key must sit under this team's own prefix, got ${media.puts[0].key}`
    ).toBe(true)

    const stored = storedLogo(id)
    expect(stored, "the column holds a path").toContain(`/media/${IDS.team}/apps/`)
    expect(
      stored?.startsWith("data:"),
      "the picture itself must never land in the column — safeSrc would refuse it and every list read would carry it"
    ).toBe(false)
  })

  it("keeps the logo through an edit that never mentions it", async () => {
    const id = await recordApp({ name: "FluClinic", logoUrl: PNG })
    const before = storedLogo(id)

    // The stage moves; nothing says anything about a picture. A machine editing
    // one field must not silently take an app's mark away.
    const res = await worker.fetch(
      req("POST /api/tenancy/apps/update", { id, name: "FluClinic", stage: "Live" }),
      asStaff()
    )
    expect(res.status, await res.text()).toBe(200)
    expect(storedLogo(id), "absent means say nothing").toBe(before)
    expect(media.puts, "and nothing new was uploaded").toHaveLength(1)
  })

  it("clears the logo when the field is sent empty", async () => {
    const id = await recordApp({ name: "CONFIA", logoUrl: PNG })

    const res = await worker.fetch(
      req("POST /api/tenancy/apps/update", { id, name: "CONFIA", logoUrl: "" }),
      asStaff()
    )
    expect(res.status, await res.text()).toBe(200)
    expect(storedLogo(id), "sent-and-empty means take the picture away").toBeNull()
  })

  it("refuses a type that could run as script, and writes nothing at all", async () => {
    // SVG and HTML are the two that matter: `/media/*` serves an object back
    // under its declared type on the app's OWN origin, so either one is a page
    // that runs JavaScript in a viewer's session.
    for (const hostile of [
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    ]) {
      const res = await worker.fetch(req("POST /api/tenancy/apps", { name: "Probe", logoUrl: hostile }), asStaff())
      expect(res.status, `${hostile.slice(0, 24)}… must be refused`).toBe(400)
      expect(media.puts, "and nothing may reach the bucket on the way to being refused").toHaveLength(0)
    }
  })

  it("lets an app be recorded with no logo at all", async () => {
    const id = await recordApp({ name: "Fuhrpark" })
    expect(storedLogo(id)).toBeNull()
    expect(media.puts).toHaveLength(0)
  })
})

describe("a picture is measured in bytes, not in paragraphs", () => {
  it("takes a real picked logo — the size the door was refusing", async () => {
    expect(PICKED.length, "the case must stay bigger than the prose cap that refused it").toBeGreaterThan(
      TEXT_LIMITS.long
    )
    const id = await recordApp({ name: "Amstella", logoUrl: PICKED })

    expect(media.puts, "45 KB of JPEG must reach the bucket").toHaveLength(1)
    expect(media.puts[0].bytes).toBe(PICKED_BYTES)
    expect(storedLogo(id)).toContain(`/media/${IDS.team}/apps/`)
  })

  it("takes one on the edit door too, which is the one the migration used", async () => {
    const id = await recordApp({ name: "IFNW" })
    const res = await worker.fetch(
      req("POST /api/tenancy/apps/update", { id, name: "IFNW", logoUrl: PICKED }),
      asStaff()
    )
    expect(res.status, await res.text()).toBe(200)
    expect(storedLogo(id), "a 200 is not proof — the row has to hold the path").toContain(
      `/media/${IDS.team}/apps/`
    )
  })

  it("takes an account's logo AND its cover, both at that size", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/accounts", {
        accountType: "entity",
        name: "Ontime Logistics",
        logoUrl: PICKED,
        coverUrl: PICKED,
      }),
      asStaff()
    )
    const text = await res.text()
    expect(res.status, text).toBe(200)
    const { id } = JSON.parse(text) as { id: string }

    expect(media.puts, "a company has a mark AND a masthead — two objects").toHaveLength(2)
    const row = holder.db
      ?.prepare("SELECT logo_url, cover_url FROM accounts WHERE id = ?")
      .get(id) as { logo_url: string | null; cover_url: string | null }
    expect(row.logo_url).toContain(`/media/${IDS.team}/accounts/`)
    expect(row.cover_url).toContain(`/media/${IDS.team}/accounts/`)
    expect(row.logo_url).not.toBe(row.cover_url) // a key per upload, never one shared
  })

  // The cap that stays: a value that is NOT a picture passes straight through
  // the store seam and into the column, and the column is read on every row of
  // every list. So the picture cap must not have become one big cap for both.
  it("still refuses megabytes of something that is not a picture", async () => {
    const res = await worker.fetch(
      req("POST /api/tenancy/apps", { name: "Probe", logoUrl: `/media/${"x".repeat(2_000_000)}` }),
      asStaff()
    )
    expect(res.status, "a non-data-URL is a path, and a path is a link").toBe(400)
    expect(media.puts).toHaveLength(0)
  })
})
