// THE LEAK TESTS — "leak tests are law" (SCOPE ch.06, "Access and the fence").
//
// A permission matrix answers "may this ROLE do this?". It cannot answer "may
// this person do it to THAT customer's rows?" — and that second question is the
// one a client portal lives or dies by. So this suite hires a burglar: a caller
// with EVERY right on the spine, pinned to one account, who walks down the
// worker's own route table and tries every handle for another account's rows.
//
// Three things make it hold up over time rather than rot into decoration:
//
//   1. THE ROUTE TABLE IS READ, NOT RETYPED. The account-scoped routes are
//      derived from the worker's ROUTES map plus the module each handler gates
//      on, read off disk. A route added tomorrow is in the derived set the
//      moment it ships.
//   2. COVERAGE FAILS THE BUILD. A derived route with no burglar attacking it,
//      or an account-scoped MODULE nobody tries the handle of, is a red build —
//      not a quiet gap. That is the difference between a test suite and a claim.
//   3. THE POSITIVE CONTROL. Every attack is paired with the same door answering
//      a STAFF caller, who must see exactly what the burglar could not. A fence
//      that refuses everybody is not a fence, it is a broken door — and it would
//      pass a refusal-only suite perfectly.
//
// The single assertion every attack reduces to: the burglar's response must not
// contain ANY id from the victim's world, and the victim's rows must be byte-for
// -byte what they were. Not "a 403" — a 200 with the name in it leaks just as
// hard as a successful write.

import { readFileSync, readdirSync } from "node:fs"
import type { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { ACCOUNT_SCOPED_MODULES } from "../../../shared/rules/registry"
import worker, { ROUTES } from "../src/index"
import { buildSpineDb, IDS, makeEnv, req, VICTIM_IDS } from "./spine-harness"

const SRC = join(__dirname, "..", "src")

// ── which routes are account-scoped (DERIVED, never hand-listed) ─────────────

/** Every `export async function NAME` body in a dir, keyed by name. */
function indexFunctions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const code = readFileSync(join(dir, file), "utf8")
    const starts = [...code.matchAll(/export\s+async\s+function\s+(\w+)/g)]
    starts.forEach((m, i) => out.set(m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length)))
  }
  return out
}

const routeFns = indexFunctions(join(SRC, "routes"))

/** The module a handler gates on, read out of its own opening line — the same
 * source the gating seam reads, so the two can't disagree about what a door is. */
