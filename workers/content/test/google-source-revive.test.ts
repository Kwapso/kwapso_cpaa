// ONE SHARE, ONE ROW — and "is it shared?" answered off a live row.
//
// THE FAILURE, MEASURED ON THE KWAPSO STAGING DATABASE ON 3 SEP 2026. The Chat
// space `spaces/AAQAT-RDqLA` (FluClinic) had SEVEN rows in `google_sources`, six
// of them retired. Fourteen (external_id, service) pairs were duplicated. Chat
// held 37 rows for 8 live shares; Drive held 35 for 3. And the visible half: the
// assistant told the owner a space he had shared "hasn't been shared with kwapso
// yet", because the spaces door decided that question off whichever row landed
// last in a `Map` — which, over a `created_at DESC` list, is the OLDEST, a
// headstone from three weeks earlier.
//
// TWO CAUSES, TWO FIXES, AND BOTH ARE HERE BECAUSE EITHER ALONE LEAVES IT BROKEN.
// `addNamedSource` inserted instead of reviving, so the duplicates existed; the
// spaces door read them wrong, so they were visible. The rows already written
// outlive the first fix, which is why the second is not redundant.
//
// PROVED BY RUNNING, not by reading: the data door is replaced and every
// statement the function would have sent is read back. A source scan would have
// accepted the word "UPDATE" in a comment — this file's own sibling
// (google-tokens.test.ts) exists because exactly that happened once.

import { beforeEach, describe, expect, it, vi } from "vitest"

/** The live connection every share hangs off — enough of a row for the module's
 * own mapper, and nothing more. */
const LIVE_CONNECTION = {
  id: "CONN-LIVE",
  user_id: "U1",
  service: "chat",
  google_email: "ana@agency.example",
  scopes: "openid email https://www.googleapis.com/auth/chat.messages.readonly",
  scope_mode: "everything",
  scope_event_types: "",
  last_used_at: null,
  last_error: null,
  created_at: "2026-08-26T04:39:00.000Z",
  creator_name: "Ana",
  updated_at: null,
  editor_name: null,
  deactivated_at: null,
}

/** Every statement the writer would have sent, SQL and bound values alike. */
const sent: { sql: string; params: unknown[] }[] = []
/** What the next `SELECT id, deactivated_at FROM google_sources` answers with. */
let existingRow: Record<string, unknown> | null = null
/** Whether the revive UPDATE moves a row — false is the race R17 is about. */
let reviveMoves = true

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const real = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  return {
    ...real,
    d1Query: vi.fn(async (_cfg: unknown, _db: unknown, sql: string, params?: unknown[]) => {
      sent.push({ sql, params: params ?? [] })
      if (sql.includes("FROM google_connections")) return [LIVE_CONNECTION]
      if (sql.includes("SELECT id, deactivated_at FROM google_sources"))
        return existingRow ? [existingRow] : []
      if (sql.includes("UPDATE google_sources")) return reviveMoves ? [{ id: existingRow?.id }] : []
      if (sql.includes("FROM accounts")) return [{ id: "ACC1" }]
      return []
    }),
    d1ExecScript: vi.fn(async (_cfg: unknown, _db: unknown, script: string) => {
      sent.push({ sql: script, params: [] })
    }),
  }
})

/** The activity feed is a different subject; it is watched, not exercised. */
const logged: { type: string; description: string }[] = []
vi.mock("@shared/workers/activity", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    logActivity: vi.fn(async (_cfg: unknown, _db: unknown, _actor: unknown, entry: { type: string; description: string }) => {
      logged.push(entry)
    }),
  }
})

import { addNamedSource } from "../src/lib/google"

const CFG = { accountId: "acct", apiToken: "tok" }
const GUARD = { userId: "U1", teamId: "T1", roleId: "R1", databaseId: "DB1" }
const ACTOR = { id: "U1", email: "ana@agency.example", name: "Ana" }
const SHARE = {
  service: "chat" as const,
  externalId: "spaces/AAQAT-RDqLA",
  name: "FluClinic",
  shelf: "team" as const,
  kind: "space" as const,
}

const statements = (like: string) => sent.filter((s) => s.sql.includes(like))

beforeEach(() => {
  sent.length = 0
  logged.length = 0
  existingRow = null
  reviveMoves = true
  vi.clearAllMocks()
})

