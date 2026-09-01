// WHAT THE KNOWLEDGE BASE ACTUALLY KNOWS ABOUT A CLIENT.
//
// The complaint this suite exists for, in the owner's own words: "if I'm asking
// about a particular account, the knowledge base should be able to dig through
// everything: from sales to scope to work blocks to tickets to stories to all
// engagement types… any row ID that has the client ID on it must have or should
// have been indexed. I should have gotten a clear answer with the ability to go
// and check out the links to the sources or to those particular records."
//
// He tested two real accounts on staging. Both answers were thin, and the whole
// of what the base knew about one of them was:
//
//     "Bergman S.A. Bergman S.A. is a company we work with. Reference BERG.
//      Status: active_client."
//
// SO THIS SUITE IS ABOUT ANSWER QUALITY, not about which kinds exist. A test
// asserting `INGEST_KINDS` contains "process" would pass with a reader that
// indexed the word "process" and nothing else — which is exactly the failure
// being repaired. Every assertion below is either a REAL ANSWER to a question a
// person would type, or the TEXT a kind really produced, read back out of the
// database the sweep wrote.
//
// Four things it holds:
//   1. COVERAGE — every table that can carry an account id becomes a source,
//      in that account's compartment, through one sweep of the one engine.
//   2. RICHNESS — the account rollup names the client's world; the map names its
//      steps; a thin record says what it IS rather than padding.
//   3. THE LINK BACK — every passage that mirrors a record carries the path to
//      it, and every path names a page this app really has.
//   4. THE FENCES DID NOT MOVE — no internal money reaches the index (R24), and a
//      text-builder change really does force a re-walk instead of being skipped.

import type { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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
import { INGEST_KINDS } from "../src/lib/knowledge-ingest"
import { KNOWLEDGE_KINDS } from "../src/lib/knowledge"
import { SOURCE_CHIPS } from "@shared/knowledge-chips"
import { stripComments } from "@shared/rules/source-scan"
import { PORTAL_VISIBLE_READS } from "@shared/rules/registry"
import type { KnowledgeAnswer } from "@shared/types"

const ROOT = join(__dirname, "..", "..", "..")
const INGEST_FILE = join(__dirname, "..", "src", "lib", "knowledge-ingest.ts")

const db = () => holder.db as DatabaseSync
let vectorIndex = fakeVectorize()

/** The same deterministic stand-in knowledge.test.ts uses: 256 slots, one token
 * per slot, so two texts sharing words really do point the same way. */
function fakeVector(text: string): number[] {
  const v = Array.from({ length: 256 }, () => 0)
  for (const [term, weight] of tokenise(text)) {
    let h = 0
    for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) >>> 0
    v[h % 256] += weight
  }
  return v
}

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    KNOWLEDGE_INDEX: vectorIndex.binding,
    // The floor belongs to the model, and this model is a stand-in whose cosine
    // is on a different scale from bge-m3's — the same setting knowledge.test.ts
    // makes, for the same reason.
    KNOWLEDGE_MIN_SCORE: "0.2",
    AI: {
      run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(fakeVector) }),
    },
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

/** Run the sweep until every kind says it has finished — the same loop
 * scripts/knowledge-backfill.mjs runs against the same door. The ceiling is the
 * script's own idea in miniature: a cursor bug must fail loudly, not spin. */
async function sweepUntilCaughtUp(max = 40): Promise<number> {
  for (let tick = 1; tick <= max; tick++) {
    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync")
    expect(res.status).toBe(200)
    if (((await res.json()) as { caughtUp: boolean }).caughtUp) return tick
  }
  throw new Error(`the sweep never caught up in ${max} ticks`)
}

async function ask(question: string, accountId?: string, sources?: string[]): Promise<KnowledgeAnswer> {
  const query = `?q=${encodeURIComponent(question)}${accountId ? `&accountId=${accountId}` : ""}${
    sources?.length ? `&sources=${encodeURIComponent(sources.join(","))}` : ""
  }&limit=12`
  const res = await call(IDS.staffUser, "GET /api/content/knowledge/ask", undefined, query)
  expect(res.status).toBe(200)
  return (await res.json()) as KnowledgeAnswer
}

/** The material one mirrored row produced, read straight out of the table the
 * sweep wrote — so an assertion about "the text a kind produces" is about the
 * text, not about the reader that was supposed to build it. */
function sourceFor(table: string, rowId: string): { title: string; summary: string; body: string; kind: string } {
  const row = db()
    .prepare("SELECT kind, title, summary, body FROM knowledge_sources WHERE origin_table = ? AND origin_row_id = ?")
    .get(table, rowId) as { kind: string; title: string; summary: string; body: string } | undefined
  expect(row, `nothing was indexed from ${table}/${rowId}`).toBeTruthy()
  return row as { kind: string; title: string; summary: string; body: string }
}

const compartmentOf = (table: string, rowId: string): string =>
  (
    db()
      .prepare("SELECT compartment FROM knowledge_sources WHERE origin_table = ? AND origin_row_id = ?")
      .get(table, rowId) as { compartment: string }
  ).compartment

const BERGMAN = `account:${IDS.victimAccount}`

/** THE CLIENT'S WORLD, seeded on top of the shared fixture — which already gives
 * Bergman an app, a process map with a version, a step and the client's own
 * comment on it, a ticket, and Marta linked as a contact. What is added here is
 * everything else a real client accumulates: the work sold, the work done, the
 * conversation, what we are waiting on them for, and our own job about them. */
