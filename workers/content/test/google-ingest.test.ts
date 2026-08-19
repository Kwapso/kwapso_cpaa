// GOOGLE MATERIAL BECOMING KNOWLEDGE, end to end, against a real SQLite database
// running the real team migrations — the shipped door, the shipped gate, the
// shipped sweep, the shipped SQL. Three things are stubbed and no more: the D1
// REST transport (pointed at the in-memory database), the embedding model, and
// GOOGLE ITSELF — because the one thing this suite must never need is somebody's
// real mailbox.
//
// WHAT IT IS FOR, in one sentence each:
//   • THE SHELF IS THE FENCE. A folder somebody filed as team material answers a
//     colleague; one they kept to themselves answers only them. That is the
//     design round's own answer to "can a colleague get an answer built from a
//     document in YOUR Drive?" — "only if you filed it as team material" — and
//     it is a property of a COLUMN here, not of a habit.
//   • THE COMPARTMENT IS DECIDED, NOT GUESSED. A Drive folder says whose it is
//     because somebody said so when they named it; a mail says whose it is
//     because a known contact is on it. Neither is a client's name matched out
//     of the text.
//   • A CRON CANNOT DO ANY OF THIS. Everything above is read with one person's
//     own token, so the scheduled sweep must not be able to reach these kinds at
//     all — not "would find nothing", which is a silent pass wearing a green
//     tick, but structurally cannot name them.
//   • A CLIENT LOGIN REACHES NO DOOR OF IT (R21).

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  db: null as DatabaseSync | null,
  /** Ids Google STOPS LISTING — which on its own proves nothing at all. */
  unlisted: new Set<string>(),
  /** Ids Google positively says have gone: in the bin, called off, or 404.
   * The only signal that may retire a source. */
  binned: new Set<string>(),
}))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

// THE TOKENS, OPENED WITHOUT A KEY. The real sealing is AES-GCM under a secret
// this suite has no business holding; what is under test is what happens to the
// material AFTER a token resolves, so the crypto is the identity function here
// and is tested for real in google-tokens.test.ts.
vi.mock("../src/lib/google-crypto", () => ({
  sealToken: async (_env: unknown, v: string) => v,
  openToken: async (_env: unknown, v: string) => v,
  tokenStorageReady: () => true,
}))

