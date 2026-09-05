// THE SECOND AND LAST EMAIL (.plans/BUILD-1 §7) — the answer to what they asked.
//
// The rule the whole file exists for: "only ticket resolutions and to-dos.
// Nothing else emails the client." So the cases here are as much about SILENCE
// as about sending — a reply does not email a client, a status move does not,
// and answering twice does not answer twice.

import type { DatabaseSync } from "node:sqlite"
import { withDeferred } from "./deferred"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))
const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; text: string }[] }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

vi.mock("@shared/workers/notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/notify")>()
  return {
    ...actual,
    sendBrandedEmail: async (
      _env: unknown,
      to: string,
      subject: string,
      content: { intro?: string; heading?: string }
    ) => {
      sent.emails.push({ to, subject, text: `${content.heading ?? ""} ${content.intro ?? ""}` })
      return true
    },
  }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: "https://kwapso.example",
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown, query = "") => {
  const [method, path] = route.split(" ")
  // …with a waiting context, so the door's deferred work (the outbound email)
  // has landed by the time the assertions run — see test/deferred.ts.
  return withDeferred((ctx) =>
    worker.fetch(
      new Request(`https://content${path}${query}`, {
        method,
        headers: { Cookie: "session=x", "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      }),
      env(userId) as never,
      ctx as never
    )
  )
}

const ticketRow = (id: string) =>
  db().prepare(`SELECT * FROM help WHERE id = ?`).get(id) as Record<string, string | number | null>

/** A ticket raised for the victim's company — the only kind that has anybody to
 * email. */
/** A ticket raised BY US on the client's behalf, naming the person who asked.
 *
 * Naming the contact is what makes this the ordinary case rather than an edge:
 * 220 of the 221 seeded historical requests are staff-typed (SCOPE ch.07), and
 * CHECKLIST 5.9 is the field that finally lets the row say who actually asked.
 * The resolution goes to THAT person and to the account's main stakeholder
 * (5.7, Aurora's ts3) — not, as it used to, to everybody at the company. */
async function clientTicket(description: string, raisedBy: string = IDS.victimPerson): Promise<string> {
  await call(IDS.staffUser, "POST /api/content/help", {
    description,
    accountId: IDS.victimAccount,
    raisedByContactId: raisedBy,
  })
  return (db().prepare(`SELECT id FROM help WHERE description = ?`).get(description) as { id: string }).id
}

beforeEach(() => {
  holder.db = buildSpineDb()
  sent.emails = []
  db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
})

describe("answering a ticket", () => {
  it("resolves it, joins the conversation, and emails their people — in one call", async () => {
    const id = await clientTicket("The dispatch board stopped refreshing")
    const res = await call(IDS.staffUser, "POST /api/content/help/resolve", {
      id,
      resolution: "The board refreshes on its own again — it was a stuck retry loop.",
    })
    expect(res.status).toBe(200)
    expect((await res.json()) as { sent: boolean }).toMatchObject({ sent: true })

    expect(ticketRow(id).status).toBe("resolved")
    // The answer lives where everything else about the request lives, not only in
    // an inbox.
    const replies = db().prepare(`SELECT message_body FROM help_threads WHERE help_id = ?`).all(id) as {
      message_body: string
    }[]
    expect(replies.map((r) => r.message_body)).toContain(
      "The board refreshes on its own again — it was a stuck retry loop."
    )
    // …and it reached the people at THAT company, and nobody else.
    expect(sent.emails.length).toBeGreaterThan(0)
    expect(sent.emails.every((e) => e.to.endsWith("@bergman.example"))).toBe(true)
    expect(sent.emails[0].text).toContain("stuck retry loop")
    // NO STAFF NAME, on the one surface that leaves the building.
    expect(sent.emails.some((e) => e.text.includes("Staff"))).toBe(false)
  })

  it("R17 — answering an answered ticket sends nothing and appends nothing", async () => {
    const id = await clientTicket("Asked once")
    await call(IDS.staffUser, "POST /api/content/help/resolve", { id, resolution: "Here is the answer." })
    const firstCount = sent.emails.length
    const res = await call(IDS.staffUser, "POST /api/content/help/resolve", {
      id,
      resolution: "Here is the answer again.",
    })
    expect((await res.json()) as { sent: boolean; alreadyResolved: boolean }).toMatchObject({
      sent: false,
      alreadyResolved: true,
    })
    expect(sent.emails).toHaveLength(firstCount)
    const replies = db().prepare(`SELECT COUNT(*) AS n FROM help_threads WHERE help_id = ?`).get(id) as {
      n: number
    }
    expect(replies.n).toBe(1)
  })

  it("says nothing to anybody about the agency's OWN question", async () => {
    // No account means no client. There is nobody outside the building to tell.
    await call(IDS.staffUser, "POST /api/content/help", { description: "Ours to sort out" })
    const id = (
      db().prepare(`SELECT id FROM help WHERE description = 'Ours to sort out'`).get() as { id: string }
    ).id
    const res = await call(IDS.staffUser, "POST /api/content/help/resolve", { id, resolution: "Sorted." })
    expect(res.status).toBe(200)
    expect(ticketRow(id).status).toBe("resolved")
    expect(sent.emails).toHaveLength(0)
  })

  it("is refused to a client login — 'resolved' is our word", async () => {
    const id = await clientTicket("Not theirs to close")
    const res = await call(IDS.contactUser, "POST /api/content/help/resolve", { id, resolution: "Done!" })
    expect(res.status).toBe(403)
    expect(ticketRow(id).status).toBe("new")
    expect(sent.emails).toHaveLength(0)
  })
})

// THE CLOSED LIST, from the other end. §7: "nothing else emails the client;
// everything else lives in the portal for them to look at."
describe("nothing else reaches a client's inbox", () => {
  it("a status move on its own emails nobody — and cannot reach `resolved` at all", async () => {
    const id = await clientTicket("Moved along quietly")
    for (const status of ["triaged", "scheduled", "in_progress", "ready"]) {
      await call(IDS.staffUser, "POST /api/content/help/status", { id, status })
    }
    expect(ticketRow(id).status).toBe("ready")
    // CHECKLIST 5.6, and this is the strongest form of "a status is not an
    // answer": the word is not reachable through the status door, so there is no
    // sequence of moves that emails a client without somebody writing the words.
    const tried = await call(IDS.staffUser, "POST /api/content/help/status", { id, status: "resolved" })
    expect(tried.status).toBe(400)
    expect(ticketRow(id).status).toBe("ready")
    expect(sent.emails, "a status is not an answer").toHaveLength(0)
  })

  // CHECKLIST 5.7 is a NARROWING as much as it is a rule. It used to go to every
  // live portal login at the company, which is right for a to-do (anybody can
  // send us the file) and wrong for an answer: a resolution is a reply to
  // somebody's question, and copying every colleague on it is how a client mutes
  // us. Two named people, and this is the case that proves the third is left out.
  it("reaches the raiser and the main stakeholder, and not the colleague who is neither", async () => {
    // Marta is the main stakeholder; Nadia raised it; the contact under the
    // company holds a login and is neither.
    db().exec(
      `UPDATE account_links SET is_main_stakeholder = 1 WHERE id = '${IDS.victimLink}';
       -- Nadia is a contact AT the company and holds a login of her own. The link
       -- is what the door checks: CHECKLIST 5.9 will not let a ticket name a
       -- person who is not a contact there, which is the half that stops a
       -- stranger's name landing on somebody else's record.
       INSERT INTO account_links (id, account_id, person_account_id, relationship, created_at, creator_id)
       VALUES ('L_NADIA', '${IDS.victimAccount}', '${IDS.clientPerson}', 'Finance', '2026-01-01', '${IDS.staffUser}');
       INSERT INTO portal_users (id, account_id, user_id, created_at, creator_id)
       VALUES ('P_NADIA', '${IDS.clientPerson}', '${IDS.clientUser}', '2026-01-01', '${IDS.staffUser}');`
    )
    const id = await clientTicket("Two people should hear about this", IDS.clientPerson)
    sent.emails = []
    await call(IDS.staffUser, "POST /api/content/help/resolve", { id, resolution: "Done." })
    const to = sent.emails.map((e) => e.to).sort()
    expect(to.length, "the answer reached nobody").toBeGreaterThan(0)
    expect(to, "a colleague who is neither the raiser nor the main stakeholder was copied in").not.toContain(
      "contact@bergman.example"
    )
  })

  it("a staff reply reaches the RAISER, and a staff raiser is not a client", async () => {
    // The fixture's tickets are staff-raised, which is the majority case (SCOPE
    // ch.07). A reply notifies whoever asked — here, us — so the closed list is
    // untouched: no client heard anything.
    const id = await clientTicket("Raised on their behalf")
    await call(IDS.staffUser, "POST /api/content/help/reply", { helpId: id, body: "Looking at it." })
    expect(sent.emails.every((e) => !e.to.endsWith("@bergman.example"))).toBe(true)
  })
})