function seedBergmansWorld(): void {
  db().exec(`
    UPDATE accounts SET code = 'BERG', status = 'active_client', industry = 'Shipping and logistics',
                        about = 'A family shipping firm in Bilbao, moving to us from spreadsheets.',
                        email = 'hola@bergman.example', city = 'Bilbao', country = 'Spain'
      WHERE id = '${IDS.victimAccount}';
    UPDATE accounts SET about = 'Runs the dispatch desk and signs off the invoices.'
      WHERE id = '${IDS.victimPerson}';
    UPDATE account_links SET relationship = 'Operations manager', is_main_stakeholder = 1
      WHERE id = '${IDS.victimLink}';
    UPDATE apps SET about = 'The screen the dispatch desk lives in all day.',
                    client_context = 'Before us the desk ran on a shared spreadsheet and a WhatsApp group.',
                    solution = 'One dispatch board, with the invoice run hanging off it.',
                    key_actors = 'The dispatch desk, and the bookkeeper once a month.'
      WHERE id = '${IDS.victimApp}';
    UPDATE processes SET role_name = 'bookkeeper' WHERE id = '${IDS.victimProcess}';

    INSERT INTO sprints (id, ref, account_id, app_id, name, sprint_type, goal, starts_on, ends_on,
                         sold_price_cents, completed_at, created_at, creator_id)
      VALUES ('SPR_B', 'BERG-S1', '${IDS.victimAccount}', '${IDS.victimApp}', 'March invoice run',
              'Implementation', 'Get the invoice run off the spreadsheet and into dispatch.',
              '2026-03-02', '2026-03-27', 1200000, '2026-03-27', '2026-03-01', '${IDS.staffUser}');
    INSERT INTO stories (id, ref, account_id, app_id, ticket_id, sprint_id, title, detail, status,
                         story_type, assignee_name, closing_note, created_at, creator_id)
      VALUES ('STO_B', 'BERG-W1', '${IDS.victimAccount}', '${IDS.victimApp}', '${IDS.victimTicket}', 'SPR_B',
              'Show the March invoice run on the dispatch board',
              'The run exists but nothing renders it, so the desk cannot see it.', 'done', 'Feature', 'Ana',
              'Added the invoice run panel and backfilled March.', '2026-03-03', '${IDS.staffUser}');
    INSERT INTO story_processes (id, story_id, process_id, created_at, creator_id)
      VALUES ('STP_B', 'STO_B', '${IDS.victimProcess}', '2026-03-03', '${IDS.staffUser}');
    INSERT INTO work_logs (id, account_id, target_table, target_id, user_id, user_name, note,
                           started_at, ended_at, seconds, created_at, creator_id)
      VALUES ('WL_B', '${IDS.victimAccount}', 'stories', 'STO_B', '${IDS.staffUser}', 'Ana',
              'Traced it to the invoice run never being joined to the board query.',
              '2026-03-04T09:00:00Z', '2026-03-04T10:00:00Z', 3600, '2026-03-04', '${IDS.staffUser}');
    INSERT INTO meetings (id, ref, account_id, app_id, title, agenda, notes, starts_at, status, held_at,
                          created_at, creator_id)
      VALUES ('MTG_B', 'BERG-M1', '${IDS.victimAccount}', '${IDS.victimApp}', 'March review with Bergman',
              'Walk the invoice run, agree the cutover date.',
              'Agreed the cutover is the first Monday of April. Marta will send the supplier list.',
              '2026-03-30T09:00:00Z', 'held', '2026-03-30T10:00:00Z', '2026-03-20', '${IDS.staffUser}');
    INSERT INTO meetings (id, account_id, title, starts_at, status, created_at, creator_id)
      VALUES ('MTG_THIN', '${IDS.victimAccount}', 'Bergman catch-up', '2026-04-06T09:00:00Z', 'scheduled',
              '2026-04-01', '${IDS.staffUser}');
    INSERT INTO todos (id, ref, account_id, ticket_id, title, detail, due_on, created_at, creator_id)
      VALUES ('TD_B', 'BERG-T1', '${IDS.victimAccount}', '${IDS.victimTicket}', 'Send us the supplier list',
              'The list of repeat suppliers, so the check can be skipped for them.', '2026-04-03',
              '2026-03-30', '${IDS.staffUser}');
    INSERT INTO tasks (id, ref, account_id, app_id, title, detail, status, department, assignee_name,
                       due_on, created_at, creator_id)
      VALUES ('TSK_B', 'BERG-K1', '${IDS.victimAccount}', '${IDS.victimApp}', 'Raise the Bergman April invoice',
              'Bill the March sprint and the April retainer together.', 'open', 'Finance', 'Aurora',
              '2026-04-05', '2026-04-01', '${IDS.staffUser}');
    INSERT INTO help_threads (id, help_id, message_body, created_at, creator_id, creator_name)
      VALUES ('HT_B', '${IDS.victimTicket}', 'We can see the run now, thank you.', '2026-03-28',
              '${IDS.victimUser}', 'Marta Ruiz');
  `)
}

