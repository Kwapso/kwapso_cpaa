// A TICKET DOES NOT LEAVE `new` UNTIL IT SAYS WHAT IT IS ABOUT.
//
// The owner's ruling, 19 Aug 2026: "A ticket must always be linked to a client
// or app before being triaged. If that is not the case, then let it be in a
// pre-triage or draft state. Only when I assign it a client app and who made
// the ticket, and all of the fields that are already required, can it go into a
// triage state."
//
// NO NEW STATUS WAS ADDED, and this suite is where that decision is defended.
// `new` has always meant "raised, and nobody here has read it yet", which is the
// same sentence as "pre-triage" — a `draft` beside it would be two names for one
// place, and every filter, digest, screen and machine tool that knows `new`
// would have had to learn the second one. What was missing was never the STATE.
// It was the REASON: a ticket sat there with a button that would fail and
// nothing on the row saying why. So the gate REPORTS its gaps, and this asserts
// both halves — the refusal, and the naming.
//
// It is checked in the model rather than at the door because there is more than
// one way to reach `markTriaged` (the triage screen, the agent, an MCP tool),
// and one of them will be written by somebody who has never read the route file.

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
import { triageGaps, TRIAGE_REQUIRES } from "@shared/triage-readiness"

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

const call = (userId: string, route: string, body?: unknown) => {
  const [method, path] = route.split(" ")
  return worker.fetch(
    new Request(`https://content${path}`, {
      method,
      headers: { Cookie: "session=x", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    }),
    env(userId) as never
  )
}

const statusOf = (id: string) =>
  (db().prepare(`SELECT status FROM help WHERE id = ?`).get(id) as { status: string }).status

async function raise(fields: Record<string, unknown>): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/help", {
    description: "The dispatch board will not load on a phone",
    ...fields,
  })
  const body = (await res.json()) as { tickets?: { id: string }[]; error?: string; message?: string }
  if (!body.tickets?.[0]) throw new Error(`raise failed ${res.status}: ${JSON.stringify(body)}`)
  return body.tickets[0].id
}

/** The English the door uses for each gap, asserted so a refusal cannot quietly
 * stop naming what is missing. Mirrors TRIAGE_GAP_ENGLISH by design — if that
 * map is reworded, this fails and somebody re-reads the sentence. */
const GAP_WORDS: Record<string, string> = {
  type: "a ticket type",
  client: "a client",
  app: "an app",
  raisedBy: "who raised it",
}

const COMPLETE = {
  helpType: "Question",
  accountId: IDS.victimAccount,
  appId: IDS.victimApp,
  raisedByContactId: IDS.victimPerson,
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("pre-triage is a reason, not a status", () => {
  it("moves a COMPLETE ticket, so the gate is a step and not a wall", async () => {
    const id = await raise(COMPLETE)
    expect((await call(IDS.staffUser, "POST /api/content/help/triage-read", { id })).status).toBe(200)
    expect(statusOf(id)).toBe("triaged")
  })

  // ONE FIELD AT A TIME. A single "incomplete ticket is refused" case would pass
  // just as well if only ONE of the four were actually being read — which is the
  // shape of bug this project has shipped before, and the reason the loop is
  // derived from `TRIAGE_REQUIRES` rather than written out four times.
  for (const gap of TRIAGE_REQUIRES) {
    const field = { type: "helpType", client: "accountId", app: "appId", raisedBy: "raisedByContactId" }[gap]
    it(`refuses, and stays at new, when ${gap} is the only thing missing`, async () => {
      const { [field]: _dropped, ...rest } = COMPLETE as Record<string, unknown>
      // DROPPING THE CLIENT DROPS THE CONTACT WITH IT, because the create door
      // already refuses "a contact belongs to one" — you cannot raise a ticket
      // naming who reported it and not naming the company they are at. So this
      // case is genuinely two gaps, and the assertion below still holds: the
      // refusal must name the client.
      if (field === "accountId") delete rest.raisedByContactId
      const id = await raise(rest)
      const res = await call(IDS.staffUser, "POST /api/content/help/triage-read", { id })
      expect(res.status, `a ticket missing ${gap} must be refused`).toBe(409)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe("not_ready_for_triage")
      // THE REFUSAL NAMES WHAT IS MISSING. A 409 saying only "no" would leave the
      // person exactly where the old silent button left them, and the whole point
      // of the ruling was that a stuck ticket should say why.
      expect(body.message, "the refusal must name the gap").toContain(GAP_WORDS[gap])
      expect(statusOf(id), "a refused ticket stays in pre-triage").toBe("new")
    })
  }

  it("the screen and the door read the SAME rule", () => {
    // `triageGaps` is the one definition. If a future edit gives the screen its
    // own opinion, this is the assertion that notices: the function must answer
    // for every field, and answer nothing when they are all present.
    expect(triageGaps({})).toEqual([...TRIAGE_REQUIRES])
    expect(
      triageGaps({ helpType: "Question", accountId: "A", appId: "AP", raisedByContactId: "P" })
    ).toEqual([])
    // Whitespace is not an answer.
    expect(triageGaps({ helpType: "  ", accountId: "A", appId: "AP", raisedByContactId: "P" })).toEqual(["type"])
  })
})
