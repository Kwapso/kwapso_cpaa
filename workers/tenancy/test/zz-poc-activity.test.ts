import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

async function call(request: Request, userId: string) {
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, userId))
  return { status: res.status, text: await res.text() }
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("POC: activity record scope vs the account fence", () => {
  it("burglar reads the victim account's full history", async () => {
    // STAFF do ordinary work on the victim's account -> activity rows exist.
    const edit = await call(
      req("POST /api/tenancy/accounts/update", {
        id: IDS.victimAccount,
        name: "Bergman S.A.",
        email: "cfo@bergman.example",
        phone: "+34 600 111 222",
        status: "Churn risk",
      }),
      IDS.staffUser
    )
    expect(edit.status).toBe(200)

    // Control: the burglar cannot open the victim's record the front way.
    const detail = await call(
      req("GET /api/tenancy/accounts/detail", undefined, `?id=${IDS.victimAccount}`),
      IDS.burglarUser
    )
    console.log("DETAIL (front door):", detail.status, detail.text.slice(0, 200))

    // THE ATTACK: same account id, through the activity record scope.
    const attack = await call(
      req(
        "GET /api/tenancy/activity",
        undefined,
        `?scope=record&table=accounts&id=${IDS.victimAccount}`
      ),
      IDS.burglarUser
    )
    console.log("ACTIVITY (record scope):", attack.status, attack.text)

    // Staff link a NEW contact onto the victim + grant a login -> more rows.
    // A brand-new contact person for the victim's company.
    const person = await call(
      req("POST /api/tenancy/accounts", { accountType: "individual", name: "Nadia Ortiz" }),
      IDS.staffUser
    )
    const personId = JSON.parse(person.text).id
    const link = await call(
      req("POST /api/tenancy/accounts/links", {
        accountId: IDS.victimAccount,
        personAccountId: personId,
        relationship: "Board member",
      }),
      IDS.staffUser
    )
    console.log("LINK WRITE:", link.status, link.text)
    const linkId = JSON.parse(link.text).id

    // Revoke the victim's existing login -> a portal_users activity row on it.
    const revoke = await call(
      req("POST /api/tenancy/portal-users/active", { id: IDS.victimPortal, active: false }),
      IDS.staffUser
    )
    console.log("REVOKE WRITE:", revoke.status, revoke.text)
    const grantId = IDS.victimPortal

    for (const [table, id] of [
      ["account_links", linkId],
      ["portal_users", grantId],
    ] as const) {
      const r = await call(
        req("GET /api/tenancy/activity", undefined, `?scope=record&table=${table}&id=${id}`),
        IDS.burglarUser
      )
      console.log(`ACTIVITY ${table}:`, r.status, r.text)
    }
  })
})
