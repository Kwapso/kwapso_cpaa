// THE HELP BURGLAR — a client login attacking the support doors, against a real
// SQLite database running the real team migrations. The source-scan suites
// (web-portal/test/portal-fence.test.ts) prove no portal-reachable read is BUILT
// without a fence; this one proves the fence actually holds, by driving the
// shipped route handlers and reading what comes back.
//
// It exists because a scan cannot catch a call site that passes the wrong value
// on purpose, and because the leak that earned it was in a RESPONSE, not a query:
// `POST /api/content/help` raised a ticket and answered with `ticketPage(…)`,
// whose `portal` argument defaulted to false. A client asking their first
// question was handed every other client's tickets — description text, raiser
// names and all — on the happy path, with no crafted request at all.
//
// The burglar's role holds EVERY help right. Their role is not what stops them;
// if they get through, the fence itself is broken.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { accountScope, mayHearChange, scopeStamp } from "../../../shared/workers/account-scope"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

/** Ticket ids, so an assertion can name exactly what must not come back. The
 * victim's is the shared fixture's own — the leak suites and this one must be
 * stealing the SAME ticket, or one of them is proving something else. */
const TICKETS = {
  victim: IDS.victimTicket,
  burglar: "H_BURGLAR",
  staff: "H_STAFF",
} as const

/** A phrase only the victim's ticket carries — ids alone would understate the
 * disclosure, which is the description text. */
const VICTIM_WORDS = "March invoice run"

const db = () => holder.db as DatabaseSync

/** Every email the worker would have sent, captured instead of sent — the reply
 * door is the one place the client portal can make the app write to a staff
 * inbox, so "how many went out" has to be observable. */
let sent: { to: string; subject: string }[] = []

/** Every live ping the worker published, captured instead of broadcast. A ping
 * carries a row id AND (since a client may hear their company's tickets) the
 * ACCOUNT the row belongs to — and whether a colleague hears it is decided from
 * that field alone, by mayHearChange, on a socket with no database. So the
 * publisher's side of that bargain has to be observable too. */
