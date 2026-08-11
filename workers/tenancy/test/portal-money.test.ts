// NO PERMUTATION OF FLAGS PUTS A MARGIN IN FRONT OF A CLIENT.
//
// SCOPE's ruling has no exceptions clause: internal rates and margin never render
// in the portal, under any flag, ever — "not behind a permission, not behind a
// feature toggle, not for an admin viewing the portal". R23 proves the STRUCTURE
// (nothing a client can reach imports the file the figures live in). This suite
// proves the BEHAVIOUR, by driving the shipped worker with every combination of
// the two switches that could plausibly be argued to open the door:
//
//   • the per-account PRICE VISIBILITY flag (`commercials_visible`), on and off;
//   • the caller's ROLE, including the worst case nobody should ever build — a
//     client login whose role holds every right on `commercials`.
//
// The worst case is the point. A permission is the thing an owner can grant by
// accident, and the whole claim being tested is that granting it changes nothing.
//
// And the other half, which a refusal-only suite would miss: with the price flag
// ON, the client SHOULD see what they bought. A door that refuses everything is
// not secure, it is broken — so the value read is checked for what it does show
// as carefully as for what it does not.

import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

const db = () => holder.db as DatabaseSync

async function call(request: Request, userId: string): Promise<{ status: number; text: string }> {
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, userId))
  return { status: res.status, text: await res.text() }
}

/** The worst case: give the CLIENT role every right on the money module. Nobody
 * should build this; the claim is that building it changes nothing. */
function grantCommercialsToClients(): void {
  db().exec(
    `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
     VALUES ('P_CLIENT_MONEY', '${IDS.clientRole}', 'commercials', 1, 1, 1, 1),
            ('P_ADMIN_MONEY', '${IDS.adminRole}', 'commercials', 1, 1, 1, 1);`
  )
}

/** Price visibility on the victim's company — the per-account switch. */
function setPriceVisibility(on: boolean): void {
  db().prepare("UPDATE accounts SET commercials_visible = ? WHERE id = ?").run(on ? 1 : 0, IDS.victimAccount)
}

/** What the agency's own books look like when there is something to leak. */
function seedMoney(): void {
  db().exec(
    `INSERT INTO account_rates (id, account_id, label, cents_per_hour, currency, created_at, creator_id, creator_name)
       VALUES ('AR1', '${IDS.victimAccount}', 'Development', 12000, 'EUR', '2026-02-01', '${IDS.staffUser}', 'Staff');
     INSERT INTO internal_rates (id, label, cents_per_hour, currency, is_default, created_at, creator_id, creator_name)
       VALUES ('IR1', 'Development', 4500, 'EUR', 1, '2026-02-01', '${IDS.staffUser}', 'Staff');`
  )
}

/** Every number that must never reach a client, as it would appear on the wire. */
const INTERNAL_FIGURES = ["4500", "marginCents", "internalRates", "timeCostCents", "toolCost"]

beforeEach(() => {
  holder.db = buildSpineDb()
  seedMoney()
})