// GOOGLE ITSELF. Fixtures, deliberately small and deliberately mixed: one file
// in a folder filed under a client, one in a folder filed under nobody, a mail
// with a known contact on it, an event with one on the guest list, and a space's
// worth of chatter.
vi.mock("../src/lib/google-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/google-api")>()
  return {
    ...actual,
    googlePresence: async (_s: string, _t: string, id: string) =>
      holder.binned.has(id) ? "gone" : "there",
    driveList: async (_t: string, folderIds: string[]) =>
      folderIds.filter((f) => !holder.unlisted.has(f)).flatMap((folderId) =>
        folderId === "FOLDER_CLIENT"
          ? [
              {
                id: "FILE_1",
                name: "Bergman dispatch rollout",
                mimeType: "application/vnd.google-apps.document",
                modifiedTime: "2026-08-01T09:00:00.000Z",
                webViewLink: "https://drive.example/FILE_1",
                folderId,
              },
            ]
          : [
              {
                id: "FILE_2",
                name: "My own reading list",
                mimeType: "application/vnd.google-apps.document",
                modifiedTime: "2026-08-02T09:00:00.000Z",
                webViewLink: "https://drive.example/FILE_2",
                folderId,
              },
            ]
      ),
    driveFileText: async (_t: string, fileId: string) =>
      fileId === "FILE_1"
        ? "The dispatch screen keeps logging drivers out. Agreed to move the driver app forward."
        : "Books I mean to read.",
    gmailSearch: async () =>
      holder.unlisted.has("MAIL_1")
        ? []
        : [
      {
        id: "MAIL_1",
        threadId: "TH_1",
        from: "Luis Vera <luis@bergman.example>",
        to: "me@kwapso.app",
        subject: "Re: the dispatch screen",
        snippet: "a snippet",
        date: "Tue, 4 Aug 2026 10:04:00 +0000",
            url: "https://mail.example/MAIL_1",
            text: "",
          },
        ],
    gmailMessage: async () => ({
      id: "MAIL_1",
      threadId: "TH_1",
      from: "Luis Vera <luis@bergman.example>",
      to: "me@kwapso.app",
      subject: "Re: the dispatch screen",
      snippet: "a snippet",
      date: "Tue, 4 Aug 2026 10:04:00 +0000",
      url: "https://mail.example/MAIL_1",
      text: "We agreed on the fourth of August to park the reporting work.",
    }),
    calendarList: async () => ({
      truncated: false,
      events: holder.unlisted.has("EVENT_1")
        ? []
        : [
      {
        id: "EVENT_1",
        summary: "Quarterly review",
        description: "Agreed to move the driver app forward.",
        start: "2026-08-05T09:00:00.000Z",
        end: "2026-08-05T10:00:00.000Z",
        url: "https://calendar.example/EVENT_1",
        // A guest is an OBJECT now, not an address: an invitation says who was
        // asked AND what they answered, and the compartment still comes off the
        // address exactly as it did (lib/google-api.ts EventGuest says why one
        // field carrying both beats two fields that can disagree).
        attendees: [
          { email: "luis@bergman.example", name: "Luis", response: "accepted", organizer: false, optional: false, resource: false },
              { email: "me@kwapso.app", name: "Me", response: "accepted", organizer: true, optional: false, resource: false },
            ],
          },
        ],
    }),
    chatMessages: async () => [
      {
        id: "MSG_2",
        space: "spaces/AAA",
        sender: "Aurora",
        text: "second thing said",
        createdAt: "2026-08-03T11:00:00.000Z",
      },
      {
        id: "MSG_1",
        space: "spaces/AAA",
        sender: "Ana",
        text: "first thing said",
        createdAt: "2026-08-03T10:00:00.000Z",
      },
    ],
  }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { tokenise } from "../src/lib/knowledge-text"
import { INGEST_KINDS } from "../src/lib/knowledge-ingest"
import { GOOGLE_SOURCE_KINDS, googleStateKeys } from "../src/lib/knowledge-google"

const db = () => holder.db as DatabaseSync

/** A SECOND staff member. The personal fence is a fence between COLLEAGUES —
 * everybody else in the shared fixture is a client login, and a client login is
 * refused at the door long before a fence is reached. */
const OTHER_STAFF = "U_STAFF_2"

/** A contact who sits UNDER Bergman and has an email address — the row that
 * proves "mail with Marta is BERGMAN's material, not Marta's". */
const CONTACT = "A_BERG_CONTACT"

function fakeVector(text: string): number[] {
  const v = Array.from({ length: 64 }, () => 0)
  for (const [term, weight] of tokenise(text)) {
    let h = 0
    for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) >>> 0
    v[h % 64] += weight
  }
  return v
}

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    GOOGLE_CONNECT_CLIENT_ID: "id",
    GOOGLE_CONNECT_CLIENT_SECRET: "secret",
    GOOGLE_TOKEN_KEY: "key",
    AI: { run: async (_m: string, i: { text: string[] }) => ({ data: i.text.map(fakeVector) }) },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

type SourceRow = {
  id: string
  kind: string
  origin_table: string
  origin_row_id: string
  compartment: string
  account_id: string | null
  owner_user_id: string | null
  title: string
  body: string
}

const sources = (): SourceRow[] =>
  db()
    .prepare(
      `SELECT id, kind, origin_table, origin_row_id, compartment, account_id, owner_user_id, title, body
         FROM knowledge_sources WHERE origin_table LIKE 'google_%' ORDER BY origin_table, origin_row_id`
    )
    .all() as SourceRow[]

const byTitle = (t: string) => sources().find((s) => s.title.includes(t))