let published: { resource?: string; id?: string; op?: string; scope?: string }[] = []

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    // auth owns the Resend key; content asks it to send. Record, never send.
    AUTH: {
      fetch: async (url: string, init?: { body?: string }) => {
        if (String(url).includes("/internal/send-email")) {
          const body = JSON.parse(init?.body ?? "{}") as { to: string; subject: string }
          sent.push({ to: body.to, subject: body.subject })
          return new Response("{}")
        }
        return (base.AUTH as { fetch: (u: string, i?: unknown) => Promise<Response> }).fetch(url, init)
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

/** The caller's fence, resolved through the SHIPPED guard corridor against this
 * database — never hand-built. A stamp typed out by hand would prove only that
 * the assertion agrees with itself. */
const stampFor = async (userId: string) =>
  scopeStamp(
    await accountScope({ accountId: "acct", token: "token" } as never, {
      userId,
      teamId: IDS.team,
      roleId: IDS.clientRole,
      databaseId: "db_team",
    })
  )

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

/** The ids a ticket response actually carries. */
async function ticketIds(res: Response): Promise<string[]> {
  const body = (await res.json()) as { tickets?: { id: string }[] }
  return (body.tickets ?? []).map((t) => t.id)
}

/** A contact of the NESTED company, and nothing above it: their record hangs
 * under Bergman Workshop, which hangs under Bergman S.A. The fence reaches DOWN
 * and never climbs, so this person is the proof of the second half of that
 * sentence — and there is no one in the shared fixture standing that far in. */
const CHILD = { user: "U_CHILD", person: "A_CHILD_PERSON", portal: "P_CHILD", ticket: "H_CHILD" } as const

beforeEach(() => {
  sent = []
  published = []
  holder.db = buildSpineDb()
  // The shared spine fixture grants BOTH roles every right on `help` already —
  // stated here because it is the premise of the whole suite: the burglar's role
  // is not what stops them. If it ever stops being true, these tests answer
  // "refused" for the wrong reason, so assert it rather than assume it.
  for (const role of [IDS.adminRole, IDS.clientRole]) {
    const granted = db()
      .prepare(
        `SELECT COUNT(*) n FROM role_permissions
          WHERE role_id = ? AND module = 'help' AND can_read = 1 AND can_create = 1 AND can_edit = 1`
      )
      .get(role) as { n: number }
    expect(granted.n, `${role} must hold every help right for this suite to mean anything`).toBe(1)
  }
  // Three tickets, three worlds. The victim's comes from the shared fixture; the
  // other two are this suite's, so there is something for each caller to see.
  // Each carries the ACCOUNT it was raised for — the agency's own carries none,
  // because it belongs to no client and NULL never matches an account fence.
  const ticket = (id: string, who: string, name: string, text: string, account: string | null) =>
    db().exec(
      `INSERT INTO help (id, description, status, resolved, account_id, created_at, creator_id, creator_email, creator_name)
       VALUES ('${id}', '${text}', 'open', 0, ${account ? `'${account}'` : "NULL"}, '2026-03-01', '${who}', '${name}@example', '${name}');`
    )
  ticket(TICKETS.burglar, IDS.burglarUser, "Diego", "Cannot download last quarter", IDS.burglarAccount)
  ticket(TICKETS.staff, IDS.staffUser, "Staff", "Internal: migrate the Delaval records", null)

  // The nested company's own contact + login. Local to this suite: it is the
  // only one that asks what a subsidiary may see, and a fixture nobody else
  // reads is one nobody else has to reason about.
  db().exec(`
    INSERT INTO users (id, email, first_name, current_team_id) VALUES ('${CHILD.user}', 'ana@workshop.example', 'Ana', '${IDS.team}');
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m5', '${IDS.team}', '${CHILD.user}', '${IDS.clientRole}', '2026-01-01');
    INSERT INTO accounts (id, account_type, parent_account_id, name, created_at, creator_id)
      VALUES ('${CHILD.person}', 'individual', '${IDS.victimChild}', 'Ana Soler', '2026-01-01', '${IDS.staffUser}');
    INSERT INTO portal_users (id, account_id, user_id, created_at, creator_id)
      VALUES ('${CHILD.portal}', '${CHILD.person}', '${CHILD.user}', '2026-01-01', '${IDS.staffUser}');
  `)
  ticket(CHILD.ticket, CHILD.user, "Ana", "The Workshop scales are offline", IDS.victimChild)
})

describe("raising a ticket answers with YOUR tickets, never the team's", () => {
  // THE ONE THAT WAS REAL. No crafted request: a client asks a question through
  // the portal and reads the response body.
  it("a client login raising a ticket never sees another client's", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help", {
      description: "New question about our March report",
    })
    expect(res.status).toBe(200)
    const ids = await ticketIds(res)
    expect(ids, "the victim's ticket must not be in a burglar's response").not.toContain(TICKETS.victim)
    expect(ids, "nor the agency's internal one").not.toContain(TICKETS.staff)
    expect(ids, "their own ticket is still theirs to see").toContain(TICKETS.burglar)
  })

  // The description text is the actual disclosure — ids alone would understate it.
  it("…and not one word of another client's description", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help", { description: "Another question" })
    expect(await res.text()).not.toContain(VICTIM_WORDS)
  })

  it("the total it reports counts only what the caller may see", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help", { description: "Third question" })
    const body = (await res.json()) as { total: number }
    // Their own two: the seeded one plus the one just raised.
    expect(body.total).toBe(2)
  })

  it("staff still see the whole team's tickets (the fence narrows clients only)", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/help", { description: "Staff note" })
    const ids = await ticketIds(res)
    expect(ids).toContain(TICKETS.victim)
    expect(ids).toContain(TICKETS.burglar)
    expect(ids).toContain(TICKETS.staff)
  })
})

