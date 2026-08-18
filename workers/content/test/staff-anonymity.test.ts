// STAFF ANONYMITY IS ONE PROMISE, AND IT IS KEPT ON EVERY SURFACE THAT LEAVES
// THE BUILDING — proved against a real SQLite database through the shipped doors.
//
// SCOPE ch.06: "the portal shows work status but never which staff member is
// doing it." `listReplies` kept that on the wire by blanking the author's NAME,
// and left the author's ID — a stable per-person handle on every ticket that
// person ever touches. A pseudonym is anonymity right up until something links it
// to a name once, and the reply notification did exactly that: same person's
// inbox, same reply, "Staff replied to your support ticket." Two green halves in
// front of a live linkage.
//
// The second suite here is the other thing a ticket was a key to: the staff
// DIRECTORY. The stakeholder set derives the team's admins and resolves them to
// name, email address and photograph — reachable with `help:read` and a ticket
// id. Every other name in that set is a property of the TICKET; the admins are a
// property of the role table, which is R18's sentence in a module that had not
// heard it.
//
// The third is the TICKET ITSELF, and it is the largest of the three by volume.
// `listReplies` redacted a thread's authors while `toTicket`, forty lines above
// it, emitted `raiserId`, `raiserName` and `editorName` with no portal branch at
// all — so every row of a client's support list named the staff member who
// raised it and the one who last touched it. Staff raise a client's questions
// for them (SCOPE ch.07): 220 of the 221 seeded historical requests are
// staff-raised, which makes this the majority case rather than an edge. The
// portal's own screen has carried a note about it for weeks
// (web-portal/components/support-screen.tsx) saying the decision belonged on the
// server, next to the one the thread already made.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

/** Every email the worker would have sent, captured instead of sent — this is
 * the surface the anonymity promise was leaking through, so it has to be
 * observable rather than assumed. */