describe("sharing something that already has a row", () => {
  it("the read is keyed on the PERSON and Google's id, never the connection", async () => {
    // Six of FluClinic's seven rows were six RECONNECTIONS: `disconnect` retires
    // a connection's sources with it, and reconnecting writes a new connection
    // id, so a lookup keyed on `connection_id` finds none of them. This is the
    // line that makes the fix cover the real data rather than one row of it.
    await addNamedSource(CFG, GUARD, ACTOR, SHARE)
    const look = statements("SELECT id, deactivated_at FROM google_sources")
    expect(look.length, "the existing-row read still happens").toBe(1)
    expect(look[0].sql).toContain("user_id = ?")
    expect(look[0].sql).toContain("service = ?")
    expect(look[0].sql).toContain("external_id = ?")
    expect(look[0].sql).not.toContain("connection_id = ?")
    // The one clause whose PRESENCE caused all of this: a retired row must be
    // VISIBLE to the read, or re-sharing inserts a headstone beside it. Asserted
    // over the WHERE alone — the ORDER BY names the same column on purpose, to
    // put a live row first, and a naive search of the whole statement would read
    // that as the bug it is there to prevent.
    const where = look[0].sql.slice(look[0].sql.indexOf("WHERE"), look[0].sql.indexOf("ORDER BY"))
    expect(where.length, "the WHERE was actually found").toBeGreaterThan(20)
    expect(where).not.toContain("deactivated_at")
    expect(look[0].params).toEqual(["U1", "chat", "spaces/AAQAT-RDqLA"])
  })

  it("a LIVE row is handed back untouched — a repeat is not an error", async () => {
    existingRow = { id: "SRC-LIVE", deactivated_at: null }
    const id = await addNamedSource(CFG, GUARD, ACTOR, SHARE)
    expect(id).toBe("SRC-LIVE")
    expect(statements("INSERT INTO google_sources")).toHaveLength(0)
    expect(statements("UPDATE google_sources")).toHaveLength(0)
    expect(logged, "nothing happened, so nothing is in the history").toHaveLength(0)
  })

  it("a RETIRED row is brought back, not duplicated — and keeps its own id", async () => {
    existingRow = { id: "SRC-OLD", deactivated_at: "2026-09-03T09:04:49.998Z" }
    const id = await addNamedSource(CFG, GUARD, ACTOR, SHARE)
    // The id is the point: the row's activity history hangs off it, and a new
    // row would leave three weeks of "shared"/"stopped sharing" pointing at
    // something nothing reads any more.
    expect(id).toBe("SRC-OLD")
    expect(statements("INSERT INTO google_sources"), "no headstone is left behind").toHaveLength(0)
    const revive = statements("UPDATE google_sources")
    expect(revive).toHaveLength(1)
    expect(revive[0].sql).toContain("deactivated_at = NULL")
    // R17: the current-status predicate rides the UPDATE.
    expect(revive[0].sql).toContain("deactivated_at IS NOT NULL")
    expect(revive[0].sql).toContain("user_id = ?")
    // Re-pointed at whichever connection is live now, or the row comes back
    // hanging off a connection that was revoked at Google.
    expect(revive[0].params).toContain("CONN-LIVE")
    expect(logged.map((l) => l.description)).toEqual([
      'Ana shared "FluClinic" again with the team',
    ])
  })

  it("…and when the revive moves ZERO rows, nothing is written and nothing rings", async () => {
    // R17's other half: two people sharing the same space at once. The loser
    // moves no row, so it writes no activity — and still answers with the id the
    // winner revived, which is the same id it would have returned going first.
    existingRow = { id: "SRC-OLD", deactivated_at: "2026-09-03T09:04:49.998Z" }
    reviveMoves = false
    const id = await addNamedSource(CFG, GUARD, ACTOR, SHARE)
    expect(id).toBe("SRC-OLD")
    expect(logged).toHaveLength(0)
  })

  it("nothing there at all is still an INSERT", async () => {
    existingRow = null
    const id = await addNamedSource(CFG, GUARD, ACTOR, SHARE)
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(statements("INSERT INTO google_sources")).toHaveLength(1)
    expect(statements("UPDATE google_sources")).toHaveLength(0)
    expect(logged).toHaveLength(1)
  })

  it("a bad client id is refused whether the row is made or brought back", async () => {
    // The check moved above the branch when the revive landed; if it had stayed
    // where it was, reviving would have accepted a compartment nobody owns —
    // which is a slice of the knowledge base nothing can ever reach again.
    const { d1Query } = await import("@shared/workers/d1-rest")
    ;(d1Query as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(
      async (_c: unknown, _d: unknown, sql: string) => {
        if (sql.includes("FROM google_connections")) return [LIVE_CONNECTION]
        if (sql.includes("SELECT id, deactivated_at FROM google_sources"))
          return [{ id: "SRC-OLD", deactivated_at: "2026-09-03T09:04:49.998Z" }]
        if (sql.includes("FROM accounts")) return []
        return []
      }
    )
    await expect(
      addNamedSource(CFG, GUARD, ACTOR, { ...SHARE, accountId: "NOT-A-CLIENT" })
    ).rejects.toThrow(/doesn't exist/)
  })
})

// ── AND THE READING HALF ─────────────────────────────────────────────────────
//
// The rows above stop being written. The rows already written do not go away, so
// the door that answers "is this space shared?" must not depend on there being
// none of them — and, more simply, that question has an answer that should not
// depend on which of seven rows you happen to read.
//
// The door is RUN, with real duplicate rows in the shape staging actually holds:
// six headstones and one live row, oldest first as `listNamedSources` orders it.

vi.mock("@shared/workers/route", () => ({
  gated: async () => ({ cfg: CFG, guard: GUARD, actor: ACTOR }),
  gatedBody: async () => ({ cfg: CFG, guard: GUARD, actor: ACTOR, body: {} }),
}))
vi.mock("@shared/workers/account-scope", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refusePortalCaller: async () => {},
}))