describe("the help WRITES carry the fence, not just the reads", () => {
  it("editing another client's ticket is a 404, identical to a made-up id", async () => {
    const real = await call(IDS.burglarUser, "POST /api/content/help/update", {
      id: TICKETS.victim,
      description: "Rewritten by someone else",
    })
    const invented = await call(IDS.burglarUser, "POST /api/content/help/update", {
      id: "H_DOES_NOT_EXIST",
      description: "Rewritten by someone else",
    })
    expect(real.status).toBe(404)
    expect(await real.text()).toBe(await invented.text())
    // …and the row is untouched.
    const row = db().prepare(`SELECT description FROM help WHERE id = '${TICKETS.victim}'`).get() as {
      description: string
    }
    expect(row.description).toContain(VICTIM_WORDS)
  })

  it("moving another client's ticket along its lifecycle is a 404, and moves nothing", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help/status", {
      id: TICKETS.victim,
      status: "resolved",
    })
    expect(res.status).toBe(404)
    const row = db().prepare(`SELECT status FROM help WHERE id = '${TICKETS.victim}'`).get() as { status: string }
    expect(row.status).toBe("open")
  })

  it("replying on another client's ticket is a 404, and appends nothing", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help/reply", {
      helpId: TICKETS.victim,
      body: "Reading your thread",
    })
    expect(res.status).toBe(404)
    const n = db().prepare(`SELECT COUNT(*) n FROM help_threads WHERE help_id = '${TICKETS.victim}'`).get() as {
      n: number
    }
    expect(n.n).toBe(0)
  })
})

describe("a client login cannot aim the app's email at staff", () => {
  // The reply door is gated only on help:read — which the seeded Client role
  // holds — and every mention becomes an email from the team's verified sender
  // carrying the caller's own text. The portal serves no member list, so a
  // mention array here can only have been hand-written.
  it("refuses a reply that carries mentions, and sends nothing", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help/reply", {
      helpId: TICKETS.burglar,
      body: "Please look at this",
      taggedUserIds: [IDS.staffUser],
    })
    expect(res.status).toBe(403)
    expect(sent, "no email may leave on a refused reply").toEqual([])
    const n = db().prepare(`SELECT COUNT(*) n FROM help_threads WHERE help_id = '${TICKETS.burglar}'`).get() as {
      n: number
    }
    expect(n.n, "and the reply itself must not land either").toBe(0)
  })

  it("a plain client reply still works, and still emails nobody", async () => {
    const res = await call(IDS.burglarUser, "POST /api/content/help/reply", {
      helpId: TICKETS.burglar,
      body: "Any news?",
    })
    expect(res.status).toBe(200)
    expect(sent, "their own ticket, their own reply — there is no one to notify").toEqual([])
  })

  it("staff keep mentions (the refusal is about the client surface, not the feature)", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/help/reply", {
      helpId: TICKETS.staff,
      body: "Taking a look",
      taggedUserIds: [IDS.burglarUser],
    })
    expect(res.status).toBe(200)
    expect(sent.map((s) => s.to)).toContain("burglar@delaval.example")
  })
})

