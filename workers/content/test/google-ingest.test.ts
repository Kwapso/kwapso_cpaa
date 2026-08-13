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

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

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
    driveList: async (_t: string, folderIds: string[]) =>
      folderIds.flatMap((folderId) =>
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
    gmailSearch: async () => [
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
    calendarList: async () => [
      {
        id: "EVENT_1",
        summary: "Quarterly review",
        description: "Agreed to move the driver app forward.",
        start: "2026-08-05T09:00:00.000Z",
        end: "2026-08-05T10:00:00.000Z",
        url: "https://calendar.example/EVENT_1",
        attendees: ["luis@bergman.example", "me@kwapso.app"],
      },
    ],
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

describe("a schedule cannot sweep somebody's mailbox", () => {
  it("the shared sweep's kind list does not contain a single Google kind", () => {
    const shared = INGEST_KINDS.map((k) => k.kind)
    for (const google of GOOGLE_SOURCE_KINDS)
      expect(shared, `${google} must not be reachable from the cron's own list`).not.toContain(google)
  })

  // THE SECOND LINE OF DEFENCE, named as such. This one CANNOT fail while the
  // guard is a user id no row can hold — which is exactly why it is not the
  // assertion this design rests on: a silent no-op and a working separation look
  // identical from here. It is worth keeping because it proves the fallback is
  // fail-CLOSED (nothing, rather than somebody's mail under a system account),
  // and worth labelling because a green tick that cannot go red is a green tick
  // somebody will mistake for proof.
  it("fails closed anyway: the cron's guard resolves no connection, so nothing is read", async () => {
    // The scheduled handler, called exactly as wrangler calls it — the real
    // guard it builds, the real teams read, the real sweepAll.
    db().exec(`UPDATE teams SET db_status = 'ready' WHERE id = '${IDS.team}';`)
    await (
      worker as unknown as {
        scheduled: (c: { cron: string }, e: unknown) => Promise<void>
      }
    ).scheduled({ cron: "*/15 * * * *" }, env(IDS.staffUser))
    expect(sources().length, "a cron has no person to be, so it reads nobody's Google").toBe(0)
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