/** Connect all four services for one person, and name two Drive folders and a
 * Chat space through the REAL tables — a fixture written the way the doors write
 * it, so nothing here can be true of the test and false of the app. */
function connect(userId: string) {
  const future = new Date(Date.now() + 3_600_000).toISOString()
  for (const service of ["drive", "gmail", "calendar", "chat"]) {
    db().exec(
      `INSERT INTO google_connections (id, user_id, service, google_email, scopes, access_token,
         access_expires_at, refresh_token, created_at, creator_id)
       VALUES ('C_${userId}_${service}', '${userId}', '${service}', 'me@kwapso.app', 'scope',
         'plain-access', '${future}', 'plain-refresh', '2026-01-01', '${userId}');`
    )
  }
  db().exec(
    // Filed under Bergman AND on the team's shelf: a colleague's question about
    // Bergman may be answered from it.
    `INSERT INTO google_sources (id, connection_id, user_id, service, external_id, name, shelf, account_id, created_at, creator_id)
     VALUES ('S_CLIENT_${userId}', 'C_${userId}_drive', '${userId}', 'drive', 'FOLDER_CLIENT',
       'Bergman shared drive', 'team', '${IDS.victimAccount}', '2026-01-01', '${userId}');
     -- Filed under nobody and kept private: the agency's compartment, this
     -- person's answers only.
     INSERT INTO google_sources (id, connection_id, user_id, service, external_id, name, shelf, account_id, created_at, creator_id)
     VALUES ('S_MINE_${userId}', 'C_${userId}_drive', '${userId}', 'drive', 'FOLDER_MINE',
       'My own folder', 'private', NULL, '2026-01-01', '${userId}');
     INSERT INTO google_sources (id, connection_id, user_id, service, external_id, name, shelf, account_id, created_at, creator_id)
     VALUES ('S_SPACE_${userId}', 'C_${userId}_chat', '${userId}', 'chat', 'spaces/AAA',
       'Delivery room', 'team', '${IDS.victimAccount}', '2026-01-01', '${userId}');`
  )
}

beforeEach(() => {
  holder.db = buildSpineDb()
  holder.unlisted.clear()
  holder.binned.clear()
  db().exec(
    `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('${OTHER_STAFF}', 'aurora@kwapso.app', 'Aurora', '${IDS.team}');
     INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m5', '${IDS.team}', '${OTHER_STAFF}', '${IDS.adminRole}', '2026-01-01');
     INSERT INTO accounts (id, account_type, parent_account_id, name, email, created_at, creator_id)
       VALUES ('${CONTACT}', 'individual', '${IDS.victimAccount}', 'Luis Vera', 'luis@bergman.example', '2026-01-01', '${IDS.staffUser}');`
  )
  // BOTH roles hold every knowledge and Google right, so a refusal below is the
  // DOOR's and never the role's.
  for (const role of [IDS.adminRole, IDS.clientRole])
    for (const module of ["knowledge", "google"])
      db().exec(
        `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('${role}_${module}', '${role}', '${module}', 1, 1, 1, 1);`
      )
  connect(IDS.staffUser)
})

describe("R21 — a client login gets no Google surface at all", () => {
  it("the personal sweep door refuses them, whatever their role holds", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/knowledge/sync-google", {})
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: string }).toMatchObject({ error: "client_login" })
    expect(sources().length, "nothing they asked for reached the database").toBe(0)
  })
})