let sent: { to: string; subject: string; html: string }[] = []

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    AUTH: {
      fetch: async (url: string, init?: { body?: string }) => {
        if (String(url).includes("/internal/send-email")) {
          const b = JSON.parse(init?.body ?? "{}") as { to: string; subject: string; html?: string }
          sent.push({ to: b.to, subject: b.subject, html: b.html ?? "" })
          return new Response("{}")
        }
        return (base.AUTH as { fetch: (u: string, i?: unknown) => Promise<Response> }).fetch(url, init)
      },
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

/** The agency's OWN ticket — no account, so no client is anywhere near it. */
const STAFF_TICKET = "H_STAFF_ONLY"

beforeEach(() => {
  sent = []
  holder.db = buildSpineDb()
  // The stakeholder reader resolves each person's PHOTO as well as their name and
  // email — that is the disclosure, so the column has to exist for the assertion
  // to be about the right thing. It used to be added here, locally, rather than
  // widening a fixture every other suite depends on; the members door selects it
  // too, so `image_url` is on the shared fixture now, where the real table has it.
  // THERE MUST BE A ROSTER TO LEAK. The stakeholder reader derives admins as
  // "holders of the role with is_default = 1", and the shared fixture's staff
  // role is not that role — so without this, the "no admin roster" case below
  // passes because there are no admins at all, which proves nothing. Move the
  // default onto the role the staff user actually holds.
  db().exec(
    `UPDATE member_roles SET is_default = 0 WHERE is_default = 1;
     UPDATE member_roles SET is_default = 1 WHERE id = '${IDS.adminRole}';`
  )
  // A SECOND admin, who raises nothing and is mentioned by nobody. She is the
  // roster: the only way she can appear in a stakeholder set is the derived-admin
  // expansion, so an assertion about her is an assertion about exactly that.
  db().exec(
    `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_ADMIN2', 'nora@kwapso.app', 'Nora', '${IDS.team}');
     INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m7', '${IDS.team}', 'U_ADMIN2', '${IDS.adminRole}', '2026-01-01');`
  )
  db().exec(
    `INSERT INTO help (id, description, status, resolved, account_id, created_at, creator_id, creator_email, creator_name)
     VALUES ('${STAFF_TICKET}', 'Internal: migrate the Delaval records', 'new', 0, NULL, '2026-03-01', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff');`
  )
})

describe("a client never learns which staff member is doing the work", () => {
  /** Staff answer the victim's ticket. What the client then reads back, and what
   * lands in their inbox, is what every case below is about. */
  async function staffReplies(body = "We are looking into the March run now.") {
    expect((await call(IDS.staffUser, "POST /api/content/help/reply", { helpId: IDS.victimTicket, body })).status).toBe(200)
  }

  it("the thread carries NEITHER the staff author's name NOR their id", async () => {
    await staffReplies()
    const res = await call(IDS.victimUser, "GET /api/content/help/thread", undefined, `?id=${IDS.victimTicket}`)
    expect(res.status).toBe(200)
    const { replies } = (await res.json()) as {
      replies: { authorId: string | null; authorName: string | null; body: string }[]
    }
    const fromStaff = replies.find((r) => r.body.includes("March run"))
    expect(fromStaff, "the client must be able to READ the reply — anonymity is not silence").toBeDefined()
    expect(fromStaff?.authorName, "no staff name on the wire").toBeNull()
    // The HANDLE, not just the label — this is what made the email's slip permanent.
    expect(fromStaff?.authorId, "no staff handle on the wire either").toBeNull()
    expect(JSON.stringify(replies)).not.toContain(IDS.staffUser)
  })

  it("their own reply still carries their id, or the screen cannot say 'You'", async () => {
    await call(IDS.victimUser, "POST /api/content/help/reply", { helpId: IDS.victimTicket, body: "Thanks, any news?" })
    const res = await call(IDS.victimUser, "GET /api/content/help/thread", undefined, `?id=${IDS.victimTicket}`)
    const { replies } = (await res.json()) as { replies: { authorId: string | null; body: string }[] }
    expect(replies.find((r) => r.body.includes("any news"))?.authorId).toBe(IDS.victimUser)
  })

  it("a colleague on the same company IS named — anonymity is not a lie about who is talking", async () => {
    await call(IDS.contactUser, "POST /api/content/help/reply", {
      helpId: IDS.victimTicket,
      body: "Luis here, adding the invoice numbers.",
    })
    const res = await call(IDS.victimUser, "GET /api/content/help/thread", undefined, `?id=${IDS.victimTicket}`)
    const { replies } = (await res.json()) as {
      replies: { authorId: string | null; authorName: string | null; body: string }[]
    }
    const colleague = replies.find((r) => r.body.includes("Luis here"))
    expect(colleague?.authorId).toBe(IDS.contactUser)
    expect(colleague?.authorName).toBeTruthy()
  })

  it("and the NOTIFICATION does not name them either — the other half of the same promise", async () => {
    await staffReplies()
    const toClient = sent.find((m) => m.to === "marta@bergman.example")
    expect(toClient, "the client is still told there is a reply").toBeDefined()
    // The staff member is called "Staff" in the shared fixture. An email that
    // says "Staff replied…" hands the client the name behind the handle the
    // thread would not give them.
    expect(`${toClient?.subject} ${toClient?.html}`).not.toContain("Staff replied")
  })

  it("staff still see each other by name — this is about clients, not about secrecy", async () => {
    db().exec(
      `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_STAFF2', 'sam@kwapso.app', 'Sam', '${IDS.team}');
       INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m9', '${IDS.team}', 'U_STAFF2', '${IDS.adminRole}', '2026-01-01');`
    )
    await call("U_STAFF2", "POST /api/content/help/reply", { helpId: STAFF_TICKET, body: "Picked this up." })
    const toStaff = sent.find((m) => m.to === "staff@kwapso.app")
    expect(toStaff, "a staff raiser is still notified").toBeDefined()
    expect(`${toStaff?.subject} ${toStaff?.html}`).toContain("Sam replied")
  })
})

describe("the stakeholder list does not hand out the staff roster", () => {
  /** A member who can use the support screen and nothing else — the ordinary
   * grant this was reachable with. */
  function helpOnlyMember() {
    db().exec(`
      INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('R_HELPONLY', 'Support desk', 0, '2026-01-01');
      INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
        VALUES ('P_HELPONLY', 'R_HELPONLY', 'help', 1, 1, 0, 0);
      INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_DESK', 'desk@kwapso.app', 'Desk', '${IDS.team}');
      INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m8', '${IDS.team}', 'U_DESK', 'R_HELPONLY', '2026-01-01');
    `)
  }

  it("help:read alone gets the ticket's own people, and no admin roster", async () => {
    helpOnlyMember()
    const res = await call("U_DESK", "GET /api/content/help/stakeholders", undefined, `?id=${STAFF_TICKET}`)
    expect(res.status).toBe(200)
    const { stakeholders } = (await res.json()) as {
      stakeholders: { userId: string; email: string; origin: string }[]
    }
    // The raiser is a property of the ticket and stays — the set is still useful.
    expect(stakeholders.map((s) => s.userId)).toContain(IDS.staffUser)
    // The ADMIN expansion is the member directory, and it is gone — Nora raised
    // nothing and was mentioned by nobody, so she can only be here as a roster row.
    expect(stakeholders.map((s) => s.origin)).not.toContain("admin")
    expect(JSON.stringify(stakeholders), "no roster name, and no roster ADDRESS").not.toContain("nora@kwapso.app")
  })

  it("team_members:read gets it back — the right that owns the directory pays for it", async () => {
    helpOnlyMember()
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
       VALUES ('P_HELPONLY_TM', 'R_HELPONLY', 'team_members', 1, 0, 0, 0);`
    )
    const res = await call("U_DESK", "GET /api/content/help/stakeholders", undefined, `?id=${STAFF_TICKET}`)
    const { stakeholders } = (await res.json()) as { stakeholders: { userId: string; origin: string }[] }
    expect(stakeholders.map((s) => s.origin)).toContain("admin")
    expect(stakeholders.map((s) => s.userId)).toContain("U_ADMIN2")
  })
})

describe("the ticket row itself names nobody on the agency's side", () => {
  /** A question STAFF raised on the client's behalf — the majority case. It sits
   * on the victim's account, so the fence lets the client read it; who raised it
   * is the only thing in question here. */
  const STAFF_RAISED = "H_FOR_CLIENT"

  beforeEach(() => {
    db().exec(
      `INSERT INTO help (id, description, status, resolved, account_id, created_at, creator_id, creator_email, creator_name)
       VALUES ('${STAFF_RAISED}', 'Called in by phone: the April statement is missing a line', 'new', 0,
               '${IDS.victimAccount}', '2026-03-02', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff');`
    )
  })

  /** One ticket as this caller is shown it. The by-id lookup is its own branch in
   * the route (a lookup, not a filtered page), so the tests below drive both. */
  async function readOne(userId: string, ticketId: string) {
    const res = await call(userId, "GET /api/content/help", undefined, `?id=${ticketId}`)
    expect(res.status).toBe(200)
    const { tickets } = (await res.json()) as {
      tickets: {
        id: string
        description: string
        raiserId: string | null
        raiserName: string | null
        editorName: string | null
      }[]
    }
    return tickets[0]
  }

  it("a staff-raised ticket reaches the client with NEITHER the name NOR the handle", async () => {
    const one = await readOne(IDS.victimUser, STAFF_RAISED)
    expect(one, "the client must still SEE the ticket — anonymity is not silence").toBeDefined()
    expect(one.description).toContain("April statement")
    expect(one.raiserName, "no staff name on the wire").toBeNull()
    // The HANDLE. A ULID is the same person on every ticket they ever touch, and
    // one linkage anywhere turns the whole history into a name.
    expect(one.raiserId, "no staff handle on the wire either").toBeNull()
  })

  it("and not through the LIST either — the door a client's screen actually calls", async () => {
    const res = await call(IDS.victimUser, "GET /api/content/help", undefined, "?scope=all")
    const { tickets } = (await res.json()) as { tickets: { id: string }[] }
    expect(
      tickets.map((t) => t.id),
      "the staff-raised ticket is in their company's list"
    ).toContain(STAFF_RAISED)
    expect(JSON.stringify(tickets), "no staff handle anywhere in the page").not.toContain(IDS.staffUser)
    expect(JSON.stringify(tickets), "no staff name anywhere in the page").not.toContain("Staff")
  })

  it("their own question is still theirs — a colleague is named, not called 'kwapso'", async () => {
    const one = await readOne(IDS.victimUser, IDS.victimTicket)
    expect(one.raiserId, "one of their own people keeps their handle").toBe(IDS.victimUser)
    expect(one.raiserName).toBeTruthy()
  })

  it("a staff EDIT does not sign itself either", async () => {
    // Staff move the client's own ticket along. The raiser stays their colleague;
    // the editor is ours, and the client is told a status, not a person.
    expect(
      (await call(IDS.staffUser, "POST /api/content/help/status", { id: IDS.victimTicket, status: "in_progress" }))
        .status
    ).toBe(200)
    const one = await readOne(IDS.victimUser, IDS.victimTicket)
    expect(one.raiserName, "their own colleague is still named").toBeTruthy()
    expect(one.editorName, "who moved it is ours, not theirs").toBeNull()
  })

  it("staff still see every name — this is about clients, not secrecy", async () => {
    const one = await readOne(IDS.staffUser, STAFF_RAISED)
    expect(one.raiserId).toBe(IDS.staffUser)
    expect(one.raiserName).toBe("Staff")
  })

  // THE FUNCTIONAL HALF. The route used to read the raiser off the ticket it had
  // just fetched, which is now redacted for exactly this caller — so a client
  // replying to a staff-raised question could have silently stopped notifying
  // anyone. Redaction is about what leaves the building, never about who gets told.
  it("a client's reply still reaches the staff member who raised the question", async () => {
    expect(
      (await call(IDS.victimUser, "POST /api/content/help/reply", { helpId: STAFF_RAISED, body: "Here is the line." }))
        .status
    ).toBe(200)
    expect(
      sent.find((m) => m.to === "staff@kwapso.app"),
      "the raiser must still be told there is an answer"
    ).toBeDefined()
  })
})
