// THE KNOWLEDGE BASE, END TO END, against a real SQLite database running the
// real team migrations — the shipped route handlers, the shipped SQL, the
// shipped guard corridor. Only two things are stubbed: the D1 REST transport
// (pointed at the in-memory database) and the embedding model.
//
// WHY THE MODEL IS FAKED, AND WHAT THAT COSTS. `env.AI` here returns a
// deterministic bag-of-words vector, so a chunk about invoices really is closer
// to a question about invoices than to one about logos. What that proves is the
// PIPELINE — embed on write, store quantised, decode on read, blend with the
// lexical score, rank — which is the part that can silently break. What it does
// not prove is Workers AI's semantics; that is measured separately, on the
// agency's own history, by scripts/knowledge-backfill.mjs.
//
// FOUR THINGS THIS SUITE IS ACTUALLY FOR:
//   • a client login cannot reach ONE door of this module (R21), whatever their
//     role says — their role here holds every knowledge right on purpose;
//   • an answer names its sources, and an answer with none says so (R23);
//   • the compartment is DERIVED, and a question about one client does not come
//     back carrying another client's material;
//   • taking a source away really takes it away — and the sweep does not quietly
//     put it back.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { fakeVectorize } from "./fake-vectorize"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"
import { tokenise } from "../src/lib/knowledge-text"
import type { KnowledgeAnswer, KnowledgeSource } from "@shared/types"

const db = () => holder.db as DatabaseSync

/** A SECOND staff member, added here because the shared fixture has only one.
 * The personal fence is a fence between COLLEAGUES — everyone else in that
 * fixture is a client login, and a client login is refused at the door long
 * before the fence is reached, which would have proved nothing about it. */
const OTHER_STAFF = "U_STAFF_2"

/** Every live ping the worker published, captured instead of broadcast. */
let published: { resource?: string; id?: string; op?: string }[] = []
/** Every text the "model" was asked to embed — how the hash-skip is observed. */
let embedded: string[] = []
/** The vector index, in memory. A stand-in that really partitions by namespace
 * and really filters by metadata (see fake-vectorize.ts), so the fence is
 * exercised rather than asserted. */
let vectorIndex = fakeVectorize()

/** A DETERMINISTIC stand-in for the embedding model: 256 dimensions, each token
 * landing in one slot. Two texts sharing words point in similar directions,
 * which is all the ranking needs to be exercised honestly.
 *
 * 256 RATHER THAN 64, and the reason matters now that there is a relevance floor
 * to exercise. In 64 slots an ordinary pair of unrelated sentences collides on
 * two or three dimensions and lands at a cosine of 0.4-0.5 — indistinguishable
 * from a real match, so no floor could separate them and the suite could not
 * tell "refuses what it has nothing on" from "answers everything". Four times
 * the slots makes an accidental collision rare, which is the property a real
 * embedding has and this needs to imitate. */
function fakeVector(text: string): number[] {
  const v = Array.from({ length: 256 }, () => 0)
  for (const [term, weight] of tokenise(text)) {
    let h = 0
    for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) >>> 0
    v[h % 256] += weight
  }
  // A text with no indexable words at all has no direction — the codec refuses
  // to store a zero vector, which is the behaviour under test elsewhere.
  return v
}

function env(
  userId: string,
  opts: { brokenModel?: boolean; noVectorStore?: boolean; minScore?: string } = {}
) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    KNOWLEDGE_INDEX: opts.noVectorStore ? undefined : vectorIndex.binding,
    // THE RELEVANCE FLOOR BELONGS TO THE MODEL, and the model here is a
    // stand-in whose cosine is on a different scale from bge-m3's (see
    // fakeVector below). What this suite tests is that there IS a floor and
    // that it refuses below it — not the shipped number, which was measured
    // against the real model on 7,441 real chunks. Setting it here is the same
    // act as setting it for a new model in production.
    KNOWLEDGE_MIN_SCORE: opts.minScore ?? "0.35",
    AI: {
      run: async (_model: string, input: { text: string[] }) => {
        embedded.push(...input.text)
        if (opts.brokenModel) throw new Error("model unavailable")
        return { data: input.text.map(fakeVector) }
      },
    },
    REALTIME: {
      fetch: async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { event?: Record<string, string> }
        if (body.event) published.push(body.event)
        return new Response("{}")
      },
    },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "", opts = {}) => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}${query}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId, opts) as never
  )
}