describe("the shelf is the fence", () => {
  it("team material has no owner and private material is owned by the person it came through", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    expect(res.status).toBe(200)

    const shared = byTitle("Bergman dispatch rollout")
    const mine = byTitle("My own reading list")
    expect(shared, "the file in the team-shelved folder should have been filed").toBeTruthy()
    expect(mine, "the file in the private folder should have been filed too").toBeTruthy()

    // THE WHOLE POINT, in two assertions: same person, same Drive, same sweep —
    // two different answers about who may ever be answered from it.
    expect(shared?.owner_user_id, "a team-shelved folder's contents belong to the team").toBeNull()
    expect(mine?.owner_user_id, "a private folder's contents belong to the person alone").toBe(IDS.staffUser)
  })

  it("a mailbox and a diary are always private, because nobody ever declared them shared", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    for (const title of ["Re: the dispatch screen", "Quarterly review"])
      expect(byTitle(title)?.owner_user_id, `${title} must stay its owner's`).toBe(IDS.staffUser)
  })

  it("the fence travels down to the CHUNKS, which is where the search reads it", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    const mine = byTitle("My own reading list") as SourceRow
    const chunks = db()
      .prepare("SELECT DISTINCT owner_user_id AS o FROM knowledge_chunks WHERE source_id = ?")
      .all(mine.id) as { o: string | null }[]
    expect(chunks.length, "the private file must have been chunked at all").toBeGreaterThan(0)
    for (const c of chunks) expect(c.o).toBe(IDS.staffUser)
    const terms = db()
      .prepare(
        `SELECT DISTINCT owner_user_id AS o FROM knowledge_terms
          WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)`
      )
      .all(mine.id) as { o: string | null }[]
    for (const t of terms) expect(t.o, "stage one of the search reads the fence off the postings").toBe(IDS.staffUser)
  })

  it("moving a folder to the team's shelf re-indexes it, even though its text never changed", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    const before = byTitle("My own reading list") as SourceRow
    expect(before.owner_user_id).toBe(IDS.staffUser)

    // The one act under test: the same folder, re-shelved. Nothing about the
    // file itself moves.
    db().exec(`UPDATE google_sources SET shelf = 'team' WHERE id = 'S_MINE_${IDS.staffUser}';`)
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})

    const after = byTitle("My own reading list") as SourceRow
    expect(after.id, "it must be the SAME source row, not a second one").toBe(before.id)
    expect(after.owner_user_id, "the row's fence moved").toBeNull()
    const chunks = db()
      .prepare("SELECT DISTINCT owner_user_id AS o FROM knowledge_chunks WHERE source_id = ?")
      .all(before.id) as { o: string | null }[]
    expect(chunks.length).toBeGreaterThan(0)
    // WITHOUT the hash being cleared on an owner change, these would still carry
    // the old owner: the text is identical, so the hash-skip would have skipped
    // it — and the colleague this was just shared with would still find nothing.
    for (const c of chunks) expect(c.o, "the fence on the postings moved with it").toBeNull()
  })
})

describe("the compartment is decided, not guessed", () => {
  it("a folder filed under a client puts its contents in that client's compartment", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    expect(byTitle("Bergman dispatch rollout")?.compartment).toBe(`account:${IDS.victimAccount}`)
    expect(byTitle("Bergman dispatch rollout")?.account_id).toBe(IDS.victimAccount)
  })

  it("a folder filed under nobody stays in the agency's own compartment", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    expect(byTitle("My own reading list")?.compartment).toBe("agency")
    expect(byTitle("My own reading list")?.account_id).toBeNull()
  })

  it("mail and a diary entry are filed under the CLIENT the known contact belongs to, not the contact", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    // Luis Vera is a person account UNDER Bergman. A conversation with him is
    // Bergman's material — filing it under Luis would put it in a slice no
    // question about Bergman ever searches.
    expect(byTitle("Re: the dispatch screen")?.account_id, "mail with a contact is their COMPANY's").toBe(
      IDS.victimAccount
    )
    expect(byTitle("Quarterly review")?.account_id, "an event with a client on the invitation is theirs").toBe(
      IDS.victimAccount
    )
  })
})

