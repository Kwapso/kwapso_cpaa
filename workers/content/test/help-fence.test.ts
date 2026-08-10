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

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
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

/** The ids a ticket response actually carries. */
async function ticketIds(res: Response): Promise<string[]> {
  const body = (await res.json()) as { tickets?: { id: string }[] }
  return (body.tickets ?? []).map((t) => t.id)
}

beforeEach(() => {
  sent = []
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
  const ticket = (id: string, who: string, name: string, text: string) =>
    db().exec(
      `INSERT INTO help (id, description, status, resolved, created_at, creator_id, creator_email, creator_name)
       VALUES ('${id}', '${text}', 'open', 0, '2026-03-01', '${who}', '${name}@example', '${name}');`
    )
  ticket(TICKETS.burglar, IDS.burglarUser, "Diego", "Cannot download last quarter")
  ticket(TICKETS.staff, IDS.staffUser, "Staff", "Internal: migrate the Delaval records")
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