function gatedModule(handlerName: string): string | null {
  const body = routeFns.get(handlerName)
  if (!body) return null
  const m = /(?<![A-Za-z0-9_$.])gated(?:Body)?\s*(?:<[\s\S]*?>)?\s*\(\s*request\s*,\s*env\s*,\s*"([a-z_]+)"/.exec(body)
  return m ? m[1] : null
}

const SCOPED = new Set<string>(ACCOUNT_SCOPED_MODULES)
/** route → the account-scoped module it sits on. */
const SCOPED_ROUTES = new Map<string, string>()
for (const [route, def] of Object.entries(ROUTES)) {
  const module = gatedModule(def.handler.name)
  if (module && SCOPED.has(module)) SCOPED_ROUTES.set(route, module)
}

// ── the burglary ─────────────────────────────────────────────────────────────

/** One attempt on one door. `attack` builds the request that reaches for the
 * VICTIM's rows; `honest` builds the same request a staff caller would send, and
 * must come back showing them (the anti-blindness half). */
type Burglary = {
  route: string
  /** what the burglar is trying to get away with, in one line */
  why: string
  attack: () => Request
  honest: () => Request
  /** a read may legitimately answer 200-with-nothing; a write must be refused */
  expect: "refused" | "nothing"
}

const BURGLARIES: Burglary[] = [
  {
    route: "GET /api/tenancy/accounts",
    why: "list every account in the team and read the victim's off the page",
    attack: () => req("GET /api/tenancy/accounts"),
    honest: () => req("GET /api/tenancy/accounts"),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/accounts",
    why: "name the victim in a search term and see whether the door confirms them",
    attack: () => req("GET /api/tenancy/accounts", undefined, "?q=Bergman"),
    honest: () => req("GET /api/tenancy/accounts", undefined, "?q=Bergman"),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/accounts",
    why: "ask for the victim's children directly by parent id",
    attack: () => req("GET /api/tenancy/accounts", undefined, `?parentId=${IDS.victimAccount}`),
    honest: () => req("GET /api/tenancy/accounts", undefined, `?parentId=${IDS.victimAccount}`),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/accounts/detail",
    why: "open the victim's record by id",
    attack: () => req("GET /api/tenancy/accounts/detail", undefined, `?id=${IDS.victimAccount}`),
    honest: () => req("GET /api/tenancy/accounts/detail", undefined, `?id=${IDS.victimAccount}`),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts",
    why: "hang a new row under the victim, then read the victim through it",
    attack: () =>
      req("POST /api/tenancy/accounts", {
        accountType: "individual",
        name: "Mole",
        parentAccountId: IDS.victimAccount,
      }),
    honest: () =>
      req("POST /api/tenancy/accounts", {
        accountType: "individual",
        name: "New contact",
        parentAccountId: IDS.victimAccount,
      }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/update",
    why: "rewrite the victim's own record",
    attack: () => req("POST /api/tenancy/accounts/update", { id: IDS.victimAccount, name: "Owned" }),
    honest: () => req("POST /api/tenancy/accounts/update", { id: IDS.victimAccount, name: "Bergman S.A." }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/parent",
    why: "re-parent the victim under the burglar's own account, inheriting their whole tree",
    attack: () =>
      req("POST /api/tenancy/accounts/parent", {
        id: IDS.victimAccount,
        parentAccountId: IDS.burglarAccount,
      }),
    honest: () => req("POST /api/tenancy/accounts/parent", { id: IDS.victimChild, parentAccountId: null }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/parent",
    why: "the mirror image — pull the victim's account UNDER the burglar by moving their own row",
    attack: () =>
      req("POST /api/tenancy/accounts/parent", {
        id: IDS.burglarAccount,
        parentAccountId: IDS.victimAccount,
      }),
    honest: () => req("POST /api/tenancy/accounts/parent", { id: IDS.victimChild, parentAccountId: null }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/active",
    why: "archive the victim's account out from under them",
    attack: () => req("POST /api/tenancy/accounts/active", { id: IDS.victimAccount, active: false }),
    honest: () => req("POST /api/tenancy/accounts/active", { id: IDS.victimAccount, active: false }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/links",
    why: "staple the burglar onto the victim's company as a contact",
    attack: () =>
      req("POST /api/tenancy/accounts/links", {
        accountId: IDS.victimAccount,
        personAccountId: IDS.burglarPerson,
      }),
    honest: () =>
      req("POST /api/tenancy/accounts/links", {
        accountId: IDS.victimAccount,
        personAccountId: IDS.burglarPerson,
      }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/links",
    why: "the other direction — drag the victim's person onto the burglar's own company",
    attack: () =>
      req("POST /api/tenancy/accounts/links", {
        accountId: IDS.burglarAccount,
        personAccountId: IDS.victimPerson,
      }),
    honest: () =>
      req("POST /api/tenancy/accounts/links", {
        accountId: IDS.burglarAccount,
        personAccountId: IDS.victimPerson,
      }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/accounts/links/active",
    why: "cut the victim's own contact off their company",
    attack: () => req("POST /api/tenancy/accounts/links/active", { id: IDS.victimLink, active: false }),
    honest: () => req("POST /api/tenancy/accounts/links/active", { id: IDS.victimLink, active: false }),
    expect: "refused",
  },
  {
    route: "GET /api/tenancy/portal-users",
    why: "list every login in the team and learn who the victim's people are",
    attack: () => req("GET /api/tenancy/portal-users"),
    honest: () => req("GET /api/tenancy/portal-users"),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/portal-users",
    why: "ask for the victim's logins by account id",
    attack: () => req("GET /api/tenancy/portal-users", undefined, `?accountId=${IDS.victimPerson}`),
    honest: () => req("GET /api/tenancy/portal-users", undefined, `?accountId=${IDS.victimPerson}`),
    expect: "nothing",
  },
  {
    route: "POST /api/tenancy/portal-users",
    why: "grant themselves a second login, on the victim's account",
    attack: () =>
      req("POST /api/tenancy/portal-users", { accountId: IDS.victimAccount, personAccountId: IDS.clientPerson }),
    honest: () =>
      req("POST /api/tenancy/portal-users", { accountId: IDS.victimAccount, personAccountId: IDS.clientPerson }),
    expect: "refused",
  },
  {
    // THE DOOR THE FIRST SWEEP FOUND. It is not an account route, so the derived
    // set never included it — the whole reason this suite now attacks by "what a
    // client can reach" rather than by "what the accounts module owns".
    route: "GET /api/tenancy/activity",
    why: "read the victim account's whole history by naming its id",
    attack: () =>
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=accounts&id=${IDS.victimAccount}`),
    honest: () =>
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=accounts&id=${IDS.victimAccount}`),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/activity",
    why: "take the whole team's feed, which names every client's records",
    attack: () => req("GET /api/tenancy/activity", undefined, "?scope=team"),
    honest: () => req("GET /api/tenancy/activity", undefined, "?scope=team"),
    expect: "nothing",
  },
  {
    route: "POST /api/tenancy/portal-users/active",
    why: "revoke the victim's login — sabotage needs no read to hurt",
    attack: () => req("POST /api/tenancy/portal-users/active", { id: IDS.victimPortal, active: false }),
    honest: () => req("POST /api/tenancy/portal-users/active", { id: IDS.victimPortal, active: false }),
    expect: "refused",
  },
]

// ── running them ─────────────────────────────────────────────────────────────

/** Every spine row, verbatim — the "did anything move?" witness. */
function snapshot(db: DatabaseSync): string {
  return JSON.stringify([
    db.prepare("SELECT * FROM accounts ORDER BY id").all(),
    db.prepare("SELECT * FROM account_links ORDER BY id").all(),
    db.prepare("SELECT * FROM portal_users ORDER BY id").all(),
  ])
}

async function call(request: Request, userId: string): Promise<{ status: number; text: string }> {
  const res = await worker.fetch(request, makeEnv(() => holder.db as DatabaseSync, userId))
  return { status: res.status, text: await res.text() }
}

beforeEach(() => {
  holder.db = buildSpineDb()
})

describe("account leak tests: a caller pinned to one account cannot reach another's", () => {
  it.each(BURGLARIES.map((b) => [`${b.route} — ${b.why}`, b] as const))("%s", async (_name, burglary) => {
    const before = snapshot(holder.db as DatabaseSync)
    const { status, text } = await call(burglary.attack(), IDS.burglarUser)

    // (i) NOTHING OF THE VICTIM'S CAME BACK. A 200 that names them leaks exactly
    // as much as a successful write — so the ids, not the status, are the test.
    for (const id of VICTIM_IDS)
      expect(
        text.includes(id),
        `LEAK — ${burglary.route} handed a pinned caller the victim's ${id}: ${text.slice(0, 300)}`
      ).toBe(false)
    expect(text).not.toContain("Bergman")

    // (ii) NOTHING OF THE VICTIM'S MOVED.
    expect(
      snapshot(holder.db as DatabaseSync),
      `LEAK — ${burglary.route} let a pinned caller change another account's rows`
    ).toBe(before)

    // (iii) A write must be REFUSED outright. "200, changed nothing" would be a
    // door that merely happens to be broken today.
    if (burglary.expect === "refused")
      expect(status, `${burglary.route} must refuse, not quietly do nothing`).toBeGreaterThanOrEqual(400)
  })

  // THE ANTI-BLINDNESS HALF. Every door above must actually WORK for someone with
  // no pin — otherwise the whole suite passes on a broken worker.
  it.each(BURGLARIES.map((b) => [`${b.route} — ${b.why}`, b] as const))(
    "positive control: staff still get through — %s",
    async (_name, burglary) => {
      const { status, text } = await call(burglary.honest(), IDS.staffUser)
      expect(status, `staff were refused at ${burglary.route}: ${text.slice(0, 200)}`).toBeLessThan(400)
    }
  )

  it("staff see the victim's world that the burglar could not", async () => {
    const list = await call(req("GET /api/tenancy/accounts"), IDS.staffUser)
    expect(list.text).toContain(IDS.victimAccount)
    const detail = await call(
      req("GET /api/tenancy/accounts/detail", undefined, `?id=${IDS.victimAccount}`),
      IDS.staffUser
    )
    expect(detail.status).toBe(200)
    expect(detail.text).toContain(IDS.victimPerson) // the contact link resolves
  })

  it("a pinned caller still sees their OWN world (the fence is a fence, not a wall)", async () => {
    const list = await call(req("GET /api/tenancy/accounts"), IDS.burglarUser)
    expect(list.status).toBe(200)
    expect(list.text).toContain(IDS.burglarAccount)
    expect(list.text).toContain(IDS.burglarPerson)
  })

  it("the fence reaches DOWN the tree: the victim's own person sees their subsidiary", async () => {
    // Marta is linked to Bergman; Bergman Workshop is nested under it. Her set is
    // her own row + Bergman + everything below Bergman.
    const list = await call(req("GET /api/tenancy/accounts"), IDS.victimUser)
    expect(list.text).toContain(IDS.victimAccount)
    expect(list.text).toContain(IDS.victimChild)
    expect(list.text).not.toContain(IDS.burglarAccount)
  })

  it("a REVOKED login pins to nothing — it never falls back to staff", async () => {
    // The failure this exists to catch: deciding portal-ness by the ABSENCE of a
    // row. Revoke the burglar's grant and the naive version promotes them to
    // staff, handing a fired contractor the whole customer list.
    holder.db?.exec(`UPDATE portal_users SET deactivated_at = '2026-02-01' WHERE id = '${IDS.burglarPortal}'`)
    const list = await call(req("GET /api/tenancy/accounts"), IDS.burglarUser)
    expect(list.status).toBe(200)
    for (const id of [...VICTIM_IDS, IDS.burglarAccount])
      expect(list.text.includes(id), `a revoked login still reached ${id}`).toBe(false)
  })
})

describe("leak-test coverage: every account-scoped door has a burglar on it", () => {
  it("the derivation is alive (a blind scan reports 'all clear' exactly like a passing one)", () => {
    expect(routeFns.size, "the handler scan found nothing — it has gone blind").toBeGreaterThan(10)
    expect(
      SCOPED_ROUTES.size,
      "no route was derived as account-scoped — the module scan has gone blind"
    ).toBeGreaterThan(5)
    expect(BURGLARIES.length).toBeGreaterThan(SCOPED_ROUTES.size - 1)
  })

  it("every account-scoped ROUTE is attacked", () => {
    const attacked = new Set(BURGLARIES.map((b) => b.route))
    const unattacked = [...SCOPED_ROUTES.keys()].filter((r) => !attacked.has(r))
    expect(
      unattacked,
      `these doors reach customer rows with nobody trying the handle — add a burglary to BURGLARIES: ${unattacked.join(", ")}`
    ).toEqual([])
  })

  it("every account-scoped MODULE is attacked", () => {
    const covered = new Set([...BURGLARIES].map((b) => SCOPED_ROUTES.get(b.route)))
    const naked = ACCOUNT_SCOPED_MODULES.filter((m) => !covered.has(m))
    expect(
      naked,
      `module(s) with no burglar trying any handle: ${naked.join(", ")} — every account-scoped module earns at least one attack`
    ).toEqual([])
  })

  it("every burglary names a route that still exists", () => {
    for (const b of BURGLARIES)
      expect(ROUTES[b.route], `BURGLARIES attacks ${b.route}, which is not a route`).toBeDefined()
  })

  // The structural half: the fence can only ride a query that was HANDED the
  // stamp. One file owns every statement against the spine's tables, and every
  // door into it takes the scope — so "was this query fenced?" has one place to
  // look, and a new reader that forgets is a compile error, not a leak.
  it("every exported reader/writer of the spine takes the caller's scope", () => {
    const lib = readFileSync(join(SRC, "lib", "accounts.ts"), "utf8")
    const fns = [...lib.matchAll(/export async function (\w+)\(([\s\S]*?)\)\s*:/g)]
    expect(fns.length, "the lib scan found no exported functions — it has gone blind").toBeGreaterThan(8)
    for (const [, name, args] of fns)
      expect(
        /scope: AccountScope/.test(args),
        `lib/accounts.ts ${name}() touches customer rows without taking the caller's account scope`
      ).toBe(true)

    // …and nothing ELSE in the worker writes SQL against those tables behind its back.
    const offenders: string[] = []
    for (const dir of ["lib", "routes"]) {
      for (const file of readdirSync(join(SRC, dir)).filter((f) => f.endsWith(".ts"))) {
        if (file === "accounts.ts") continue
        const code = readFileSync(join(SRC, dir, file), "utf8")
        if (/(FROM|INTO|UPDATE)\s+(accounts|account_links|portal_users)\b/.test(code))
          offenders.push(`${dir}/${file}`)
      }
    }
    expect(
      offenders,
      `spine SQL outside the one fenced file (lib/accounts.ts): ${offenders.join(", ")}`
    ).toEqual([])
  })
})