describe("what actually gets read", () => {
  it("a Drive file's real text is indexed, not its name", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    expect(byTitle("Bergman dispatch rollout")?.body).toContain("keeps logging drivers out")
  })

  it("a mail's BODY replaces the snippet the listing carried", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    const mail = byTitle("Re: the dispatch screen") as SourceRow
    expect(mail.body).toContain("park the reporting work")
    expect(mail.body, "the hundred-character snippet is not what answers a question").not.toBe("a snippet")
  })

  it("a Chat SPACE is one source holding its conversation, not one source per message", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    const spaces = sources().filter((s) => s.origin_table === "google_chat")
    expect(spaces.length, "two messages in one space are one source").toBe(1)
    // Google hands the newest first; a conversation reads forwards.
    expect(spaces[0].body.indexOf("first thing said")).toBeLessThan(spaces[0].body.indexOf("second thing said"))
  })

  it("two colleagues who named the same folder get a row each, so neither decides the other's shelf", async () => {
    connect(OTHER_STAFF)
    db().exec(`UPDATE google_sources SET shelf = 'private' WHERE id = 'S_CLIENT_${OTHER_STAFF}';`)
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    await call(OTHER_STAFF, "POST /api/content/knowledge/sync-google", {})

    const both = sources().filter((s) => s.title === "Bergman dispatch rollout")
    expect(both.length, "one file, two people's sight of it").toBe(2)
    expect(both.map((s) => s.owner_user_id).sort(), "and two different answers about who may read it").toEqual(
      [OTHER_STAFF, null].sort()
    )
  })
})