beforeEach(() => {
  vectorIndex = fakeVectorize()
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('${IDS.adminRole}_knowledge', '${IDS.adminRole}', 'knowledge', 1, 1, 1, 1);`
  )
  seedBergmansWorld()
})

describe("every row that carries a client id becomes material, in that client's compartment", () => {
  it("one sweep of the one engine covers the whole spine", async () => {
    await sweepUntilCaughtUp()

    // WHAT THE OWNER LISTED, table by table. Each is a row the fixture really
    // holds, so a kind that stopped reading its table fails HERE rather than in a
    // vague assertion about counts.
    const covered: [string, string, string][] = [
      ["accounts", IDS.victimAccount, "account"],
      ["account_links", IDS.victimLink, "contact"],
      ["apps", IDS.victimApp, "app"],
      ["processes", IDS.victimProcess, "process"],
      ["sprints", "SPR_B", "sprint"],
      ["stories", "STO_B", "story"],
      ["help", IDS.victimTicket, "ticket"],
      ["meetings", "MTG_B", "meeting"],
      ["todos", "TD_B", "todo"],
      ["tasks", "TSK_B", "task"],
    ]
    for (const [table, rowId, kind] of covered) {
      expect(sourceFor(table, rowId).kind, `${table} should be indexed as a ${kind}`).toBe(kind)
      // AND FILED WITH THE CLIENT. A source in the agency compartment is
      // invisible from the account tab, which is where the question was asked.
      expect(compartmentOf(table, rowId), `${table} must be filed under the client`).toBe(BERGMAN)
    }
  })

  it("every kind the sweep writes is a kind the list and the filter know", () => {
    // `meeting` shipped a reader before it was a KNOWLEDGE_KIND, so every
    // transcript in the base listed itself as a `note` (toSource coerces an
    // unknown kind) and could not be filtered for. Nothing about that was
    // visible: the material was there, correctly indexed, wearing the wrong word.
    for (const kind of INGEST_KINDS)
      expect(
        (KNOWLEDGE_KINDS as readonly string[]).includes(kind.kind),
        `the sweep writes "${kind.kind}" but KNOWLEDGE_KINDS does not name it — every source of it will list as a note`
      ).toBe(true)
  })

  // WHAT A KIND DECLARES ABOUT ITSELF HAS TO BE TRUE OF ITS OWN READER.
  //
  // Three declarations landed with R47 and every one of them is a fact something
  // ELSE then reasons from — `fromCoreDatabase` is why the backfill's expected
  // count excludes a kind, `oneSourcePer` is why it counts DISTINCT instead of
  // rows, `modules` is what R47's census credits a kind with. A declaration that
  // drifts from its reader does not break anything visibly; it makes another
  // check quietly measure the wrong thing, which is the failure mode this whole
  // file exists for. So each is read back against the reader's own source.
  it("a kind's own declarations still describe its own reader", () => {
    const sweep = stripComments(readFileSync(INGEST_FILE, "utf8"))
    const starts = [...sweep.matchAll(/\n {4}kind: "([a-z_]+)",\n/g)]
    const tableEnd = sweep.indexOf("\n]", starts[starts.length - 1]?.index ?? 0)
    const slice = (name: string) => {
      const at = starts.findIndex((m) => m[1] === name)
      const from = starts[at]?.index as number
      const to = (starts[at + 1]?.index as number) ?? (tableEnd === -1 ? sweep.length : tableEnd)
      return sweep.slice(from, to)
    }
    expect(starts.length, "the kind scan found nothing — it has gone blind").toBe(INGEST_KINDS.length)
    for (const k of INGEST_KINDS) {
      const src = slice(k.kind)
      // BOTH WAYS. A kind claiming the core database must really reach it, and a
      // kind that reaches it must say so — the second half is the one that
      // matters, because an undeclared core reader makes the backfill count a
      // team table that has nothing to do with what it filed.
      expect(
        Boolean(k.fromCoreDatabase),
        `the "${k.kind}" kind ${k.fromCoreDatabase ? "claims fromCoreDatabase but never names env.DB" : "reads env.DB but does not declare fromCoreDatabase"}`
      ).toBe(src.includes("env.DB"))
      // A kind that says one source is per-column must really group by it.
      if (k.oneSourcePer)
        expect(
          src.includes(`GROUP BY ${k.oneSourcePer}`),
          `the "${k.kind}" kind declares one source per "${k.oneSourcePer}" but its reader does not GROUP BY it`
        ).toBe(true)
    }
  })

  // THE CHIPS AND THE KINDS CANNOT DRIFT APART. `shared/knowledge-chips.ts` groups
  // the kinds into the six doors a person ticks, and it holds STRINGS rather than
  // an import of KNOWLEDGE_KINDS, because `shared/` may not depend on a worker.
  // So this is what holds the two together — and it fails BOTH ways, because both
  // are real: a kind in no chip is material the screen can never reach, and a
  // kind in two chips is two switches that disagree about the same passages.
  it("every kind the sweep writes sits in exactly one source chip", () => {
    const seen = new Map<string, string[]>()
    for (const chip of SOURCE_CHIPS)
      for (const kind of chip.kinds) seen.set(kind, [...(seen.get(kind) ?? []), chip.key])
    for (const kind of KNOWLEDGE_KINDS) {
      const chips = seen.get(kind) ?? []
      expect(
        chips.length,
        chips.length === 0
          ? `the kind "${kind}" is in no source chip — nothing a person can tick reaches it`
          : `the kind "${kind}" is in ${chips.length} chips (${chips.join(", ")}) — two switches, same passages`
      ).toBe(1)
    }
    // …and nothing invented: a chip naming a kind the sweep does not write is a
    // switch over an empty set, which reads to a person as "we have none of that".
    for (const [kind, chips] of seen)
      expect(
        (KNOWLEDGE_KINDS as readonly string[]).includes(kind),
        `chip "${chips[0]}" names "${kind}", which is not a kind this base writes`
      ).toBe(true)
  })

  it("every kind has a word a person can read in the filter", () => {
    // The list's Kind facet is built from `KNOWLEDGE_KIND` in
    // web/components/deep-link/shape.tsx, and a kind missing from it falls
    // through to its own bare name — so the filter offered "sprint" and
    // "account_links" beside "From a ticket". Read off disk rather than imported:
    // this is a worker suite, and the map is a front end's.
    const shape = readFileSync(join(ROOT, "web", "components", "deep-link", "shape.tsx"), "utf8")
    const map = /export const KNOWLEDGE_KIND: Record<string, string> = \{([\s\S]*?)\n\}/.exec(shape)
    expect(map, "KNOWLEDGE_KIND did not parse — this scan has gone blind").toBeTruthy()
    const named = new Set(
      [...stripComments((map as RegExpExecArray)[1]).matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
    )
    expect(named.size).toBeGreaterThan(8)
    for (const kind of KNOWLEDGE_KINDS)
      expect(named.has(kind), `the Kind filter would show "${kind}" as its own bare name`).toBe(true)
  })

  it("a contact is filed under the COMPANY, not under themselves", async () => {
    await sweepUntilCaughtUp()
    // Marta's own account row is filed under Marta — an account IS its own
    // compartment. The LINK is what puts her in Bergman's, which is the whole
    // reason the contact kind exists beside the account one.
    expect(compartmentOf("accounts", IDS.victimPerson)).toBe(`account:${IDS.victimPerson}`)
    expect(compartmentOf("account_links", IDS.victimLink)).toBe(BERGMAN)
    expect(sourceFor("account_links", IDS.victimLink).body).toContain("Operations manager at Bergman S.A.")
  })
})

describe("the text a kind produces is knowledge, not a business card", () => {
  beforeEach(async () => {
    await sweepUntilCaughtUp()
  })

  it("an account source is the client's whole world", () => {
    const { body } = sourceFor("accounts", IDS.victimAccount)
    // BEFORE, in full: "Bergman S.A. is a company we work with. Reference BERG.
    // Status: active_client." Three sentences, none of which is why anybody asked.
    for (const fact of [
      "Shipping and logistics", // their industry
      "family shipping firm in Bilbao", // what somebody wrote about them
      "Marta Ruiz — Operations manager (the main contact)", // who we deal with
      "Bergman dispatch", // what we built
      "March invoice run (Implementation), completed", // what we sold
      "Bergman invoice approval (done by their bookkeeper)", // what we mapped
      "cannot see the March invoice run", // what is open
      "Send us the supplier list", // what we are waiting on
      // WHEN WE LAST SPOKE, FROM THE CLOCK. The fixture holds two meetings with
      // this client: a March one somebody ticked held, and an April catch-up
      // nobody ever touched. The right answer is the April one, and the old
      // `status = 'held'` test gave the March one — the exact failure the retired
      // status kept producing, in the sentence the assistant reads out.
      "We last met on 2026-04-06",
    ])
      expect(body, `the account rollup should say "${fact}"`).toContain(fact)
    // The OPEN count is a COUNT(*), not the length of a truncated list.
    expect(body).toMatch(/1 still open/)
  })

  it("a process map carries its steps, its durations and what the client said", () => {
    const { body } = sourceFor("processes", IDS.victimProcess)
    expect(body).toContain("done by their bookkeeper")
    expect(body).toContain("mapped inside Bergman dispatch")
    expect(body).toContain("Check it against the order")
    // 2400 seconds, 20 times a month — the map's own numbers, in minutes.
    expect(body).toContain("about 40 minutes, 20 times a month")
    expect(body).toContain("They said: Bergman asked whether the check can be skipped for repeat suppliers")
  })

  it("an app carries the four paragraphs somebody wrote about it", () => {
    const { body } = sourceFor("apps", IDS.victimApp)
    for (const fact of [
      "The screen the dispatch desk lives in all day",
      "shared spreadsheet and a WhatsApp group",
      "One dispatch board, with the invoice run hanging off it",
      "The dispatch desk, and the bookkeeper once a month",
      "Bergman invoice approval",
    ])
      expect(body, `the app source should say "${fact}"`).toContain(fact)
  })

  it("a ticket carries the client, the work done about it and the conversation", () => {
    const { body } = sourceFor("help", IDS.victimTicket)
    expect(body).toContain("raised by Bergman S.A.")
    expect(body).toContain("Show the March invoice run on the dispatch board (done)")
    expect(body).toContain("We can see the run now, thank you.")
  })

  it("a story carries what it answers, what was done and the notes on the time", () => {
    const { body } = sourceFor("stories", "STO_B")
    expect(body).toContain("It sits in March invoice run.")
    expect(body).toContain("The ways of working it changes: Bergman invoice approval.")
    expect(body).toContain("Added the invoice run panel and backfilled March.")
    // The words on a work log ride the record they were logged against — they are
    // deliberately not sources of their own (see workNotes in knowledge-ingest).
    expect(body).toContain("Traced it to the invoice run never being joined to the board query.")
  })

  it("a sprint carries the work inside it, and never its price", () => {
    const { body } = sourceFor("sprints", "SPR_B")
    expect(body).toContain("Get the invoice run off the spreadsheet")
    expect(body).toContain("Show the March invoice run on the dispatch board (done)")
    // What a client is CHARGED is shown to them only when their price-visibility
    // switch is on, and a passage carries no switch.
    expect(body).not.toContain("1200000")
    expect(body).not.toMatch(/12,?000/)
  })

  it("a thin record says what it IS rather than padding", () => {
    // A meeting with no agenda and no notes used to index as a title and a date.
    // It still cannot say more than it holds — but it says what it is, whose it
    // is and when, which is a usable answer to "didn't we have something booked?".
    const thin = sourceFor("meetings", "MTG_THIN")
    expect(thin.body).toContain("Bergman catch-up is a meeting with Bergman S.A.")
    expect(thin.body).toContain("2026-04-06")
    // And a meeting that DOES hold something has all of it.
    const full = sourceFor("meetings", "MTG_B")
    expect(full.body).toContain("Walk the invoice run, agree the cutover date.")
    expect(full.body).toContain("first Monday of April")
  })
})

describe("the two questions he actually asked", () => {
  beforeEach(async () => {
    await sweepUntilCaughtUp()
  })

  it("'what do we do for Bergman S.A.?' comes back with the client's world and its sources", async () => {
    const answer = await ask("What do we do for Bergman S.A.?")
    expect(answer.found, `answered out of ${answer.citations.map((c) => c.title).join(", ") || "nothing"}`).toBe(
      true
    )
    // ROUTED BY A FACT, not a guess: the question names the client.
    expect(answer.compartments).toEqual([BERGMAN, "agency"])
    // The answer is built out of the material, and the material now says what we
    // do — the systems, the maps, the work.
    const said = answer.passages.map((p) => p.text).join("\n")
    expect(said).toContain("Bergman dispatch")
    expect(said).toMatch(/invoice/i)
    // MORE THAN ONE KIND OF RECORD. The old base could only ever cite the account
    // card, because it was the only thing about a client that carried its name.
    expect(new Set(answer.citations.map((c) => c.kind)).size).toBeGreaterThan(1)
  })

  // ── THE SOURCE CHIPS NARROW THE DOOR, NOT THE SCREEN ──────────────────────
  //
  // A chip that ticks and unticks is trivial; a chip whose scope reaches the
  // RETRIEVAL DOOR is the feature. So this asks the same question twice and
  // compares the ANSWERS, rather than asserting that a parameter was accepted.
  //
  // It narrows in both places R26 names — the vector index is told which kinds to
  // look at, and the passage read, where the database decides, carries the same
  // clause. A test that only proved one of them would pass with the other
  // deleted, and the deleted one is the fence.
  it("naming a chip narrows what comes back, and naming none is unchanged", async () => {
    const all = await ask("What do we do for Bergman S.A.?")
    expect(all.found).toBe(true)
    const kindsAll = new Set(all.citations.map((c) => c.kind))
    expect(kindsAll.size, "the unnarrowed answer draws on more than one kind").toBeGreaterThan(1)

    // ONE DOOR: the app's own records. Everything that comes back must be a kind
    // that chip covers — the narrowing is real, not decorative.
    const recordKinds = new Set(
      SOURCE_CHIPS.find((c) => c.key === "records")?.kinds ?? []
    )
    const narrowed = await ask("What do we do for Bergman S.A.?", undefined, ["records"])
    for (const c of narrowed.citations)
      expect(
        recordKinds.has(c.kind),
        `"${c.title}" is a ${c.kind}, which the "records" chip does not cover`
      ).toBe(true)

    // AND A DOOR WITH NOTHING BEHIND IT ANSWERS NOTHING, rather than quietly
    // widening back to everything. This is the assertion that fails if the
    // narrowing is dropped anywhere on the path.
    const mailOnly = await ask("What do we do for Bergman S.A.?", undefined, ["mail"])
    expect(
      mailOnly.citations.every((c) => c.kind === "email"),
      `narrowing to mail returned ${mailOnly.citations.map((c) => c.kind).join(", ")}`
    ).toBe(true)
  })

  it("an invented chip key is ignored, and reads as no narrowing at all", async () => {
    // R20 at the boundary: the door checks each value against the declared set
    // where it sits, so a key nobody declared contributes nothing — and "nothing
    // named" is every door, never none. The alternative reading would let a typo
    // silently turn the knowledge base off.
    const answer = await ask("What do we do for Bergman S.A.?", undefined, ["not-a-chip"])
    expect(answer.found, "a typo must not switch the knowledge base off").toBe(true)
  })

  it("'how does Bergman approve a supplier invoice?' finds the map, not the business card", async () => {
    const answer = await ask("How does Bergman approve a supplier invoice?")
    expect(answer.found).toBe(true)
    const said = answer.passages.map((p) => p.text).join("\n")
    expect(said).toContain("Check it against the order")
    expect(answer.citations.some((c) => c.kind === "process")).toBe(true)
  })

  it("standing on the client's record answers the same way, without naming them", async () => {
    // The account tab passes the id, so "what are we waiting on them for?" needs
    // no client in the words at all.
    const answer = await ask("What are we waiting on them for?", IDS.victimAccount)
    expect(answer.compartments).toEqual([BERGMAN, "agency"])
    expect(answer.found).toBe(true)
    expect(answer.passages.map((p) => p.text).join("\n")).toContain("supplier list")
  })
})

describe("a passage links to the record it came out of", () => {
  beforeEach(async () => {
    await sweepUntilCaughtUp()
  })

  it("every mirrored passage carries the path to its record, and its citation agrees", async () => {
    const answer = await ask("How does Bergman approve a supplier invoice?")
    const linked = answer.passages.filter((p) => p.recordPath)
    expect(linked.length, "no passage carried a link to its record").toBeGreaterThan(0)
    for (const p of linked) {
      // A path under the team, not a URL: the worker knows the segment, the front
      // end knows the team.
      expect(p.recordPath).toMatch(/^[a-z-]+\/[A-Za-z0-9_-]+$/)
      const citation = answer.citations.find((c) => c.sourceId === p.sourceId)
      expect(citation?.recordPath, "a citation must point where its passage points").toBe(p.recordPath)
    }
    // The map's own passage opens the map.
    const map = answer.citations.find((c) => c.kind === "process")
    expect(map?.recordPath).toBe(`processes/${IDS.victimProcess}`)
  })

  it("every segment a link can name is a page this app really has", () => {
    // Derived from both sides: the paths the seam can build, and the sections
    // web/lib/pages.ts declares. A page renamed without this map turns the build
    // red instead of leaving dead links in every answer.
    const lib = stripComments(readFileSync(join(__dirname, "..", "src", "lib", "knowledge.ts"), "utf8"))
    const map = /const RECORD_PATH: Record<string, string> = \{([^}]*)\}/.exec(lib)
    expect(map, "RECORD_PATH did not parse — this scan has gone blind").toBeTruthy()
    const segments = [...(map as RegExpExecArray)[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1])
    expect(segments.length).toBeGreaterThan(5)

    // COMMENTS OFF, and this side is the one that matters: `known` is an
    // ALLOW-LIST. `lib` above was already stripped and this read was not, so a
    // single comment line in pages.ts carrying `segment: "…"` authorised a
    // RECORD_PATH pointing anywhere. Proved 27 Aug 2026: pointing tasks at
    // "fakepage" is caught, and is NOT caught once pages.ts says
    // `// A page we plan to add: segment: "fakepage" — not built yet.`
    // The failure that buys is a knowledge-base answer whose citation 404s.
    const pages = stripComments(readFileSync(join(ROOT, "web", "lib", "pages.ts"), "utf8"))
    const known = new Set([...pages.matchAll(/segment:\s*"([^"]*)"/g)].map((m) => m[1]))
    expect(known.size, "web/lib/pages.ts did not parse").toBeGreaterThan(5)
    for (const segment of segments)
      expect(known.has(segment), `RECORD_PATH points at "/${segment}", which is not a page in web/lib/pages.ts`).toBe(
        true
      )
  })
})