/** Add a source through the DOOR (never a raw insert) and hand back its id. */
async function addSource(
  userId: string,
  input: {
    title: string
    body?: string
    accountId?: string
    visibility?: string
    visibleToAppId?: string
  }
): Promise<string> {
  const res = await call(userId, "POST /api/content/knowledge", input)
  expect(res.status, `adding "${input.title}"`).toBe(200)
  const { source } = (await res.json()) as { source: KnowledgeSource }
  return source.id
}

async function ask(
  userId: string,
  question: string,
  accountId?: string,
  opts: { minScore?: string } = {}
): Promise<KnowledgeAnswer> {
  const query = `?q=${encodeURIComponent(question)}${accountId ? `&accountId=${accountId}` : ""}`
  const res = await call(userId, "GET /api/content/knowledge/ask", undefined, query, opts)
  expect(res.status).toBe(200)
  return (await res.json()) as KnowledgeAnswer
}

const titles = (a: KnowledgeAnswer) => a.citations.map((c) => c.title)

beforeEach(() => {
  published = []
  embedded = []
  vectorIndex = fakeVectorize()
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('${OTHER_STAFF}', 'aurora@kwapso.app', 'Aurora', '${IDS.team}');
     INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m5', '${IDS.team}', '${OTHER_STAFF}', '${IDS.adminRole}', '2026-01-01');`
  )
  // BOTH roles hold every knowledge right — the burglar's role is not what stops
  // them, so if a client login gets through, the door's own refusal is broken.
  // Asserted rather than assumed: a suite whose premise quietly stopped being
  // true would answer "refused" for the wrong reason.
  for (const role of [IDS.adminRole, IDS.clientRole])
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('${role}_knowledge', '${role}', 'knowledge', 1, 1, 1, 1);`
    )
  for (const role of [IDS.adminRole, IDS.clientRole]) {
    const granted = db()
      .prepare(
        `SELECT COUNT(*) n FROM role_permissions WHERE role_id = ? AND module = 'knowledge'
          AND can_read = 1 AND can_create = 1 AND can_edit = 1 AND can_delete = 1`
      )
      .get(role) as { n: number }
    expect(granted.n, `${role} must hold every knowledge right for this suite to mean anything`).toBe(1)
  }
})

describe("R21 — a client login cannot reach the knowledge base at all", () => {
  const DOORS: [string, unknown, string][] = [
    ["GET /api/content/knowledge", undefined, ""],
    ["GET /api/content/knowledge/ask", undefined, "?q=invoice"],
    ["GET /api/content/knowledge/sync", undefined, ""],
    ["POST /api/content/knowledge", { title: "Theirs now" }, ""],
    ["POST /api/content/knowledge/update", { id: "x", title: "Theirs now" }, ""],
    ["POST /api/content/knowledge/active", { id: "x", active: false }, ""],
    ["POST /api/content/knowledge/sync", {}, ""],
  ]

  it("every door refuses them — reads and writes alike", async () => {
    for (const [route, body, query] of DOORS) {
      const res = await call(IDS.burglarUser, route, body, query)
      expect(res.status, `${route} must refuse a client login`).toBe(403)
      expect((await res.json()) as { error: string }).toMatchObject({ error: "client_login" })
    }
    // The scan can't see this and the seed can't promise it: the burglar is a
    // real portal user in this fixture, so the refusal above was reached.
    const grants = db()
      .prepare("SELECT COUNT(*) n FROM portal_users WHERE user_id = ? AND deactivated_at IS NULL")
      .get(IDS.burglarUser) as { n: number }
    expect(grants.n, "the burglar must hold a live portal grant, or they were never a client login").toBe(1)
  })

  it("nothing they sent reached the database", async () => {
    await call(IDS.burglarUser, "POST /api/content/knowledge", { title: "Theirs now" })
    const rows = db().prepare("SELECT COUNT(*) n FROM knowledge_sources").get() as { n: number }
    expect(rows.n).toBe(0)
  })
})

describe("a source a person writes is answerable straight away", () => {
  it("indexes on the way in, and the answer names it", async () => {
    const id = await addSource(IDS.staffUser, {
      title: "How we handle a dispatch outage",
      body: "When the dispatch screen logs people out, restart the session service and tell the client within the hour.",
    })
    // Chunked, tokenised and embedded in the same call — the owner asked for
    // instant syncing, and "instant" is what makes a note worth typing.
    const chunks = db().prepare("SELECT COUNT(*) n FROM knowledge_chunks WHERE source_id = ?").get(id) as {
      n: number
    }
    expect(chunks.n).toBeGreaterThan(0)
    const terms = db()
      .prepare(
        "SELECT COUNT(*) n FROM knowledge_terms WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)"
      )
      .get(id) as { n: number }
    expect(terms.n).toBeGreaterThan(0)

    const answer = await ask(IDS.staffUser, "what do we do when the dispatch screen logs people out?")
    expect(answer.found).toBe(true)
    expect(titles(answer)).toContain("How we handle a dispatch outage")
    expect(answer.passages[0].text).toContain("restart the session service")
    // R1: the write published a row-level ping so open lists patch that row.
    expect(published).toContainEqual(expect.objectContaining({ resource: "knowledge", id, op: "add" }))
  })

  it("admits it knows nothing rather than answering anyway", async () => {
    await addSource(IDS.staffUser, { title: "Dispatch outages", body: "Restart the session service." })
    const answer = await ask(IDS.staffUser, "what is our policy on parental leave?")
    expect(answer.found).toBe(false)
    expect(answer.citations).toEqual([])
    expect(answer.passages).toEqual([])
    expect(answer.message).toMatch(/do not answer from memory/i)
  })
})

// A QUESTION FROM OUTSIDE THE TEAM'S WORLD — the honesty case R23 is FOR, and the
// one that got out. Asked "What is the capital of France?" on staging, the
// knowledge base answered, with citations, out of material that had nothing to do
// with it. The path is the fallback: nothing was close enough for the vector arm,
// so the word arm ran as everything-we-have — and its floor was "half the
// question", which for a two-word question is one word. Any chunk saying "capital"
// was, arithmetically, half an answer about France.
//
// The corpus below is built to make that leak happen: one source contains one of
// the two words, the other contains the other, and neither contains both. Under the
// old floor each of them cleared it on its own.
//
// NOTHING IS CLOSE ENOUGH is set here rather than hoped for. The trigger is
// `vector.length === 0`, which retrieve() reaches by four routes it treats
// identically — no store bound, the question could not be embedded, the material
// has no vector, or nothing clears the relevance floor. Staging took the last one,
// so this suite takes it too, by putting the floor out of the stand-in model's
// reach. Leaving it at the suite default would measure that model's accidental
// collisions (a two-word question and a two-word account name share a hashed slot
// often enough) rather than this floor.
const NOTHING_CLOSE_ENOUGH = { minScore: "0.99" }

describe("R23 — a question the team's material cannot answer is refused, not approximated", () => {
  beforeEach(async () => {
    await addSource(IDS.staffUser, {
      title: "Capital expenditure sign-off",
      body: "Any capital expenditure above ten thousand needs the finance lead to sign it off before the purchase order is raised, and the approval is recorded against the project it belongs to.",
    })
    await addSource(IDS.staffUser, {
      title: "Where our suppliers are",
      body: "The label printer is shipped from a supplier in France, so allow an extra week on any hardware order that goes through them during the summer.",
    })
  })

  it("refuses a short question whose words appear in the base but never together", async () => {
    const answer = await ask(IDS.staffUser, "What is the capital of France?", undefined, NOTHING_CLOSE_ENOUGH)
    expect(answer.found, `answered out of ${titles(answer).join(", ") || "nothing"}`).toBe(false)
    expect(answer.citations).toEqual([])
    expect(answer.passages).toEqual([])
    expect(answer.message).toMatch(/do not answer from memory/i)
  })

  // THE REASONING IS PART OF THE ANSWER (R23), so it is held to the same floor.
  // The router had none: a vector search always returns a nearest neighbour, so the
  // sentence riding the answer named the three least-unlike records for every
  // question ever asked — including this one, where it sat next to a refusal
  // telling the reader the question was about three documents it had just said it
  // could not answer from.
  it("and its reasoning claims no subject either", async () => {
    const answer = await ask(IDS.staffUser, "What is the capital of France?", undefined, NOTHING_CLOSE_ENOUGH)
    expect(answer.records).toEqual([])
    expect(answer.reason).not.toMatch(/reads like a question about/i)
  })

  it("still answers when the words really are together — the floor is not a mute button", async () => {
    // The same two-word shape and the SAME sole-evidence path, this time genuinely
    // covered. If the stricter floor ever becomes "refuse anything short", this is
    // what goes red.
    const answer = await ask(IDS.staffUser, "capital expenditure?", undefined, NOTHING_CLOSE_ENOUGH)
    expect(answer.found).toBe(true)
    expect(titles(answer)).toContain("Capital expenditure sign-off")
  })
})

describe("the compartment is derived, and it is the reasoning that ships", () => {
  beforeEach(async () => {
    await addSource(IDS.staffUser, {
      title: "Bergman rollout plan",
      body: "Bergman S.A. moves to the new invoice run in March. Their finance team signs it off.",
      accountId: IDS.victimAccount,
    })
    await addSource(IDS.staffUser, {
      title: "Delaval rollout plan",
      body: "Delaval Group moves to the new invoice run in June. Their operations lead signs it off.",
      accountId: IDS.burglarAccount,
    })
    await addSource(IDS.staffUser, {
      title: "How we run a rollout",
      body: "Every rollout starts with a dry run and a written sign-off from the client.",
    })
  })

  it("a question naming a client searches that client and the agency, and says so", async () => {
    const answer = await ask(IDS.staffUser, "when does Bergman move to the new invoice run?")
    expect(answer.compartments).toEqual([`account:${IDS.victimAccount}`, "agency"])
    // The reasoning is the product: a wrong compartment is invisible otherwise.
    expect(answer.reason).toContain("Bergman S.A.")
    expect(titles(answer)).toContain("Bergman rollout plan")
    // …and the other client's material is NOT in the answer, which is the whole
    // point of compartmenting a single index.
    expect(titles(answer)).not.toContain("Delaval rollout plan")
  })

  it("standing on a record beats guessing from the words", async () => {
    // The same question, with no client named in it at all: the compartment
    // comes from WHERE it was asked from.
    const answer = await ask(IDS.staffUser, "when do they move to the new invoice run?", IDS.burglarAccount)
    expect(answer.compartments).toEqual([`account:${IDS.burglarAccount}`, "agency"])
    expect(answer.reason).toContain("Delaval Group")
    expect(titles(answer)).toContain("Delaval rollout plan")
    expect(titles(answer)).not.toContain("Bergman rollout plan")
  })

  it("a question with no client in it searches everything, and says that too", async () => {
    const answer = await ask(IDS.staffUser, "how do we run a rollout?")
    expect(answer.compartments).toEqual([])
    expect(answer.reason).toContain("named no client")
    expect(titles(answer)).toContain("How we run a rollout")
  })

  // A QUESTION ABOUT THE APP ITSELF. The agency's own documentation — the scope
  // chapters, the vocabulary, the laws, the screen guide that
  // scripts/seed-knowledge-about-the-app.mjs writes — lives in the agency's
  // compartment, and a staging test reported one of those questions being answered
  // out of a client's material instead.
  //
  // The compartment cannot be what did that, and this is the assertion that says
  // so out loud rather than leaving it to be re-derived: EVERY branch of the route
  // keeps the agency's own compartment. Standing on a client's record adds theirs;
  // naming a client in the question adds theirs; naming nobody narrows to nothing
  // at all. There is no route through deriveCompartment that puts the agency's own
  // material out of reach, so if app-self material ever loses, it lost on RANKING
  // and the fix is not here.
  it("never routes a question away from the agency's own material", async () => {
    await addSource(IDS.staffUser, {
      title: "Why the client portal is a separate app",
      body: "The client portal is a different app at a different address. It is not a copy of the agency app and nothing is synced between them — they are two permission-gated views of the same rows.",
    })
    for (const [label, answer] of [
      ["names a client", await ask(IDS.staffUser, "why does Bergman have a separate client portal?")],
      ["stands on a client", await ask(IDS.staffUser, "why a separate client portal?", IDS.burglarAccount)],
      ["names nobody", await ask(IDS.staffUser, "why is the client portal a separate app?")],
    ] as const) {
      const searched = answer.compartments
      expect(
        searched.length === 0 || searched.includes("agency"),
        `${label}: searched ${JSON.stringify(searched)} — the agency's own material must always be in reach`
      ).toBe(true)
    }
    // …and it really is reachable, not merely in scope.
    expect(titles(await ask(IDS.staffUser, "why is the client portal a separate app?"))).toContain(
      "Why the client portal is a separate app"
    )
  })

  it("a word inside a longer name does not file a question under that client", async () => {
    // "Marine" is a word in "Bergman Marine". A question about marine insurance
    // must not be answered out of that account's compartment just because the
    // LIKE matched — every word of the account's own name has to appear.
    const answer = await ask(IDS.staffUser, "what does our marine insurance cover?")
    expect(answer.compartments).toEqual([])
  })
})

