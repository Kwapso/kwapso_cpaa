// MIGRATION 0043 — a brand colour stops being a link to somebody else's website.
//
// The library held 24 `Color` rows whose "file" was a URL at colorhexa.com, and
// NINE of them at `corhexa.com` — a domain one letter off the one we meant,
// owned by somebody else, sitting in the agency's own brand library. Every other
// category (46 rows across seven types) was already hosted here, so colour was
// the whole of the library's external surface — and the hex was in the URL the
// entire time.
//
// The SQL is exercised by every suite that builds a team database, so "does it
// run" is already answered. This answers the question that actually matters:
// does it convert the RIGHT rows to the RIGHT colours, and leave everything else
// exactly where it was. The two hosts wrote two different shapes and both are
// planted here, because assuming one shape is how the other one survives.
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { TEAM_MIGRATIONS } from "../src/team-schema"

const CONVERTED_BY = "0043_a_colour_is_not_a_picture"

/** Every migration BEFORE 0043, so the fixtures can be planted the way a real
 * team's rows were: written under the old schema, converted by the new one. */
function upTo(version: string): { version: string; sql: string }[] {
  const at = TEAM_MIGRATIONS.findIndex((m) => m.version === version)
  expect(at, `${version} is not in TEAM_MIGRATIONS — did it get renamed?`).toBeGreaterThan(-1)
  return TEAM_MIGRATIONS.slice(0, at)
}

const holder: { db: DatabaseSync | null } = { db: null }
const db = () => holder.db as DatabaseSync

/** One brand asset as it stood before the migration. */
function plant(id: string, name: string, category: string, fileUrl: string | null) {
  db()
    .prepare(
      `INSERT INTO brand_assets (id, name, category, file_url, created_at, creator_name)
       VALUES (?, ?, ?, ?, '2026-01-01T00:00:00.000Z', 'System')`
    )
    .run(id, name, category, fileUrl)
}

const read = (id: string) =>
  db().prepare("SELECT file_url, color_hex FROM brand_assets WHERE id = ?").get(id) as {
    file_url: string | null
    color_hex: string | null
  }

function runTheMigration() {
  db().exec(TEAM_MIGRATIONS.find((m) => m.version === CONVERTED_BY)!.sql)
}

beforeEach(() => {
  holder.db = new DatabaseSync(":memory:")
  for (const m of upTo(CONVERTED_BY)) db().exec(m.sql)

  // THE TYPOSQUAT, in the two shapes it was written in.
  plant("A_SQUAT_PNG_PATH", "6", "Color", "https://corhexa.com/png/600x300/f4c600")
  plant("A_SQUAT_BARE", "12", "Color", "https://corhexa.com/FFFFFF")
  // THE LEGITIMATE HOST, whose URLs end in an extension the other's do not.
  plant("A_REAL_UPPER", "5", "Color", "https://www.colorhexa.com/FDE0F8.png")
  plant("A_REAL_LOWER", "4", "Color", "https://www.colorhexa.com/0b0d0f.png")
  // A COLOUR WE ALREADY HOST — the one row of the 25 that was never external.
  plant("A_OURS", "5", "Color", "/media/internal/T/01M0B4JQX7VEWXW69")
  // AND A ROW THAT IS NOT A COLOUR AT ALL. Its URL happens to end in six
  // characters that ARE valid hex, which is the trap a category-blind
  // predicate falls into.
  plant("A_LOGO", "Primary logo", "Logo", "https://cdn.example.com/logo/abc123")
})

describe("0043 · a colour is stored as a colour, not as a link to a picture of one", () => {
  it("converts both URL shapes to the hex that was inside them", () => {
    runTheMigration()
    // The path shape: the hex is the last six characters, lower-case as stored.
    expect(read("A_SQUAT_PNG_PATH").color_hex).toBe("#F4C600")
    expect(read("A_SQUAT_BARE").color_hex).toBe("#FFFFFF")
    // The extension shape: the `.png` comes off first, or the hex reads "0F.PNG".
    expect(read("A_REAL_UPPER").color_hex).toBe("#FDE0F8")
    expect(read("A_REAL_LOWER").color_hex).toBe("#0B0D0F")
  })

  it("clears the link it converted — the typosquat leaves the database", () => {
    runTheMigration()
    for (const id of ["A_SQUAT_PNG_PATH", "A_SQUAT_BARE", "A_REAL_UPPER", "A_REAL_LOWER"])
      expect(read(id).file_url, `${id} kept the URL the colour replaced`).toBeNull()
    // Said the other way, because this is the whole point of the migration: the
    // word does not survive anywhere in the table.
    const left = db()
      .prepare("SELECT count(*) AS n FROM brand_assets WHERE file_url LIKE '%hexa%'")
      .get() as { n: number }
    expect(left.n, "a hexa.com link survived the migration").toBe(0)
  })

  it("leaves a colour we host, and a row that is not a colour, exactly alone", () => {
    runTheMigration()
    // Ours is a real file. It has no hex to find and must keep its bytes.
    expect(read("A_OURS").file_url).toBe("/media/internal/T/01M0B4JQX7VEWXW69")
    expect(read("A_OURS").color_hex).toBeNull()
    // The logo's URL ends in `abc123` — six valid hex digits. Only the category
    // and the host keep it out, which is why it is planted at all.
    expect(read("A_LOGO").file_url).toBe("https://cdn.example.com/logo/abc123")
    expect(read("A_LOGO").color_hex).toBeNull()
  })

  it("is re-runnable — a second pass converts nothing and breaks nothing", () => {
    runTheMigration()
    const after = read("A_SQUAT_PNG_PATH")
    // `ALTER TABLE` would throw on a second pass, so the statement that carries
    // the backfill is what gets re-run — the same half a retried migration
    // reaches in production.
    db().exec(TEAM_MIGRATIONS.find((m) => m.version === CONVERTED_BY)!.sql.split(";").slice(1).join(";"))
    expect(read("A_SQUAT_PNG_PATH")).toEqual(after)
    expect(read("A_OURS").file_url).toBe("/media/internal/T/01M0B4JQX7VEWXW69")
  })
})