describe("the fences did not move", () => {
  it("R24 — no internal money table is anywhere in the sweep", () => {
    // R24 IS ABOUT THE PORTAL, AND THIS IS THE SAME RULE ONE STEP EARLIER. The
    // index is ACCOUNT-WIDE: a margin embedded into it is a margin sitting in
    // material that a client-facing knowledge surface would search the moment one
    // is built. So the same set of tables the law forbids the portal to name is
    // forbidden to the sweep, derived the same way and from the same file —
    // otherwise a fourth internal table would have to be remembered in two places.
    const internal = stripComments(
      readFileSync(join(ROOT, "workers", "tenancy", "src", "lib", "internal-money.ts"), "utf8")
    )
    const reads = [...new Set([...internal.matchAll(/(?:FROM|INTO|UPDATE)\s+([a-z_]+)/g)].map((m) => m[1]))]
    // The subtraction R24 makes, for R24's own reason: the margin reads `apps` for
    // what a system costs us to run, and `apps` is not an internal table — a
    // client's own value screen names their apps by design. What survives is
    // exactly "a table only the agency's own side ever touches".
    const clientReadable = new Set<string>()
    for (const file of Object.keys(PORTAL_VISIBLE_READS))
      for (const m of stripComments(readFileSync(join(ROOT, file), "utf8")).matchAll(
        /(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/g
      ))
        clientReadable.add(m[1])
    const internalTables = reads.filter((t) => !clientReadable.has(t))
    expect(
      internalTables,
      "the internal-table derivation subtracted everything — internal_rates must survive it"
    ).toContain("internal_rates")

    const sweep = stripComments(readFileSync(INGEST_FILE, "utf8"))
    for (const table of internalTables)
      expect(
        new RegExp(`\\b${table}\\b`).test(sweep),
        `the sweep names "${table}" — what our own hour costs cannot be embedded into an account-wide index (R24)`
      ).toBe(false)

    // ONE STEP SHORT OF R24'S LINE, and left out for a reason of its own: what a
    // client IS CHARGED (the account rate card, and a sprint's sold price) is
    // shown to them only when their per-account price-visibility switch is on. A
    // passage carries no switch, so those two figures stay on the screens that can
    // gate them.
    for (const gated of ["account_rates", "sold_price_cents"])
      expect(
        new RegExp(`\\b${gated}\\b`).test(sweep),
        `the sweep names "${gated}" — a figure whose visibility is a per-account switch cannot ride a passage`
      ).toBe(false)
  })

  it("R26 — every vector the sweep writes is namespaced to the team", async () => {
    await sweepUntilCaughtUp()
    expect(vectorIndex.all().length).toBeGreaterThan(10)
    for (const v of vectorIndex.all())
      expect(v.namespace, "a vector was written with no team partition").toBe(IDS.team)
  })
})

describe("changing what a kind SAYS really does re-index what is already there", () => {
  it("a cursor written by an older text builder is not a position", async () => {
    await sweepUntilCaughtUp()
    const before = db().prepare("SELECT COUNT(*) n FROM knowledge_sources").get() as { n: number }
    expect(before.n).toBeGreaterThan(5)

    // THE FAULT THIS MECHANISM EXISTS FOR. The hash answers "has this ROW
    // changed?" — it never answers "has the way we WRITE a row changed?", and the
    // cursor is what makes the second question fatal: every row already behind it
    // is invisible forever unless somebody touches it. So an improved text
    // builder would reach every future ticket and not one existing one.
    //
    // Simulated the way it really happens: the rows are indexed, every kind has
    // caught up, and the stored cursors are stamped with the builder that wrote
    // them. Re-stamp them as an older version and the sweep must walk the tables
    // again rather than sit still.
    const stamped = db().prepare("SELECT kind, cursor FROM knowledge_ingest").all() as {
      kind: string
      cursor: string | null
    }[]
    const positions = stamped.filter((r) => r.cursor)
    expect(positions.length, "no kind kept a position — this test would prove nothing").toBeGreaterThan(0)
    for (const row of positions)
      expect(row.cursor, "a stored cursor must carry the text version that wrote it").toMatch(/^v\d+\|/)

    db().exec("UPDATE knowledge_ingest SET cursor = REPLACE(cursor, 'v1|', 'v0|') WHERE cursor IS NOT NULL")
    db().exec("UPDATE knowledge_sources SET content_hash = 'stale'")

    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync")
    const { results } = (await res.json()) as { results: { kind: string; read: number; indexed: number }[] }
    const rewound = results.filter((r) => r.indexed > 0)
    expect(
      rewound.length,
      "a text-version bump must send the sweep back over rows it has already passed"
    ).toBeGreaterThan(0)
    // And it re-INDEXED them rather than creating a second source per row: the
    // upsert is still keyed on (origin_table, origin_row_id).
    const after = db().prepare("SELECT COUNT(*) n FROM knowledge_sources").get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  it("…and a bump on rows whose TEXT did not change re-READS them without re-embedding", async () => {
    // THE OTHER HALF OF WHAT A BUMP COSTS, and it reverses a real decision.
    //
    // On 31 Aug 2026 a lane declined to bump a kind's `textVersion` — the one
    // thing that would have made a behaviour change reach rows already filed —
    // because "a bump re-reads and re-embeds every row of that kind: real AI
    // spend, to change nothing". The first half is true. The second is not, for
    // any row whose text is unchanged: the bump rewinds the cursor, the sweep
    // meets the row again, recomputes the same hash, and the hash-skip returns
    // before `indexSource` is ever called. The cost is one upsert.
    //
    // MEASURED ON STAGING BEFORE IT WAS WRITTEN HERE, which is how the error was
    // found: three chat sources re-read at 08:04 kept `indexed_at` values of
    // 06:15 and 07:03 — read, skipped, never embedded — while four rows that had
    // genuinely gained replies re-indexed in the same tick. That contrast is the
    // control; without it "nothing re-indexed" could just mean nothing ran.
    //
    // The test above stales every hash on purpose, so it can only ever prove the
    // re-INDEX. This one changes nothing and proves the skip.
    await sweepUntilCaughtUp()
    const positions = db()
      .prepare("SELECT kind, cursor FROM knowledge_ingest WHERE cursor IS NOT NULL")
      .all() as { kind: string; cursor: string | null }[]
    expect(positions.length, "no kind kept a position — this test would prove nothing").toBeGreaterThan(0)

    // The cursors go back a version. The HASHES ARE LEFT ALONE — that is the
    // whole difference from the test above.
    db().exec("UPDATE knowledge_ingest SET cursor = REPLACE(cursor, 'v1|', 'v0|') WHERE cursor IS NOT NULL")

    const res = await call(IDS.staffUser, "POST /api/content/knowledge/sync")
    const { results } = (await res.json()) as {
      results: { kind: string; read: number; indexed: number }[]
    }
    const readAgain = results.reduce((n, r) => n + r.read, 0)
    const reIndexed = results.reduce((n, r) => n + r.indexed, 0)

    expect(readAgain, "the bump really did send the sweep back over filed rows").toBeGreaterThan(0)
    expect(
      reIndexed,
      "…and not one of them was re-embedded, because none of their text changed"
    ).toBe(0)
  })

  it("a rollup catches a change in a row its own cursor cannot see", async () => {
    await sweepUntilCaughtUp()
    expect(sourceFor("accounts", IDS.victimAccount).body).not.toContain("The board is blank on Mondays")

    // A NEW TICKET FOR BERGMAN, and nothing else. `accounts.updated_at` does not
    // move — nothing in this statement touches the accounts table at all — so a
    // cursor keyed on it would file this account once and never look again while
    // its whole world changed underneath. That is the fault `rollup: true` is
    // for, and it is invisible without a test: the account source would simply
    // go on describing last month.
    const untouched = db()
      .prepare("SELECT updated_at, created_at FROM accounts WHERE id = ?")
      .get(IDS.victimAccount) as { updated_at: string | null; created_at: string }
    db().exec(
      `INSERT INTO help (id, description, status, resolved, account_id, created_at, creator_id, creator_name)
       VALUES ('H_NEW', 'The board is blank on Mondays', 'new', 0, '${IDS.victimAccount}', '2026-04-08',
               '${IDS.victimUser}', 'Marta Ruiz');`
    )
    const still = db()
      .prepare("SELECT updated_at, created_at FROM accounts WHERE id = ?")
      .get(IDS.victimAccount) as { updated_at: string | null; created_at: string }
    expect(still, "the account row must be untouched, or this proves nothing").toEqual(untouched)

    await sweepUntilCaughtUp()
    const { body } = sourceFor("accounts", IDS.victimAccount)
    expect(body, "the rollup did not pick up a ticket raised after it was last written").toContain(
      "The board is blank on Mondays"
    )
    // And the count beside it moved with it — a rollup that listed the new ticket
    // while still saying "1 still open" would be worse than one that missed both.
    expect(body).toMatch(/2 still open/)
  })

  it("every kind declares a text version, and it matches the reader that is shipped", () => {
    // ROT-CHECKED, because the mechanism is only as good as somebody remembering
    // to use it. Each kind's own source is hashed and pinned here: edit a reader
    // without bumping its `textVersion` and this fails, naming the kind and both
    // numbers. That is the difference between a rule and a habit.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is the whole correctness of the
    // measurement rather than a tidiness. What this law protects is what a
    // reader SAYS — the words that go into the index and that a re-index would
    // rewrite. A comment says nothing to the index. Hashing it anyway means an
    // edit that changes no shipped text still demands a `textVersion` bump, and
    // a bump sends the sweep back over every row of that kind in the base.
    //
    // WHAT THAT COSTS, precisely, because the imprecise version of this sentence
    // caused a wrong decision on 31 Aug 2026. It used to read "a bump re-reads
    // and RE-EMBEDS every row … real AI spend, to change nothing", and a lane
    // read it, believed it, and declined to bump a kind whose behaviour change
    // therefore never reached a single row already filed.
    //
    // A bump re-READS every row. It re-EMBEDS only the rows whose text actually
    // changed — which, when you have bumped because the reader now SAYS
    // something different, is all of them, and that is the case this sentence
    // was written for. When the reader says the same words as before, every hash
    // matches and the skip below returns before `indexSource` is called: one
    // upsert per row, no AI spend. Measured on staging that day — three chat
    // sources re-read at 08:04 kept `indexed_at` of 06:15 and 07:03, while four
    // rows that had genuinely gained replies re-indexed in the same tick — and
    // the test two describes above now holds both halves down.
    //
    // So the instruction is unchanged and its price is not: bump when the words
    // change, and do not talk yourself out of a bump you need on a cost that is
    // only real when the words changed.
    //
    // THIRD TIME. It fired on 20 Aug 2026 for a slice that ran past the table's
    // end (see the `task` note in READER_DIGESTS, re-pinned at the SAME version
    // for exactly this reason), and again on 24 Aug 2026 when a one-word comment
    // fix inside the meeting reader — "the calendar event" for a retired synonym
    // — asked for every meeting in the base to be re-indexed. A check that asks
    // for the wrong repair is worse than one that stays quiet, because the wrong
    // repair gets done. The sibling scan above already reads this file through
    // `stripComments`; now both do, and the digests below are re-pinned at their
    // CURRENT versions because the measurement moved and no reader did.
    const sweep = stripComments(readFileSync(INGEST_FILE, "utf8"))
    const declared = new Map(INGEST_KINDS.map((k) => [k.kind, k.textVersion]))
    expect(declared.size).toBeGreaterThan(9)

    const starts = [...sweep.matchAll(/\n {4}kind: "([a-z_]+)",\n/g)]
    expect(starts.length, "the kind scan found nothing — it has gone blind").toBe(declared.size)

    const PINNED: Record<string, { version: number; digest: string }> = READER_DIGESTS
    // WHERE THE TABLE ENDS, so the LAST kind's digest is its own reader and not
    // every helper that happens to be declared below it.
    //
    // `to` used to fall back to the end of the FILE, which meant editing
    // anything after the kinds array — a shared helper, a comment, `sweepKinds`
    // — read as a change to whichever kind was declared last. It fired on 20 Aug
    // 2026 naming "task" for an edit to the sweep loop forty lines below it, and
    // the instruction it printed was to bump task's textVersion: a full,
    // pointless re-index of every task in the base to silence a false alarm.
    // A check that asks for the wrong repair is worse than one that stays quiet.
    const tableEnd = sweep.indexOf("\n]", starts[starts.length - 1]?.index ?? 0)
    const lastEnd = tableEnd === -1 ? sweep.length : tableEnd
    const slices: [number, number][] = []
    for (const [i, match] of starts.entries()) {
      const from = match.index as number
      const to = (starts[i + 1]?.index as number) ?? lastEnd
      slices.push([from, to])
      const name = match[1]
      const pin = PINNED[name]
      expect(pin, `kind "${name}" has no pinned reader digest — add one to READER_DIGESTS`).toBeTruthy()
      expect(declared.get(name), `kind "${name}" declares the wrong textVersion`).toBe(pin.version)
      expect(
        digest(sweep.slice(from, to)),
        `the reader for "${name}" changed. If its TEXT changed, bump textVersion to ${
          pin.version + 1
        } and update READER_DIGESTS — otherwise every row already indexed keeps the old wording forever.`
      ).toBe(pin.digest)
    }

    // AND THE HALF A PER-KIND PIN CANNOT SEE. Every reader leans on shared code —
    // `firstLine` names a ticket, `childLines` builds every rollup, `workNotes`
    // decides what a work log contributes, `buildSummary` writes the sentence the
    // router reads. A change in any of those changes what EVERY kind says while
    // leaving all ten per-kind digests untouched. So everything outside the kinds
    // is pinned once, and the failure asks the same question: which kinds now say
    // something different, and do their rows need writing again?
    let outside = ""
    let at = 0
    for (const [from, to] of slices) {
      outside += sweep.slice(at, from)
      at = to
    }
    outside += sweep.slice(at)
    expect(
      digest(outside),
      "the sweep's shared text helpers changed. If any kind now SAYS something different, bump that kind's textVersion; then update SHARED_DIGEST."
    ).toBe(SHARED_DIGEST)
  })
})

/** The same two-pass FNV-1a the sweep hashes material with, so the pin above is
 * stable across platforms and short enough to read in a diff. */
function digest(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ (c + i), 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")
}

/** WHICH READER EACH DECLARED VERSION BELONGS TO. Regenerate with the failure
 * message above, deliberately — the point is that a text change cannot be made
 * without somebody deciding whether the rows already indexed need re-writing. */
const READER_DIGESTS: Record<string, { version: number; digest: string }> = {
  ticket: { version: 1, digest: "6e4ce9bc6f3df27b" },
  // v2: "when we last spoke" is keyed on the CLOCK rather than on a retired
  // `held` status, so a client we saw in April no longer reads as last seen in
  // March. Every account already indexed says the old date until it is re-written.
  account: { version: 2, digest: "74d4aabd9f470931" },
  contact: { version: 1, digest: "797da075c7f5ddaa" },
  app: { version: 1, digest: "6b67fb58910c7241" },
  process: { version: 1, digest: "ddbb403661a7013c" },
  sprint: { version: 1, digest: "3421ad8399adb0a1" },
  story: { version: 1, digest: "0809d2076e8ddfab" },
  // v2: the summary says "already happened" / "still to come" from the start
  // time, where it used to quote the retired status column.
  // v3: a meeting that has not happened and carries no agenda, notes or
  // transcript is RETIRED rather than filed — 232 of 458 meeting sources on
  // staging were exactly that, and six of them were the whole answer to "what
  // came out of the Team Assembly?" while the 92-chunk transcript was not. The
  // bump is not cosmetic: those rows sit behind this lane's cursor and only a
  // rewind re-decides them.
  // v5: the mojibake mend reached `meetings.transcript_text` and the PASSAGES
  // built from it were left behind — 39 meetings, 1,281 chunks, all sitting
  // behind this lane's cursor with `content_hash` nulled and nothing that would
  // ever read them again. Same reason as v3, and the same lesson: on a
  // forward-only lane, nulling the hash on a row the cursor has passed does
  // NOTHING. Only a bump walks it back.
  meeting: { version: 5, digest: "73fb4b8e98d1f6c4" },
  todo: { version: 1, digest: "e00d2b0c6bb86edb" },
  // RE-PINNED 20 Aug 2026 AT THE SAME VERSION, and the version staying at 1 is
  // the point. `task` is declared last, so its slice used to run to the end of
  // the file and its digest covered every helper below the table. Bounding the
  // slice at the table's own closing bracket changed the MEASUREMENT, not the
  // reader — the task builder is byte for byte what it was — so nothing needs
  // re-indexing and the version must not move.
  // RE-PINNED AGAIN 1 Sep 2026, AT THE SAME VERSION, for the SECOND time and the
  // same reason as the first. `task` was the last kind in the table, so its slice
  // ran to the table's closing bracket; three kinds now follow it, so the slice
  // ends where `person` begins. The measurement moved and the reader did not —
  // the task builder is byte for byte what it was — so nothing needs re-indexing
  // and the version must not move. That this keeps happening to whichever kind is
  // declared last is worth knowing before reaching for a bump.
  task: { version: 1, digest: "b837d2e036f69056" },
  // R47's three (1 Sep 2026). Every one starts at v1 because no row of them has
  // ever been indexed — there is nothing behind a cursor to leave saying the old
  // words.
  // v2: a client login is not a colleague — R21 makes one an ordinary team
  // member holding an ordinary role, so `team_members` alone cannot tell them
  // apart and three client contacts on staging were filed as colleagues within
  // minutes of v1 landing. The live portal grant is the fact that separates
  // them, and the bump is what walks the cursor back over the rows already
  // written.
  person: { version: 2, digest: "2688cce1dde6136e" },
  dropdown: { version: 1, digest: "ce030ed2555c6595" },
  portal_login: { version: 1, digest: "d759a60ff2f459f0" },
}

/** Everything in the sweep that is NOT inside a kind: the shared helpers each
 * reader leans on. Pinned once, for the reason the check above states. */
// UPDATED 20 Aug 2026 for the sweep ORDER, which changes no kind's text.
// `sweepKinds` now walks the lanes oldest-swept first instead of in declaration
// order, because the Drive lane grew long enough to starve the ones behind it
// (document had run 194 times to message's 180, and the gap widened every tick).
// Which lane goes first is not something any kind SAYS, so no textVersion moves.
// 26 Aug 2026: the sweep gained its activity line (a feed entry when it filed
// passages) — an APPEND after the loop, no reader touched, so again no
// textVersion moves. Later the same day: the machine-actor attribution
// literals ('kwapso' as creator/deactivator) moved onto the brand seam —
// column VALUES, not words any kind says.
// 27 Aug 2026: the loop learned to UNDO a retirement it made itself — a source
// the app retired is revived and rebuilt when its row comes back, while one a
// person excluded stays excluded (`deactivator_id` is the seam). That decides
// WHETHER a source is indexed, never a word of what any kind says, so again no
// textVersion moves — and a bump here would be actively wrong: it would re-index
// every row of every kind to fix nothing.
// 1 Sep 2026: `IngestKind.read` gained a fifth argument (the global core
// database, for the `person` kind — membership is global and `staff_profiles`
// carries no name), `IngestKind` gained `modules` (R47), `oneSourcePer` (what
// one source of a kind IS, where it is not one row) and `fromCoreDatabase` (its
// rows are not in the team's database at all), and `nameSpellings` landed beside
// the other helpers. None of the three changes a WORD any existing
// kind says: the ten readers that were here before pass the new argument nowhere
// and call the new helper never, and every one of their per-kind digests above
// is unchanged except `task`, whose slice merely moved (see its note). So no
// textVersion moves, and a bump here would re-index the whole base to fix
// nothing.
const SHARED_DIGEST = "60d395561678771d"

// ── A MEETING THAT HAS NOT HAPPENED AND SAYS NOTHING ────────────────────────
//
// The same rule the calendar lane applies to Google's own entries, on the table
// THIS app owns — and it had to be both, because a recurring series lands in
// both places and fixing one left the flood untouched.
//
// MEASURED ON STAGING, 27 Aug 2026: 458 meeting sources, 377 holding one chunk
// or fewer, 232 both contentless and future-dated. Not 232 subjects — "Week
// planning" 51 times, "Pickleball" 51, "Jourfix" 50, "Week recap" 50.
//
// WHAT IT COST. Asked "what came out of the Team Assembly?" the base returned
// six passages and six citations, every one a 2027 placeholder reading "🧡 Team
// Assembly is a meeting of ours, on 2027-05-19.", and the 92-chunk transcript of
// the real August meeting was not among them. The retrieval bench scored that
// PASS, because a placeholder and the transcript HAVE THE SAME TITLE. No ranking
// separates them either — "Team Assembly is a meeting of ours" is a near-perfect
// semantic match for a question about the Team Assembly. Only the maker can.
describe("a meeting nobody has held and nobody has written on is not material", () => {
  /** Far enough ahead that this suite does not rot into a past date. */
  const AHEAD = new Date(Date.now() + 400 * 86_400_000).toISOString()
  const BEHIND = new Date(Date.now() - 400 * 86_400_000).toISOString()
  const meeting = (id: string, startsAt: string, extra = "") =>
    db().exec(
      `INSERT INTO meetings (id, account_id, title, starts_at, status, created_at, creator_id${extra ? ", agenda" : ""})
         VALUES ('${id}', '${IDS.victimAccount}', 'Week recap', '${startsAt}', 'scheduled', '2026-03-01',
                 '${IDS.staffUser}'${extra ? `, '${extra}'` : ""});`
    )

  const live = (id: string) =>
    (
      db()
        .prepare("SELECT deactivated_at AS d FROM knowledge_sources WHERE origin_table = 'meetings' AND origin_row_id = ?")
        .get(id) as { d: string | null } | undefined
    )?.d === null

  it("is not filed, however many occurrences the series has", async () => {
    for (const id of ["MTG_F1", "MTG_F2", "MTG_F3"]) meeting(id, AHEAD)
    await sweepUntilCaughtUp()
    for (const id of ["MTG_F1", "MTG_F2", "MTG_F3"])
      expect(live(id), `${id} has not happened and says nothing`).toBe(false)
  })

  it("but one somebody WROTE an agenda on is kept, whatever its date", async () => {
    meeting("MTG_AGENDA", AHEAD, "Walk the invoice run and agree the cutover.")
    await sweepUntilCaughtUp()
    expect(live("MTG_AGENDA"), "an agenda is words, and words are material").toBe(true)
  })

  /* THE OWNER OVERRULED THIS ON 28 AUG 2026, and the sentence it used to assert
     is preserved above the new one because the argument was not wrong, it lost.
     It read: "a bare meeting that HAS happened is kept — that is the record that
     it did", on the ground that "when did we meet?" is a question only this can
     answer.

     IT IS NOT. The meeting is a row in `meetings`, on the Meetings screen, and
     the assistant reaches it through `list_meetings`. The knowledge base answers
     from WORDS, and a bare meeting has none — so what the old rule bought was a
     second, wordless copy of a fact the app already held, competing for citation
     slots against material that has something to say.

     The count is what settled it: 369 of 461 meetings in the agency's own base
     held no words. */
  it("and a bare meeting that HAS happened is not filed either — the meetings list knows", async () => {
    meeting("MTG_PAST", BEHIND)
    await sweepUntilCaughtUp()
    expect(
      live("MTG_PAST"),
      "a meeting with no agenda, no notes and no transcript is not material, whatever its date"
    ).toBe(false)
  })

  it("and it comes back the moment somebody writes on it", async () => {
    meeting("MTG_REVIVE", BEHIND)
    await sweepUntilCaughtUp()
    expect(live("MTG_REVIVE"), "bare, so not filed").toBe(false)
    // `updated_at` MOVES, because the sweep walks a keyset over it and a real
    // edit through the app stamps it (the audit block every write here carries).
    // Setting the notes without it would leave the row behind the cursor — which
    // is a fact about how the sweep finds work, not a way to hide a revival.
    db().exec(
      `UPDATE meetings SET notes = 'We agreed the cutover date.', updated_at = '2099-01-01' WHERE id = 'MTG_REVIVE';`
    )
    await sweepUntilCaughtUp()
    // RETIRED, NOT SKIPPED — the distinction the reader's own comment draws, and
    // the reason this is safe to apply to rows already filed under the old rule.
    expect(live("MTG_REVIVE"), "words arrived, so the sweep revives it").toBe(true)
  })

  // AND THE TRANSCRIPT WINS THE SLOT IT WAS LOSING. The whole point, asserted on
  // the answer rather than on the row: with the placeholders gone, a question
  // about the meeting reaches the meeting that happened.
  it("so a question about the series reaches the one that actually took place", async () => {
    for (const id of ["MTG_N1", "MTG_N2", "MTG_N3", "MTG_N4"]) meeting(id, AHEAD)
    db().exec(
      `INSERT INTO meetings (id, account_id, title, starts_at, status, transcript_text, created_at, creator_id)
         VALUES ('MTG_REAL', '${IDS.victimAccount}', 'Week recap', '${BEHIND}', 'held',
                 'Aurora observed increased team horsepower and specialisation, so client deliveries land faster.',
                 '2026-03-01', '${IDS.staffUser}');`
    )
    await sweepUntilCaughtUp()
    const answer = await ask("What did we agree in the week recap?")
    expect(answer.found, "the transcript is right there").toBe(true)
    const bodies = answer.passages.map((p) => p.text).join(" ")
    expect(bodies, "the answer must reach the transcript, not the diary entries").toMatch(/horsepower/i)
  })
})