describe("the personal fence — material that came through one person's own sight of it", () => {
  it("is answerable for its owner and invisible to everyone else", async () => {
    await addSource(IDS.staffUser, {
      title: "My note on the Bergman renewal",
      body: "Bergman renewal: the finance lead wants a discount before signing.",
      visibility: "private",
    })
    const mine = await ask(IDS.staffUser, "what does the finance lead want on the renewal?")
    expect(titles(mine)).toContain("My note on the Bergman renewal")

    // Another STAFF member, with every knowledge right, asking the same thing.
    const theirs = await ask(OTHER_STAFF, "what does the finance lead want on the renewal?")
    expect(theirs.found).toBe(false)
    // …and it is not in their list either — the fence is on every read, not
    // just the search.
    const list = await call(OTHER_STAFF, "GET /api/content/knowledge")
    const { sources } = (await list.json()) as { sources: KnowledgeSource[] }
    expect(sources.map((s) => s.title)).not.toContain("My note on the Bergman renewal")
  })
})

describe("the app fence — material kept to the people on one app (12.3)", () => {
  /** The shared fixture already has an app (`IDS.victimApp`). Staffing is what
   * decides who may open it (8.11), so it is staffing — not a role — that this
   * suite moves: BOTH staff hold every knowledge right throughout, which is the
   * only way a refusal proves the fence rather than the permission sheet. */
  const staffOnApp = (userId: string) =>
    db().exec(
      "INSERT INTO app_staff (id, app_id, user_id, is_lead, created_at, creator_id) VALUES ('as_" +
        userId +
        "', '" +
        IDS.victimApp +
        "', '" +
        userId +
        "', 0, '2026-03-01', '" +
        userId +
        "');"
    )

  it("answers its app's staff and nobody else, in the search AND in the list", async () => {
    staffOnApp(IDS.staffUser)
    await addSource(IDS.staffUser, {
      title: "Dispatch rollout postmortem",
      body: "The dispatch rollout was paused because the invoice run kept timing out.",
      visibleToAppId: IDS.victimApp,
    })

    const mine = await ask(IDS.staffUser, "why was the dispatch rollout paused?")
    expect(titles(mine)).toContain("Dispatch rollout postmortem")

    // A COLLEAGUE with every knowledge right, who is simply not on this app.
    const theirs = await ask(OTHER_STAFF, "why was the dispatch rollout paused?")
    expect(theirs.found).toBe(false)
    const list = await call(OTHER_STAFF, "GET /api/content/knowledge")
    const { sources, total } = (await list.json()) as { sources: KnowledgeSource[]; total: number }
    expect(sources.map((s) => s.title)).not.toContain("Dispatch rollout postmortem")
    // R16: the badge counts the same question the rows answered. A count that
    // included a row the list withheld would advertise the existence of the very
    // thing the fence exists to hide.
    expect(total).toBe(sources.length)
  })

  it("lets them in the moment they are put on the app, with no re-index", async () => {
    staffOnApp(IDS.staffUser)
    await addSource(IDS.staffUser, {
      title: "Dispatch rollout postmortem",
      body: "The dispatch rollout was paused because the invoice run kept timing out.",
      visibleToAppId: IDS.victimApp,
    })
    expect((await ask(OTHER_STAFF, "why was the dispatch rollout paused?")).found).toBe(false)

    // The fence is a JOIN to `app_staff`, read at question time — so staffing
    // somebody is the whole of granting them sight of it. Nothing is rewritten,
    // nothing is re-embedded, and there is no window in which the two disagree.
    staffOnApp(OTHER_STAFF)
    expect(titles(await ask(OTHER_STAFF, "why was the dispatch rollout paused?"))).toContain(
      "Dispatch rollout postmortem"
    )
  })

  it("refuses an app the author is not on, rather than filing something they'd be locked out of", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/knowledge", {
      title: "A note about somebody else's system",
      body: "…",
      visibleToAppId: IDS.victimApp,
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toMatch(/only limit a source to an app you are on/i)
    expect((db().prepare("SELECT COUNT(*) n FROM knowledge_sources").get() as { n: number }).n).toBe(0)
  })

  it("private beats app — a source that says both is answerable to one person", async () => {
    staffOnApp(IDS.staffUser)
    staffOnApp(OTHER_STAFF)
    await addSource(IDS.staffUser, {
      title: "My own read on the rollout",
      body: "The dispatch rollout was paused because the invoice run kept timing out.",
      visibility: "private",
      visibleToAppId: IDS.victimApp,
    })
    // Both are on the app; only the owner is answered from it. The row stores
    // one answer, so no reader has to work out which of two settings wins.
    expect(titles(await ask(IDS.staffUser, "why was the dispatch rollout paused?"))).toContain(
      "My own read on the rollout"
    )
    expect((await ask(OTHER_STAFF, "why was the dispatch rollout paused?")).found).toBe(false)
    const row = db()
      .prepare("SELECT owner_user_id AS o, visible_to_app_id AS a FROM knowledge_sources")
      .get() as { o: string | null; a: string | null }
    expect({ owner: row.o, app: row.a }).toEqual({ owner: IDS.staffUser, app: null })
  })
})