// A CONTACT SEES THEIR COMPANY'S QUESTIONS (owner decision, 11 Aug 2026).
//
// The first version of this fence pinned a client login to `creator_id = them`,
// which is safe and wrong: at a real client the finance person and the ops
// person are two people at ONE company, and each was told the other's question
// did not exist. The ruling widens "me" to "my company and everything nested
// beneath it" — which is not a new idea, it is the account fence that already
// decides which companies and contacts they can see.
//
// So these are the three questions the widening has to answer, and they are
// answered against a real database through the shipped handlers, because the
// scan next door (web-portal/test/portal-fence.test.ts) can prove the fence is
// BUILT and only this can prove where it stops.
describe("a contact sees their company's questions, and no further", () => {
  // Marta (linked to Bergman S.A.) raised H_VICTIM. Luis's own record hangs
  // UNDER Bergman S.A. — two contacts of one company, attached the two different
  // ways the fence recognises. Neither can see the other's ticket under the old
  // rule, and that is what the owner overruled.
  it("a second contact at the same company sees the first one's request", async () => {
    const res = await call(IDS.contactUser, "GET /api/content/help")
    const ids = await ticketIds(res)
    expect(res.status).toBe(200)
    expect(ids, "his colleague's question is his company's question").toContain(TICKETS.victim)
    // …and the DESCRIPTION really is served, not just the id: the whole point is
    // that he can read and answer it.
    expect(await (await call(IDS.contactUser, "GET /api/content/help")).text()).toContain(VICTIM_WORDS)
  })

  // THE HALF THAT WAS MISSING, and it was most of the product.
  //
  // A ticket's account is what the fence reads, and it used to be set ONLY for a
  // portal caller — so every ticket the agency typed in on a client's behalf
  // belonged to nobody and reached nobody. That is not an edge case here: it is
  // how this agency works. 220 of the 221 requests in the staging seed were
  // staff-raised, and a client signed in to read their own history saw zero.
  it("a ticket the AGENCY raises for a client reaches that client's people", async () => {
    const raised = await call(IDS.staffUser, "POST /api/content/help", {
      description: "Phoned in: the Tuesday export is arriving empty",
      accountId: IDS.victimAccount,
    })
    expect(raised.status, "staff may name the client a ticket is for").toBe(200)

    const seen = await (await call(IDS.contactUser, "GET /api/content/help")).text()
    expect(seen, "the client's own people must see what we typed in for them").toContain("Tuesday export")

    const stranger = await (await call(IDS.burglarUser, "GET /api/content/help")).text()
    expect(stranger, "and nobody else's").not.toContain("Tuesday export")
  })

  it("the agency's own internal ticket still belongs to nobody", async () => {
    // The other half of the same decision: no account named means no client, and
    // that must stay reachable — otherwise every internal note leaks to whoever
    // was last mentioned.
    await call(IDS.staffUser, "POST /api/content/help", { description: "Internal: rotate the D1 token" })
    for (const who of [IDS.contactUser, IDS.burglarUser]) {
      expect(await (await call(who, "GET /api/content/help")).text()).not.toContain("rotate the D1 token")
    }
  })

  it("a CLIENT cannot name someone else's company — the body is not consulted", async () => {
    // A portal caller's account comes from the guard corridor. If the body could
    // override it, a client would raise a ticket straight into another company's
    // world, and the fence would faithfully deliver it there.
    await call(IDS.burglarUser, "POST /api/content/help", {
      description: "Planted: this must not land at Bergman",
      accountId: IDS.victimAccount,
    })
    const victimSees = await (await call(IDS.contactUser, "GET /api/content/help")).text()
    expect(victimSees, "a client's own account is the only one they can raise into").not.toContain("Planted")
  })

  it("a made-up client is refused, not written", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/help", {
      description: "For a client that isn't there",
      accountId: "A_DOES_NOT_EXIST",
    })
    expect(res.status, "an unchecked id would fence a ticket to nothing, forever").toBe(400)
    expect(await (await call(IDS.staffUser, "GET /api/content/help")).text()).not.toContain("client that isn't there")
  })

  it("a ticket that belongs to nobody can be given a client, once", async () => {
    const orphan = await (
      await call(IDS.staffUser, "POST /api/content/help", { description: "Orphan: raised before we asked whose" })
    ).json() as { tickets?: { id: string; description: string }[] }
    const id = (orphan.tickets ?? []).find((t) => t.description.startsWith("Orphan:"))!.id

    const named = await call(IDS.staffUser, "POST /api/content/help/update", {
      id,
      description: "Orphan: raised before we asked whose",
      accountId: IDS.victimAccount,
    })
    expect(named.status).toBe(200)
    expect(await (await call(IDS.contactUser, "GET /api/content/help")).text()).toContain("Orphan:")

    // …and MOVED, never. Reassigning would take the thread away from the people
    // who have been reading it and hand it to strangers.
    const moved = await call(IDS.staffUser, "POST /api/content/help/update", {
      id,
      description: "Orphan: raised before we asked whose",
      accountId: IDS.burglarAccount,
    })
    expect(moved.status, "a ticket's client is set once").toBe(409)
    expect(await (await call(IDS.burglarUser, "GET /api/content/help")).text()).not.toContain("Orphan:")
  })

  it("a contact at a DIFFERENT company still sees none of it", async () => {
    const res = await call(IDS.burglarUser, "GET /api/content/help")
    const ids = await ticketIds(res)
    expect(ids, "another company's question is not theirs").not.toContain(TICKETS.victim)
    expect(ids, "nor is the nested company's").not.toContain(CHILD.ticket)
    expect(ids, "nor the agency's own").not.toContain(TICKETS.staff)
    expect(ids, "their own is still theirs").toContain(TICKETS.burglar)
  })

  // WHAT WE DECIDED ABOUT A NESTED COMPANY, and why. The fence reaches DOWN and
  // never climbs (shared/workers/account-scope.ts: "a person at a subsidiary
  // does not inherit the parent group"), so the group's contact sees the
  // subsidiary's questions and the subsidiary's contact does not see the
  // group's. We did not invent a rule for tickets — a ticket is just another row
  // in the world the account scope already draws, and a second rule would be a
  // second thing to get wrong.
  it("the fence reaches DOWN into a nested company, and never climbs", async () => {
    const group = await ticketIds(await call(IDS.victimUser, "GET /api/content/help"))
    expect(group, "the group's contact sees the subsidiary's question").toContain(CHILD.ticket)

    const nested = await ticketIds(await call(CHILD.user, "GET /api/content/help"))
    expect(nested, "the subsidiary's contact sees their own").toContain(CHILD.ticket)
    expect(nested, "and never the parent group's").not.toContain(TICKETS.victim)
  })

  // R16 — the two totals are exact, both fenced, and for a client login they
  // finally DIFFER: "All" is the company's, "My" is the part they raised. Under
  // the old fence those two numbers were always the same, which is the shape of
  // a tab that was quietly lying.
  it("My and All are exact, fenced, and no longer the same number", async () => {
    const res = await call(IDS.contactUser, "POST /api/content/help", { description: "Ana asked me to chase this" })
    const body = (await res.json()) as { total: number; mineTotal: number }
    // Bergman S.A.'s world: Marta's, the Workshop's (nested beneath), and his own.
    expect(body.total).toBe(3)
    expect(body.mineTotal, "only the one he raised is his").toBe(1)
  })

  it("a colleague may reply on the company's ticket; a stranger still cannot", async () => {
    const mine = await call(IDS.contactUser, "POST /api/content/help/reply", {
      helpId: TICKETS.victim,
      body: "Adding what I know about the invoice run",
    })
    expect(mine.status, "a company's question is answerable by the company").toBe(200)
    const theirs = await call(IDS.burglarUser, "POST /api/content/help/reply", {
      helpId: TICKETS.victim,
      body: "Reading your thread",
    })
    expect(theirs.status).toBe(404)
  })

  // THE LIVE HALF, which is not a detail: a support screen that cannot hear its
  // own colleague's question appear is a screen that lies until you reload it.
  // A socket has no database — it carries the caller's account set and reads the
  // ping. So the ping must NAME the account, and the fence must read it. Both
  // halves, in one test, because either alone passes while the feature is dead.
  it("a colleague HEARS the new question appear, and a stranger hears nothing", async () => {
    await call(IDS.contactUser, "POST /api/content/help", { description: "New question from the Bergman office" })
    const ping = published.find((p) => p.resource === "help" && p.op === "add")
    expect(ping, "raising a ticket must publish").toBeTruthy()
    expect((ping as { scope?: string }).scope, "the ping must name the company it belongs to").toBe(IDS.victimAccount)

    const colleague = await stampFor(IDS.victimUser) // Marta, same company
    const stranger = await stampFor(IDS.burglarUser) // Diego, another company
    expect(mayHearChange(colleague, ping as { resource: string }), "his colleague must hear it").toBe(true)
    expect(mayHearChange(stranger, ping as { resource: string }), "the other client must not").toBe(false)
    expect(mayHearChange(null, ping as { resource: string }), "staff hear everything").toBe(true)
  })

  // A thread now has three kinds of author. The portal draws "You", a colleague
  // by NAME, and the agency as itself — and it can only do that if the server
  // sends a name for one and withholds it for the other. Withholding is the part
  // that must not slip: SCOPE ch.06 says the portal never names which staff
  // member is doing the work, and until now that promise was kept by a component
  // choosing not to render a name it had been sent.
  it("a client is told their colleague's name, and never a staff member's", async () => {
    await call(IDS.contactUser, "POST /api/content/help/reply", { helpId: TICKETS.victim, body: "Chasing this" })
    await call(IDS.staffUser, "POST /api/content/help/reply", { helpId: TICKETS.victim, body: "Looking now" })

    const asClient = (await (await call(IDS.victimUser, "GET /api/content/help/thread", undefined, `?id=${TICKETS.victim}`)).json()) as {
      replies: { body: string; authorName: string | null }[]
    }
    const colleague = asClient.replies.find((r) => r.body === "Chasing this")
    const agency = asClient.replies.find((r) => r.body === "Looking now")
    expect(colleague?.authorName, "a colleague is a person, with a name").toBe("Luis")
    expect(agency?.authorName, "a staff member is the agency, and has no name here").toBeNull()

    // Staff read the same thread with every name on it — the anonymity is about
    // the client's surface, not about hiding colleagues from the people answering.
    const asStaff = (await (await call(IDS.staffUser, "GET /api/content/help/thread", undefined, `?id=${TICKETS.victim}`)).json()) as {
      replies: { body: string; authorName: string | null }[]
    }
    expect(asStaff.replies.find((r) => r.body === "Looking now")?.authorName).toBe("Staff")
  })

  it("a reply the AGENCY types reaches the client's screen, and only theirs", async () => {
    await call(IDS.staffUser, "POST /api/content/help/reply", { helpId: TICKETS.victim, body: "On it" })
    const thread = published.find((p) => p.resource === "help_threads")
    expect(thread, "a reply must publish the thread row").toBeTruthy()
    expect((thread as { scope?: string }).scope).toBe(IDS.victimAccount)
    expect(mayHearChange(await stampFor(IDS.contactUser), thread as { resource: string })).toBe(true)
    expect(mayHearChange(await stampFor(IDS.burglarUser), thread as { resource: string })).toBe(false)
  })
})