// THE RULING CHANGED ON 19 AUG 2026, and this block changed with it.
//
// It used to assert that a schedule reads NOBODY's Google. The owner asked for
// the opposite — "whatever makes it more seamless is better" — so what has to be
// defended is no longer "never", it is "only ever as a named person who
// connected their own account, and only ever what that person's own token can
// see". A cron that swept Google under a system identity would be the thing this
// block still exists to prevent; a cron that sweeps as Marta, using Marta's
// token, seeing Marta's material, is what was asked for.
//
// The two structural tests below did not change at all, and that is the point of
// having written them structurally: the SHARED knowledge sweep still cannot name
// a Google kind. What was added is a separate call in the cron handler beside it
// (lib/google-autopilot.ts), which is why the separation held while the posture
// moved.
describe("a schedule sweeps Google only as the person whose connection it is", () => {
  it("the shared sweep's kind list does not contain a single Google kind", () => {
    const shared = INGEST_KINDS.map((k) => k.kind)
    for (const google of GOOGLE_SOURCE_KINDS)
      expect(shared, `${google} must not be reachable from the cron's own list`).not.toContain(google)
  })

  const runCron = () =>
    (
      worker as unknown as {
        scheduled: (c: { cron: string; scheduledTime: number }, e: unknown) => Promise<void>
      }
    ).scheduled({ cron: "*/15 * * * *", scheduledTime: Date.parse("2026-08-19T09:00:00Z") }, env(IDS.staffUser))

  // FAIL-CLOSED IS STILL THE FLOOR. A team where nobody has connected Google
  // reads nothing at all — the sweep has no person to be, and does not invent
  // one. This is the assertion that would catch a future edit reaching for a
  // system identity because the loop looked empty.
  it("reads nothing at all for a team where nobody has connected Google", async () => {
    db().exec(`UPDATE teams SET db_status = 'ready' WHERE id = '${IDS.team}';`)
    // Deactivated rather than deleted — google_sources references them, and
    // 'switched off' is the real-world shape of this anyway (somebody revoked
    // access) rather than a row vanishing.
    db().exec(`UPDATE google_connections SET deactivated_at = '2026-08-01';`)
    await runCron()
    expect(sources().length, "no connection means no person, and no person means no read").toBe(0)
  })

  // AND THE POSTURE THE OWNER ASKED FOR: with a connection, the schedule brings
  // that person's material in without anybody pressing anything — and it arrives
  // owned by THEM, which is the proof it was read with their token rather than
  // under some team-wide identity.
  it("sweeps as the connected person, and what arrives is theirs", async () => {
    // The staff user is already connected by the fixture — that is the state
    // this whole suite is about.
    db().exec(`UPDATE teams SET db_status = 'ready' WHERE id = '${IDS.team}';`)
    await runCron()
    const brought = sources().filter((s) => GOOGLE_SOURCE_KINDS.includes(s.kind as never))
    expect(brought.length, "a connected person's material comes in on the schedule").toBeGreaterThan(0)
  })

  // NO DUPLICATES, PROVED RATHER THAN ASSUMED — the owner's own condition. The
  // sweep is run TWICE over the same material; the second pass must add nothing,
  // because `knowledge_sources` is keyed on (origin_table, origin_row_id) and a
  // transcript is claimed by an UPDATE carrying its own precondition.
  it("runs twice and adds nothing the second time", async () => {
    // The staff user is already connected by the fixture — that is the state
    // this whole suite is about.
    db().exec(`UPDATE teams SET db_status = 'ready' WHERE id = '${IDS.team}';`)
    await runCron()
    const first = sources().length
    expect(first, "the first pass must actually do something, or this proves nothing").toBeGreaterThan(0)
    await runCron()
    expect(sources().length, "a second pass over the same material writes no second row").toBe(first)
  })

  // THE IDENTITY IS NEVER INVENTED. Read off the file rather than exercised,
  // because the failure this guards against is a future edit that reaches for a
  // `system:` id when the connection loop is inconvenient — and that edit would
  // pass every behavioural test above on a team that happens to have a
  // connection. The user id must come from the connections table.
  it("the autopilot's guard takes its user id from a connection, never a system name", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const src = readFileSync(join(__dirname, "..", "src", "lib", "google-autopilot.ts"), "utf8")
    const at = src.indexOf("for (const userId of people)")
    expect(at, "the per-person loop must exist — it is the whole mechanism").toBeGreaterThan(-1)
    const body = src.slice(at)
    expect(body).toContain("userId }")
    expect(
      /userId:\s*"system:/.test(body),
      "no Google read may be made under a system identity — the token belongs to a person"
    ).toBe(false)
  })

  // THE ASSERTION THE DESIGN ACTUALLY RESTS ON, and it took a sabotage to get it
  // right. The first version read the file's `from "…"` imports — which a
  // `await import("./knowledge-google")` inside sweepAll walks straight past, so
  // wiring the personal kinds into the cron's own sweep left the suite green.
  // Both halves below are needed: the specifier check catches a dependency in
  // ANY import form, and the body check catches the day somebody passes the
  // kinds IN from outside instead.
  it("the sweep's own file cannot even name the Google kinds — the separation is structural", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const src = readFileSync(join(__dirname, "..", "src", "lib", "knowledge-ingest.ts"), "utf8")

    // Any import form — `import … from "./knowledge-google"`, `await
    // import("./knowledge-google")`, `require(…)`. The QUOTED specifier is what
    // they all share, and a prose comment naming `lib/knowledge-google.ts` is
    // not one of them, so the explanation is still allowed to exist.
    expect(
      /["']\.\/knowledge-google["']/.test(src),
      "knowledge-ingest.ts must not depend on the personal kinds in any import form"
    ).toBe(false)

    // …and the cron's own entry point sweeps INGEST_KINDS and nothing else.
    const at = src.indexOf("export async function sweepAll")
    expect(at, "sweepAll must exist — it is the only sweep a schedule can call").toBeGreaterThan(-1)
    const body = src.slice(at, src.indexOf("\n}", at))
    expect(body).toContain("INGEST_KINDS")
    for (const forbidden of ["googleIngestKinds", "knowledge-google", "sweepGoogle"])
      expect(body, `sweepAll must not be able to reach ${forbidden}`).not.toContain(forbidden)
  })
})