describe("taking a source away really takes it away", () => {
  it("stops answering from it, keeps the row, and does not resurrect it", async () => {
    const id = await addSource(IDS.staffUser, {
      title: "Old pricing, withdrawn",
      body: "The dispatch module costs 400 a month.",
    })
    expect(titles(await ask(IDS.staffUser, "what does the dispatch module cost?"))).toContain(
      "Old pricing, withdrawn"
    )

    const res = await call(IDS.staffUser, "POST /api/content/knowledge/active", { id, active: false })
    expect(res.status).toBe(200)
    // The searchable pieces are gone in the same instant — "remove something
    // wrong" is a promise the SEARCH has to keep, not just the list.
    const chunks = db().prepare("SELECT COUNT(*) n FROM knowledge_chunks WHERE source_id = ?").get(id) as {
      n: number
    }
    expect(chunks.n).toBe(0)
    expect((await ask(IDS.staffUser, "what does the dispatch module cost?")).found).toBe(false)
    // The ROW survives, with who took it away and when (deactivate, never delete).
    const row = db()
      .prepare("SELECT deactivated_at, deactivator_name FROM knowledge_sources WHERE id = ?")
      .get(id) as { deactivated_at: string | null; deactivator_name: string | null }
    expect(row.deactivated_at).not.toBeNull()
    expect(row.deactivator_name).toBe("Staff")

    // R17: doing it twice moves zero rows — no second history line, no second ping.
    published = []
    const again = await call(IDS.staffUser, "POST /api/content/knowledge/active", { id, active: false })
    expect(again.status).toBe(200)
    expect(published).toEqual([])
    const history = db()
      .prepare("SELECT COUNT(*) n FROM activity WHERE related_row_id = ? AND type = 'Knowledge source removed'")
      .get(id) as { n: number }
    expect(history.n).toBe(1)

    // …and giving it back re-indexes it, so the decision is reversible.
    await call(IDS.staffUser, "POST /api/content/knowledge/active", { id, active: true })
    expect(titles(await ask(IDS.staffUser, "what does the dispatch module cost?"))).toContain(
      "Old pricing, withdrawn"
    )
  })
})