describe("the money doors refuse a client login — with every right, with the flag on", () => {
  for (const flag of [false, true]) {
    it(`margin: refused (price visibility ${flag ? "on" : "off"}, client holds commercials:read)`, async () => {
      grantCommercialsToClients()
      setPriceVisibility(flag)
      const { status, text } = await call(
        req("GET /api/tenancy/margin", undefined, `?accountId=${IDS.victimAccount}`),
        IDS.victimUser
      )
      expect(status, "a client login must be refused at the margin door").toBeGreaterThanOrEqual(400)
      for (const figure of INTERNAL_FIGURES) expect(text).not.toContain(figure)
    })

    it(`internal rates: refused (price visibility ${flag ? "on" : "off"}, client holds commercials:read)`, async () => {
      grantCommercialsToClients()
      setPriceVisibility(flag)
      const { status, text } = await call(req("GET /api/tenancy/internal-rates"), IDS.victimUser)
      expect(status).toBeGreaterThanOrEqual(400)
      expect(text).not.toContain("4500")
    })

    it(`the rate-card door itself: refused (price visibility ${flag ? "on" : "off"})`, async () => {
      grantCommercialsToClients()
      setPriceVisibility(flag)
      // Even the CLIENT-FACING card is refused at its own door: it answers with
      // the audit block, the retired lines and any account's card. What a client
      // may see of it is a projection on the value read, below.
      const { status } = await call(
        req("GET /api/tenancy/rates", undefined, `?accountId=${IDS.victimAccount}`),
        IDS.victimUser
      )
      expect(status).toBeGreaterThanOrEqual(400)
    })
  }

  it("and every WRITE too — a client with commercials:create cannot set a rate", async () => {
    grantCommercialsToClients()
    for (const [route, body] of [
      ["POST /api/tenancy/rates", { accountId: IDS.victimAccount, label: "Mine", centsPerHour: 1 }],
      ["POST /api/tenancy/internal-rates", { label: "Mine", centsPerHour: 1 }],
    ] as const) {
      const { status } = await call(req(route, body), IDS.victimUser)
      expect(status, `${route} must refuse a client login`).toBeGreaterThanOrEqual(400)
    }
    const rates = db().prepare("SELECT COUNT(*) AS n FROM account_rates").get() as { n: number }
    const internal = db().prepare("SELECT COUNT(*) AS n FROM internal_rates").get() as { n: number }
    expect(rates.n).toBe(1)
    expect(internal.n).toBe(1)
  })
})

describe("the value read: what a client sees, and what they never do", () => {
  it("with price visibility OFF, the prices key is ABSENT — not empty, not hidden", async () => {
    setPriceVisibility(false)
    const { status, text } = await call(req("GET /api/tenancy/value"), IDS.victimUser)
    expect(status).toBe(200)
    const body = JSON.parse(text) as Record<string, unknown>
    // Absent, so no screen can render it and no flag on the client side decides.
    expect("prices" in body).toBe(false)
    expect(text).not.toContain("12000")
  })

  it("with price visibility ON, they see what they bought — and still no margin", async () => {
    setPriceVisibility(true)
    const { status, text } = await call(req("GET /api/tenancy/value"), IDS.victimUser)
    expect(status).toBe(200)
    const body = JSON.parse(text) as { prices?: { rates: { label: string; centsPerHour: number }[] } }
    expect(body.prices?.rates).toEqual([{ label: "Development", centsPerHour: 12000, currency: "EUR" }])
    // The one number on the same subject that must never travel with it.
    for (const figure of INTERNAL_FIGURES) expect(text).not.toContain(figure)
  })

  it("even with commercials:read AND the flag on, the value read carries no internal figure", async () => {
    grantCommercialsToClients()
    setPriceVisibility(true)
    const { text } = await call(req("GET /api/tenancy/value"), IDS.victimUser)
    for (const figure of INTERNAL_FIGURES) expect(text).not.toContain(figure)
  })

  // The anti-blindness half: staff DO get the internal figures, or every
  // assertion above passes on a worker where the money simply does not work.
  it("staff still read the margin and the internal card (or the refusals prove nothing)", async () => {
    grantCommercialsToClients()
    const margin = await call(
      req("GET /api/tenancy/margin", undefined, `?accountId=${IDS.victimAccount}`),
      IDS.staffUser
    )
    expect(margin.status).toBe(200)
    expect(margin.text).toContain("marginCents")
    const internal = await call(req("GET /api/tenancy/internal-rates"), IDS.staffUser)
    expect(internal.status).toBe(200)
    expect(internal.text).toContain("4500")
  })

  // WHAT AN APP COSTS US is on a row a client CAN read, which is why it is
  // withheld on the row rather than at the call site.
  it("the app list a client reads carries no tool cost", async () => {
    const { status, text } = await call(req("GET /api/tenancy/apps"), IDS.victimUser)
    expect(status).toBe(200)
    expect(text).toContain(IDS.victimApp) // they see their own system…
    expect(text).toContain('"toolCostCentsPerMonth":null') // …and not what it costs us
    expect(text).not.toContain("42000")

    const staff = await call(req("GET /api/tenancy/apps"), IDS.staffUser)
    expect(staff.text).toContain("42000")
  })
})