describe("the sync screen shows one person their own state", () => {
  it("the state read names the caller's own Google keys and no colleague's", async () => {
    connect(OTHER_STAFF)
    // The SHARED sweep first, so this proves the fence keeps a colleague out
    // WITHOUT also hiding the kinds every member is entitled to see.
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    await call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})
    await call(OTHER_STAFF, "POST /api/content/knowledge/sync-google", {})

    const res = await call(IDS.staffUser, "GET /api/content/knowledge/sync")
    expect(res.status).toBe(200)
    const { ingest } = (await res.json()) as { ingest: { kind: string }[] }
    const kinds = ingest.map((i) => i.kind)
    for (const mine of googleStateKeys(IDS.staffUser)) expect(kinds).toContain(mine)
    for (const theirs of googleStateKeys(OTHER_STAFF))
      expect(kinds, "a colleague's sweep is not this person's business").not.toContain(theirs)
    // …and the shared kinds are still there, so nothing was lost to the fence.
    expect(kinds).toContain("ticket")
  })
})

describe("Google comes into step when you open the app (14.12)", () => {
  /** What the door answers, unwrapped. `skipped` is the whole subject here. */
  const sync = async (userId: string, body: unknown = {}) => {
    const res = await call(userId, "POST /api/content/knowledge/sync-google", body)
    expect(res.status).toBe(200)
    return (await res.json()) as {
      results: { kind: string; read: number; indexed: number }[]
      skipped: boolean
    }
  }

  it("the automatic caller asks once and is then told it already did", async () => {
    const first = await sync(IDS.staffUser, { onlyIfStale: true })
    expect(first.skipped, "nothing has run yet — this one has to really sweep").toBe(false)
    expect(first.results.some((r) => r.read > 0)).toBe(true)

    // The SAME caller, a moment later. The floor is read off
    // `knowledge_ingest.last_run_at`, which the sweep above just stamped.
    const second = await sync(IDS.staffUser, { onlyIfStale: true })
    expect(second.skipped).toBe(true)
    // Nothing was read and nothing was indexed, and it says so rather than
    // reporting the first call's numbers a second time.
    expect(second.results.every((r) => r.read === 0 && r.indexed === 0)).toBe(true)
    // …and it is still a line per connected kind, so a screen reading this does
    // not suddenly show an empty Google.
    expect(second.results.map((r) => r.kind).sort()).toEqual(first.results.map((r) => r.kind).sort())
  })

  it("a deliberate press is never floored — the flag is what asks for it", async () => {
    await sync(IDS.staffUser, { onlyIfStale: true })
    // The Settings button sends nothing. Re-shelving a folder and pressing sync
    // is an act with an expected result; a door that answered "already did that
    // four minutes ago" would have broken every proved path in §14 to add this one.
    const pressed = await sync(IDS.staffUser)
    expect(pressed.skipped).toBe(false)
    expect(pressed.results.some((r) => r.read > 0)).toBe(true)
  })

  it("anything that is not exactly true means the ordinary sweep (R20)", async () => {
    await sync(IDS.staffUser, { onlyIfStale: true })
    for (const lie of ["true", 1, {}, [], null]) {
      const res = await sync(IDS.staffUser, { onlyIfStale: lie })
      expect(res.skipped, `onlyIfStale: ${JSON.stringify(lie)} is not true`).toBe(false)
    }
  })

  it("somebody who has connected nothing sees no sweep and no failure", async () => {
    // OTHER_STAFF holds every right the door asks for and has connected nothing.
    // The answer is an empty list of kinds — not an error, and not a floor
    // either: there was nothing of theirs to be recent about.
    const res = await sync(OTHER_STAFF, { onlyIfStale: true })
    expect(res.results).toEqual([])
    expect(res.skipped).toBe(false)
  })
})

// ── LETTING GO OF DELETED GOOGLE MATERIAL ────────────────────────────────────
//
// THE ASYMMETRY THAT CAUSED IT. Every kind this app owns the rows of retires
// itself: an archived ticket comes back from its own table with a column set,
// and `IngestRow.retired` deactivates the source — "the difference between 'the
// assistant stops quoting it' and 'the assistant quotes it forever because the
// sweep never visits it again'", in that field's own words.
//
// Google's four kinds are not a table this app walks. They are a LISTING, and a
// deleted file is not in it — so the sweep moved forward past a source it would
// never be handed again, and a document the owner deleted stayed answerable
// indefinitely. `knowledge-google.ts` set no `retired` and had no `trashed`, 404
// or gone handling of any kind.
//
// THE HARD PART IS NOT NOTICING. It is REFUSING to act on the wrong evidence: a
// source can be missing from a listing because a window moved, a page filled, a
// query stopped matching, or Google was unwell for ninety seconds. Retiring on
// absence would empty a person's whole index during an outage and record it as
// housekeeping. So absence makes a CANDIDATE and only a positive answer retires
// — which is what the two sets in the fixture above are for, and why the second
// test here matters more than the first.