describe("the sweep — the app's own rows become material, and stay in step", () => {
  it("mirrors a ticket, its conversation and the account it belongs to", async () => {
    db().exec(
      `INSERT INTO help_threads (id, help_id, message_body, created_at, creator_name)
       VALUES ('R1', '${IDS.victimTicket}', 'We traced it to the March invoice batch job.', '2026-02-06', 'Staff');`
    )
    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    expect(res.status).toBe(200)
    const { caughtUp } = (await res.json()) as { caughtUp: boolean }
    expect(caughtUp).toBe(true)

    const source = db()
      .prepare("SELECT id, compartment, body FROM knowledge_sources WHERE origin_table = 'help' AND origin_row_id = ?")
      .get(IDS.victimTicket) as { id: string; compartment: string; body: string }
    expect(source).toBeTruthy()
    // Filed under the client the ticket was raised for — the compartment is
    // derived from the row, never typed.
    expect(source.compartment).toBe(`account:${IDS.victimAccount}`)
    // The conversation rides with the ticket: it is most of what makes a ticket
    // worth reading later.
    expect(source.body).toContain("March invoice batch job")

    const answer = await ask(IDS.staffUser, "what caused the March invoice problem at Bergman?")
    expect(answer.found).toBe(true)
    expect(answer.citations.some((c) => c.kind === "ticket")).toBe(true)
  })

  it("skips a row whose text has not changed — the sweep pays for itself", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    expect(embedded.length, "the first pass must really embed, or this proves nothing").toBeGreaterThan(0)

    // FORGET THE CURSOR, so the same rows are read a SECOND time. Without this
    // the next sweep sees nothing at all and passes on the cursor alone — which
    // is what the first version of this test was quietly measuring, and it
    // stayed green with the hash check deleted.
    db().exec("DELETE FROM knowledge_ingest;")
    embedded = []
    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    const { results } = (await res.json()) as { results: { kind: string; read: number; indexed: number }[] }
    const ticket = results.find((r) => r.kind === "ticket")
    expect(ticket?.read, "the rows must really have been read again").toBeGreaterThan(0)
    // Read again, and NOT ONE of them re-chunked or re-embedded. That difference
    // is what makes a 15-minute sweep over thousands of rows affordable.
    expect(results.every((r) => r.indexed === 0)).toBe(true)
    expect(embedded).toEqual([])
  })

  it("does not put back a source somebody deliberately took away", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    const source = db()
      .prepare("SELECT id FROM knowledge_sources WHERE origin_table = 'help' AND origin_row_id = ?")
      .get(IDS.victimTicket) as { id: string }
    await call(IDS.staffUser, "POST /api/content/knowledge/active", { id: source.id, active: false })

    // The ticket changes — so the sweep will see it again and update the row.
    db().exec(`UPDATE help SET description = 'Bergman S.A. cannot see the April invoice run', updated_at = '2026-03-01' WHERE id = '${IDS.victimTicket}';`)
    // Its cursor has already passed this ticket, so re-run from the start the way
    // a fresh environment would: the point is that being SEEN again is not the
    // same as being re-indexed.
    db().exec("DELETE FROM knowledge_ingest;")
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})

    const after = db()
      .prepare("SELECT deactivated_at, chunk_count FROM knowledge_sources WHERE id = ?")
      .get(source.id) as { deactivated_at: string | null; chunk_count: number }
    expect(after.deactivated_at, "the sweep must not clear somebody's decision").not.toBeNull()
    expect(after.chunk_count, "an excluded source must stay unsearchable").toBe(0)
  })

  it("records what happened, so 'it has been failing since Tuesday' is readable", async () => {
    await call(IDS.staffUser, "POST /api/content/knowledge/sync", {})
    const res = await call(IDS.staffUser, "GET /api/content/knowledge/sync")
    const { ingest } = (await res.json()) as {
      ingest: { kind: string; lastOkAt: string | null; lastError: string | null; sourcesIndexed: number }[]
    }
        // `meeting` joined the list the day a transcript needed somewhere to be
    // answerable from. See the kind's own note in lib/knowledge-ingest.ts for
    // why the WORDS of a call belong to the team through this kind rather than
    // to one person through a Google one.
    expect(ingest.map((i) => i.kind).sort()).toEqual([
      "account",
      "app",
      "meeting",
      "sprint",
      "story",
      "ticket",
    ])
    for (const row of ingest) {
      expect(row.lastOkAt).not.toBeNull()
      expect(row.lastError).toBeNull()
    }
    expect(ingest.reduce((n, i) => n + i.sourcesIndexed, 0)).toBeGreaterThan(0)
  })
})

describe("the model having a bad minute costs the material, not the base", () => {
  it("keeps the source, indexes it lexically, and retries on the next sweep", async () => {
    const res = await call(
      IDS.staffUser,
      "POST /api/content/knowledge",
      { title: "Written while the model was down", body: "The dispatch rollout is paused until March." },
      "",
      { brokenModel: true }
    )
    expect(res.status, "an embedding failure must never lose what somebody wrote").toBe(200)
    const { source } = (await res.json()) as { source: KnowledgeSource }

    const row = db()
      .prepare("SELECT content_hash, chunk_count FROM knowledge_sources WHERE id = ?")
      .get(source.id) as { content_hash: string | null; chunk_count: number }
    expect(row.chunk_count).toBeGreaterThan(0)
    // The hash is the "don't do this again" flag, so it is NOT stamped when the
    // vectors never arrived — that is what makes the next sweep pick it up
    // instead of skipping it as unchanged forever.
    expect(row.content_hash).toBeNull()

    // …and it is still findable in the meantime, by its words alone.
    const answer = await ask(IDS.staffUser, "is the dispatch rollout paused?")
    expect(answer.found).toBe(true)
    expect(titles(answer)).toContain("Written while the model was down")
  })
})
