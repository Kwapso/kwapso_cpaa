// A PANEL THAT CANNOT SAY WHAT IT IS GRANTING CANNOT BE MEANINGFULLY APPROVED.
//
// `grant_portal_access` is the write that decides who can see a customer's whole
// world, and its confirm panel read: "Give 01JXXXX… a login on account 01JYYYY…".
// Two raw ULIDs. That is a yes/no question a human cannot actually answer — and
// approving a client contact's login is routine, so it gets answered yes.
//
// It matters more than it looks, because of WHERE the door gets the person from:
// it reads the EMAIL off that account row and grants the login to whichever
// platform user holds that address (userIdForPerson, workers/tenancy). So the one
// fact that decides who walks in was the one fact the panel declined to show, and
// anyone can put a `users` row behind an address of their choosing — signing in
// once at the open front door is the whole of it.
//
// This suite proves the panel now NAMES BOTH ENDS, through the real resolveNames
// against the real detail door's shape. It is the half of the fix that closes the
// CLASS rather than the instance: whatever moved that email — the update tool, an
// import, a hand-edit — the person clicking Go ahead sees the address it will
// actually land on.

import { describe, expect, it } from "vitest"

import { pendingCall } from "@shared/workers/confirm-payload"
import { sharedByName } from "@shared/workers/tool-catalog"
import { resolveNames } from "../src/lib/agent"
import { getTool } from "../src/lib/tools"

const PERSON = "01JPERSON"
const COMPANY = "01JCOMPANY"

/** The books, as the accounts detail door serves them. */
const BOOKS: Record<string, { name: string; email: string | null }> = {
  [PERSON]: { name: "Marta Ruiz", email: "marta@bergman.example" },
  [COMPANY]: { name: "Bergman S.A.", email: null },
}

/** Every account id the resolver actually asked about — the bounded-read claim. */
let asked: string[] = []

/** A TENANCY binding serving the REAL door's response shape ({ account: {…} }).
 * A stub shaped like something else would prove only that the stub agrees with
 * itself. */
function env(): never {
  return {
    TENANCY: {
      fetch: async (url: string) => {
        const id = new URL(url).searchParams.get("id") ?? ""
        asked.push(id)
        const account = BOOKS[id]
        if (!account) return new Response("not found", { status: 404 })
        return new Response(JSON.stringify({ account: { id, ...account } }), {
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  } as never
}

const request = () => new Request("https://data-ops/api/agent/chat", { headers: { Cookie: "session=x" } })
const call = (input: Record<string, unknown>) => ({ id: "1", name: "grant_portal_access", input })
const GRANT = { accountId: COMPANY, personAccountId: PERSON }

/** The panel exactly as the propose path builds it: the one pendingCall seam, fed
 * by the same resolveNames output. */
async function panel(input: Record<string, unknown>) {
  const names = await resolveNames(env(), request(), [call(input)])
  return pendingCall(getTool("grant_portal_access")!, input, names)
}

describe("the portal-grant panel names the person it is letting in", () => {
  it("resolves the account ids to a name AND the email the grant will use", async () => {
    asked = []
    const names = await resolveNames(env(), request(), [call(GRANT)])
    // The email is the POINT — a name alone would read reassuringly while hiding
    // the field that actually decides who receives the login.
    expect(names[PERSON]).toBe("Marta Ruiz (marta@bergman.example)")
    // A company row with no email is named, not padded with empty brackets.
    expect(names[COMPANY]).toBe("Bergman S.A.")
  })

  it("so the panel reads as a sentence, not two ULIDs", async () => {
    const shown = await panel(GRANT)
    expect(shown.summary).toBe("Give Marta Ruiz (marta@bergman.example) a login on Bergman S.A.")
    // The claim, said the way an approver would experience it: the raw ids must
    // not be what they are asked to judge.
    expect(shown.summary, "the person must not be a bare id").not.toContain(PERSON)
    expect(shown.summary, "nor the company").not.toContain(COMPANY)
  })

  it("and the address is what an approver can actually check", async () => {
    const shown = await panel(GRANT)
    expect(`${shown.summary} ${shown.details.join(" ")}`).toContain("marta@bergman.example")
  })

  it("an id it cannot resolve stays an id — it never invents a name", async () => {
    // Fail HONEST. A panel that guessed would be worse than one that admits it
    // does not know: the whole value here is that the human can check.
    const shown = await panel({ accountId: COMPANY, personAccountId: "01JGHOST" })
    expect(shown.summary).toBe("Give account 01JGHOST a login on Bergman S.A.")
  })

  it("a lookup that fails outright never breaks the turn", async () => {
    const dead = { TENANCY: { fetch: async () => { throw new Error("down") } } } as never
    expect(await resolveNames(dead, request(), [call(GRANT)])).toEqual({})
    expect(pendingCall(getTool("grant_portal_access")!, GRANT, {}).summary).toBe(
      `Give account ${PERSON} a login on account ${COMPANY}`
    )
  })

  it("R14 — one turn's lookups are bounded, and deduplicated", async () => {
    asked = []
    // The same two accounts named by twenty calls must cost two reads, not forty.
    await resolveNames(env(), request(), Array.from({ length: 20 }, () => call(GRANT)))
    expect(asked.sort()).toEqual([COMPANY, PERSON])

    asked = []
    const many = Array.from({ length: 40 }, (_, i) => call({ personAccountId: `01J${i}` }))
    await resolveNames(env(), request(), many)
    expect(asked.length, "a confirm turn must not fan out into an unbounded read").toBeLessThanOrEqual(12)
  })
})

describe("the catalog half — the summary is written to use the names", () => {
  it("grant_portal_access threads `names` through both ends", () => {
    // Read from the tool's OWN summarize rather than the panel, so a catalog edit
    // that drops the second argument is caught even if resolveNames still works.
    const tool = sharedByName("grant_portal_access")!
    const withNames = tool.agent.summarize(GRANT, { [PERSON]: "A Person", [COMPANY]: "A Company" })
    expect(withNames).toBe("Give A Person a login on A Company")
  })
})