/** The rows the door is handed, in `listNamedSources`' own order. */
let sourceRows: { id: string; externalId: string; active: boolean; createdAt: string }[] = []
vi.mock("../src/lib/google", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    accessTokenFor: async () => ({ token: "tok", connectionId: "CONN-LIVE", grantedScopes: "" }),
    listNamedSources: async () => sourceRows,
  }
})
vi.mock("../src/lib/google-api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  chatSpaces: async () => [{ name: "spaces/AAQAT-RDqLA", displayName: "FluClinic" }],
}))

import { getGoogleChatSpaces } from "../src/routes/google"

describe("is this space shared? — asked of seven rows", () => {
  /** FluClinic as staging held it on 3 Sep 2026: six retired, one live, and
   * `created_at DESC` so the live one (written 09:05:07, eighteen seconds after
   * the sixth was retired) comes FIRST and the oldest headstone comes LAST. */
  const FLUCLINIC = [
    { id: "SRC-7", externalId: "spaces/AAQAT-RDqLA", active: true, createdAt: "2026-09-03T09:05:07.238Z" },
    { id: "SRC-6", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-26T04:39:54.711Z" },
    { id: "SRC-5", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-25T11:09:12.275Z" },
    { id: "SRC-4", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-20T08:28:40.276Z" },
    { id: "SRC-3", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-19T18:40:26.736Z" },
    { id: "SRC-2", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-19T04:03:17.058Z" },
    { id: "SRC-1", externalId: "spaces/AAQAT-RDqLA", active: false, createdAt: "2026-08-17T08:42:12.540Z" },
  ]

  async function ask() {
    const res = await getGoogleChatSpaces(new Request("https://x/api/content/google/chat/spaces"), {} as never)
    return (await res.json()) as { spaces: { externalId: string; sourceId: string | null; shared: boolean }[] }
  }

  it("YES — a live row anywhere in the pile is the answer", async () => {
    sourceRows = FLUCLINIC
    const { spaces } = await ask()
    // The sentence the owner got was "hasn't been shared with kwapso yet", and
    // he replied "??? it is a shared space..". He was right.
    expect(spaces[0].shared).toBe(true)
    // …and the id handed back is the LIVE row's, because the messages door will
    // refuse a retired one. A true `shared` beside a dead `sourceId` would be a
    // worse bug than the one it replaced.
    expect(spaces[0].sourceId).toBe("SRC-7")
  })

  it("…in whatever order the list arrives", async () => {
    // The original fault was an ordering accident (a `Map` keeps the LAST entry,
    // and the list is newest-first, so the OLDEST row won). A fix that only
    // works newest-first has swapped one accident for another.
    sourceRows = [...FLUCLINIC].reverse()
    expect((await ask()).spaces[0]).toMatchObject({ shared: true, sourceId: "SRC-7" })
  })

  it("NO when every row really is retired", async () => {
    sourceRows = FLUCLINIC.filter((r) => !r.active)
    const { spaces } = await ask()
    expect(spaces[0].shared).toBe(false)
    // Still names a row, so the screen can tell "I could share this" from "I
    // already have" — which is the whole reason this door carries the id.
    expect(spaces[0].sourceId).toBeTruthy()
  })

  it("NO, and no row at all, for a space nobody has ever shared", async () => {
    sourceRows = []
    expect((await ask()).spaces[0]).toMatchObject({ shared: false, sourceId: null })
  })
})