// THE AGENCY'S OWN MATERIAL IS NOT SERVED TO A CLIENT LOGIN.
//
// The account fence answers "which of these rows are theirs". Some doors have no
// such answer, because nothing behind them belongs to any client: the agency's
// internal how-to articles, and its dropdown vocabulary. The client portal's
// gateway already refuses them by not naming them — and its own comment says why
// ("publishing them here would be a disclosure, not a feature"). But the AGENCY
// origin serves the same doors to the same person, and a client login is an
// ordinary team member by construction, so the module right alone let them
// through: the whole library, and a full-field CSV export of it.
describe("the agency's internal material refuses a client login", () => {
  const READS = [
    { file: "workers/content/src/routes/learning.ts", fns: ["getLearning", "getLearningExport", "getLearningProgress"] },
    { file: "workers/tenancy/src/routes/selectable.ts", fns: ["getSelectable", "getSelectableExport"] },
  ]

  for (const { file, fns } of READS) {
    for (const fn of fns) {
      it(`${fn} refuses a portal caller`, () => {
        const src = readFileSync(join(__dirname, "../../..", file), "utf8")
        const at = src.indexOf(`export async function ${fn}(`)
        if (at === -1) return // the door was renamed or retired; the roster check below catches that
        const open = src.indexOf("{", at)
        let depth = 0
        let body = ""
        for (let i = open; i < src.length; i++) {
          if (src[i] === "{") depth++
          else if (src[i] === "}" && --depth === 0) { body = src.slice(open + 1, i); break }
        }
        expect(body, `${fn} must refuse a client login before it answers`).toMatch(/refusePortalCaller\(/)
      })
    }
  }

  it("the doors named here still exist", () => {
    for (const { file, fns } of READS) {
      const src = readFileSync(join(__dirname, "../../..", file), "utf8")
      for (const fn of fns)
        expect(src, `${file} no longer exports ${fn} — re-read this list`).toContain(
          `export async function ${fn}(`
        )
    }
  })
})