/** Is this source still quotable? A retired one keeps its row and its history
 * and simply stops being read — never deleted, exactly as everywhere else. */
const live = (originRowId: string) =>
  (
    db()
      .prepare("SELECT deactivated_at AS d FROM knowledge_sources WHERE origin_row_id = ?")
      .get(originRowId) as { d: string | null } | undefined
  )?.d === null

const sweep = () => call(IDS.staffUser, "POST /api/content/knowledge/sync-google", {})

describe("Google material that has GONE stops being quoted", () => {
  const FILE = `${IDS.staffUser}:FILE_1`
  const MAIL = `${IDS.staffUser}:MAIL_1`
  const EVENT = `${IDS.staffUser}:EVENT_1`

  it("a deleted document, a binned mail and a cancelled meeting are all retired", async () => {
    await sweep()
    expect(live(FILE) && live(MAIL) && live(EVENT), "all three should be quotable to begin with").toBe(true)

    // He deletes the file, bins the mail and calls the meeting off. Google stops
    // listing them AND says positively what happened to each.
    for (const id of ["FOLDER_CLIENT", "MAIL_1", "EVENT_1"]) holder.unlisted.add(id)
    for (const id of ["FILE_1", "MAIL_1", "EVENT_1"]) holder.binned.add(id)
    await sweep()

    expect(live(FILE), "a deleted Drive file must stop answering").toBe(false)
    expect(live(MAIL), "a binned mail must stop answering").toBe(false)
    expect(live(EVENT), "a cancelled meeting must stop answering").toBe(false)
    // RETIRED, NOT DELETED — the row and its history survive.
    expect(sources().some((s) => s.origin_row_id === FILE)).toBe(true)
  })

  it("ABSENCE IS NOT DELETION — a source Google merely stopped listing survives", async () => {
    await sweep()
    // The window moved, the page filled, Google had a bad minute: every one of
    // these looks exactly like this. Nothing is added to `binned`, so nothing
    // was ever positively said to have gone.
    for (const id of ["FOLDER_CLIENT", "MAIL_1", "EVENT_1"]) holder.unlisted.add(id)
    await sweep()

    expect(live(FILE), "an outage must not empty somebody's knowledge base").toBe(true)
    expect(live(MAIL)).toBe(true)
    expect(live(EVENT)).toBe(true)
  })

  it("a Chat space he has switched off is retired without asking Google anything", async () => {
    await sweep()
    const SPACE = `${IDS.staffUser}:S_SPACE_${IDS.staffUser}`
    expect(live(SPACE)).toBe(true)

    // A Chat source IS a space somebody named here, so the positive signal is a
    // fact in this app's own database rather than a question for Google.
    db().exec(`UPDATE google_sources SET deactivated_at = '2026-08-18' WHERE id = 'S_SPACE_${IDS.staffUser}';`)
    await sweep()

    expect(live(SPACE), "unshared here means unquotable here").toBe(false)
  })

  it("the chunks go with it, because the chunks are what an answer is built from", async () => {
    await sweep()
    holder.unlisted.add("FOLDER_CLIENT")
    holder.binned.add("FILE_1")
    await sweep()

    const left = db()
      .prepare(
        `SELECT count(*) AS n FROM knowledge_chunks
          WHERE source_id = (SELECT id FROM knowledge_sources WHERE origin_row_id = ?)`
      )
      .get(FILE) as { n: number }
    expect(left.n, "a retired source must leave nothing quotable behind").toBe(0)
  })
})
