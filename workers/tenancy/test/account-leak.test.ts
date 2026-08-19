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

import { readFileSync } from "node:fs"
import type { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import {
  ACTIVITY_GATE_MAP,
  ACCOUNT_SCOPED_MODULES,
  PORTAL_ACTIVITY_FENCE,
} from "@shared/rules/registry"
import { indexFunctions } from "@shared/rules/seam-scan"
import { sourceFiles } from "@shared/rules/source-scan"
import { ACCOUNT_OWNED_TABLES, accountScope } from "@shared/workers/account-scope"
import { createAccount, grantPortalAccess, linkPerson } from "../src/lib/accounts"
import { FIXED_SCOPE_TABLES } from "../src/lib/activity-read"
import worker, { ROUTES } from "../src/index"
import { buildSpineDb, IDS, makeEnv, req, VICTIM_IDS } from "./spine-harness"

const SRC = join(__dirname, "..", "src")

// ── which routes are account-scoped (DERIVED, never hand-listed) ─────────────

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
    route: "GET /api/tenancy/accounts/export",
    why: "skip the paged list entirely and download the whole book as one CSV",
    attack: () => req("GET /api/tenancy/accounts/export"),
    honest: () => req("GET /api/tenancy/accounts/export"),
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
    // THE DOOR THE SECOND SWEEP FOUND — the same door, one TABLE along. The
    // record scope was fenced only for the tables the ACCOUNTS module owns, and
    // a support ticket belongs to none of them, so naming a ticket id read back
    // another client's support history: the sentences, the staff who answered,
    // and the before/after of the problem statement. The burglar holds help:read
    // (every client login must, to see their own tickets) — so the module gate
    // waves them through and only the fence stands there.
    route: "GET /api/tenancy/activity",
    why: "read another client's SUPPORT history by naming their ticket id",
    attack: () =>
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=help&id=${IDS.victimTicket}`),
    honest: () =>
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=help&id=${IDS.victimTicket}`),
    expect: "nothing",
  },
  {
    route: "POST /api/tenancy/portal-users/active",
    why: "revoke the victim's login — sabotage needs no read to hurt",
    attack: () => req("POST /api/tenancy/portal-users/active", { id: IDS.victimPortal, active: false }),
    honest: () => req("POST /api/tenancy/portal-users/active", { id: IDS.victimPortal, active: false }),
    expect: "refused",
  },

  // ── THE PROCESS MAP ────────────────────────────────────────────────────────
  //
  // Sixteen doors, and they are worth stealing for two different reasons. The
  // READS name how another company's people work, step by step, with the times
  // they agreed and the conversation they had about it — a competitor's
  // operations manual, in other words. The WRITES are worse: every savings figure
  // in the app is a subtraction from a baseline, so an attacker who can edit
  // somebody's version 1 can make their agency look like it saved them a hundred
  // hours a month, or none.
  //
  // The burglar holds every right on `processes` (the harness grants it), exactly
  // as they hold every right on the spine — their ROLE is not what stops them
  // here, and if they get through, the fence is broken.
  {
    route: "GET /api/tenancy/apps",
    why: "list every system in the team and read the victim's off the page",
    attack: () => req("GET /api/tenancy/apps"),
    honest: () => req("GET /api/tenancy/apps"),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/apps",
    why: "ask for the victim's systems directly by account id",
    attack: () => req("GET /api/tenancy/apps", undefined, `?accountId=${IDS.victimAccount}`),
    honest: () => req("GET /api/tenancy/apps", undefined, `?accountId=${IDS.victimAccount}`),
    expect: "nothing",
  },
  {
    route: "POST /api/tenancy/apps",
    why: "hang a system on the victim's account, then read their world through it",
    attack: () => req("POST /api/tenancy/apps", { name: "Mole", accountId: IDS.victimAccount }),
    honest: () => req("POST /api/tenancy/apps", { name: "New system", accountId: IDS.victimAccount }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/apps/update",
    why: "rewrite the victim's system — its name, its address, what it costs to run",
    attack: () => req("POST /api/tenancy/apps/update", { id: IDS.victimApp, name: "Owned" }),
    honest: () => req("POST /api/tenancy/apps/update", { id: IDS.victimApp, name: "Bergman dispatch" }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/apps/active",
    why: "archive the victim's system, taking its whole map out of their value figure",
    attack: () => req("POST /api/tenancy/apps/active", { id: IDS.victimApp, active: false }),
    honest: () => req("POST /api/tenancy/apps/active", { id: IDS.victimApp, active: false }),
    expect: "refused",
  },
  {
    route: "GET /api/tenancy/processes",
    why: "list every map in the team — how every other client works, in one page",
    attack: () => req("GET /api/tenancy/processes"),
    honest: () => req("GET /api/tenancy/processes"),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/processes",
    why: "narrow to the victim's app and read its maps by name",
    attack: () => req("GET /api/tenancy/processes", undefined, `?appId=${IDS.victimApp}`),
    honest: () => req("GET /api/tenancy/processes", undefined, `?appId=${IDS.victimApp}`),
    expect: "nothing",
  },
  {
    route: "GET /api/tenancy/processes/detail",
    why: "open another client's map by id — its steps, its times, its versions",
    attack: () => req("GET /api/tenancy/processes/detail", undefined, `?id=${IDS.victimProcess}`),
    honest: () => req("GET /api/tenancy/processes/detail", undefined, `?id=${IDS.victimProcess}`),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes",
    why: "map a process onto the victim's app, then read the app through it",
    attack: () => req("POST /api/tenancy/processes", { appId: IDS.victimApp, name: "Mole" }),
    honest: () => req("POST /api/tenancy/processes", { appId: IDS.victimApp, name: "Another way of working" }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/update",
    why: "rewrite the victim's map",
    attack: () => req("POST /api/tenancy/processes/update", { id: IDS.victimProcess, name: "Owned" }),
    honest: () =>
      req("POST /api/tenancy/processes/update", { id: IDS.victimProcess, name: "Bergman invoice approval" }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/active",
    why: "archive the victim's map so their savings quietly drop",
    attack: () => req("POST /api/tenancy/processes/active", { id: IDS.victimProcess, active: false }),
    honest: () => req("POST /api/tenancy/processes/active", { id: IDS.victimProcess, active: false }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/steps",
    why: "add a step to another client's map",
    attack: () =>
      req("POST /api/tenancy/processes/steps", {
        processId: IDS.victimProcess,
        name: "Mole",
        secondsPerRun: 60,
        runsPerMonth: 1,
      }),
    honest: () =>
      req("POST /api/tenancy/processes/steps", {
        processId: IDS.victimProcess,
        name: "File the paperwork",
        secondsPerRun: 60,
        runsPerMonth: 1,
      }),
    expect: "refused",
  },
  {
    // THE ONE THAT MOVES A NUMBER. Editing somebody's baseline step is editing
    // the figure their agency quotes them — up or down, at the attacker's choice.
    route: "POST /api/tenancy/processes/steps/update",
    why: "dial the victim's baseline, and with it every savings figure computed from it",
    attack: () =>
      req("POST /api/tenancy/processes/steps/update", {
        id: IDS.victimStep,
        name: "Owned",
        secondsPerRun: 86_000,
        runsPerMonth: 9_999,
      }),
    honest: () =>
      req("POST /api/tenancy/processes/steps/update", {
        id: IDS.victimStep,
        name: "Check it against the order",
        secondsPerRun: 2400,
        runsPerMonth: 20,
      }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/steps/remove",
    why: "record that the victim's step stopped happening, inventing a saving nobody made",
    attack: () => req("POST /api/tenancy/processes/steps/remove", { id: IDS.victimStep }),
    honest: () => req("POST /api/tenancy/processes/steps/remove", { id: IDS.victimStep }),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/versions",
    why: "cut a version on another client's map, freezing a baseline they never agreed",
    attack: () => req("POST /api/tenancy/processes/versions", { processId: IDS.victimProcess }),
    honest: () => req("POST /api/tenancy/processes/versions", { processId: IDS.victimProcess }),
    expect: "refused",
  },
  {
    route: "GET /api/tenancy/processes/comments",
    why: "read the conversation another client had with us about their own work",
    attack: () =>
      req("GET /api/tenancy/processes/comments", undefined, `?processId=${IDS.victimProcess}`),
    honest: () =>
      req("GET /api/tenancy/processes/comments", undefined, `?processId=${IDS.victimProcess}`),
    expect: "refused",
  },
  {
    route: "POST /api/tenancy/processes/comments",
    why: "speak into another client's conversation, where their staff will read it as theirs",
    attack: () =>
      req("POST /api/tenancy/processes/comments", { processId: IDS.victimProcess, body: "Mole" }),
    honest: () =>
      req("POST /api/tenancy/processes/comments", { processId: IDS.victimProcess, body: "Noted." }),
    expect: "refused",
  },
  {
    // The door with no id in it at all — which is exactly why it is here. The
    // value read walks every app and every process the CALLER may see, so a fence
    // that had been left off this one statement would hand a burglar the whole
    // estate's maps in a single unauthenticated-looking GET.
    route: "GET /api/tenancy/impact",
    why: "read the savings drill-down, which names every app, map and step in the team",
    attack: () => req("GET /api/tenancy/impact"),
    honest: () => req("GET /api/tenancy/impact"),
    expect: "nothing",
  },
]

// ── running them ─────────────────────────────────────────────────────────────

/** Every account-owned row, verbatim — the "did anything move?" witness.
 *
 * The process-map tables are here for a reason worth stating: a burglar who
 * cannot READ another client's map can still do damage by WRITING one. Every
 * savings figure this app produces is a subtraction from a baseline step, so a
 * single successful UPDATE on somebody else's version 1 rewrites the number
 * their agency quotes them — and a snapshot that watched only the spine would
 * have called that a pass. */
function snapshot(db: DatabaseSync): string {
  return JSON.stringify(
    [
      "accounts",
      "account_links",
      "portal_users",
      "apps",
      "processes",
      "process_versions",
      "process_steps",
      "process_comments",
    ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
  )
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
    // …including the HISTORY of their own company. A fence that answered "0 = 1"
    // to everything would pass every burglary above and be a wall.
    const mine = await call(
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=accounts&id=${IDS.burglarAccount}`),
      IDS.burglarUser
    )
    expect(mine.status).toBe(200)
    expect(JSON.parse(mine.text).total, "a client lost their own account's history").toBe(1)
    expect(mine.text).toContain("Delaval Group")
  })

  it("the fence reaches DOWN the tree: the victim's own person sees their subsidiary", async () => {
    // Marta is linked to Bergman; Bergman Workshop is nested under it. Her set is
    // her own row + Bergman + everything below Bergman.
    const list = await call(req("GET /api/tenancy/accounts"), IDS.victimUser)
    expect(list.text).toContain(IDS.victimAccount)
    expect(list.text).toContain(IDS.victimChild)
    expect(list.text).not.toContain(IDS.burglarAccount)
  })

  // The fixture is the proof. A burglary over an EMPTY table passes with the
  // fence torn out, and that is how the first help attack could have shipped
  // green: assert first that there is really something to steal.
  it("the victim's stealable history exists (the burglary is not over an empty table)", async () => {
    const staff = await call(
      req("GET /api/tenancy/activity", undefined, `?scope=record&table=help&id=${IDS.victimTicket}`),
      IDS.staffUser
    )
    expect(staff.status).toBe(200)
    expect(staff.text, "staff must SEE the ticket history the burglar is denied").toContain("Bergman")
    expect(JSON.parse(staff.text).total, "two rows of real support history").toBe(2)
  })

  // The fixed-table scopes (user / role / invite) are the same (table, id) read
  // with the table named by the scope — and they were the three that never had a
  // fence at all. A client login asking about a STAFF member reads the agency's
  // own history: role moves, joins, removals.
  it("a client login reads NO agency history through the fixed scopes", async () => {
    for (const [scope, id, tell] of [
      ["user", IDS.staffUser, "Nadia Ruiz"],
      ["role", IDS.adminRole, "delete on accounts"],
    ] as const) {
      const r = await call(
        req("GET /api/tenancy/activity", undefined, `?scope=${scope}&id=${id}`),
        IDS.burglarUser
      )
      expect(r.status).toBe(200)
      expect(r.text, `the ${scope} scope handed a client login the agency's history`).not.toContain(tell)
      expect(JSON.parse(r.text).total, `${scope} must total what it shows: nothing`).toBe(0)
      // …and the same read still works for staff, or this proves only that the
      // door is broken.
      const ok = await call(
        req("GET /api/tenancy/activity", undefined, `?scope=${scope}&id=${id}`),
        IDS.staffUser
      )
      expect(JSON.parse(ok.text).total, `staff lost the ${scope} feed`).toBeGreaterThan(0)
      expect(ok.text).toContain(tell)
    }
  })

  // The agency's own context door. A client login is a member of the agency's
  // team — that is how the fence knows them — so identity alone got them the
  // team's name, their role title and the agency's ACTIVE MEMBER COUNT. The
  // portal's gateway refuses to forward this door; the agency origin serves the
  // same person, so the refusal has to be on the door.
  it("the agency's context door refuses a client login (and still answers staff)", async () => {
    for (const r of [
      req("GET /api/tenancy/active"),
      req("POST /api/tenancy/switch-team", { teamId: IDS.team }),
      // One door along, the same shape: the Overview metadata names who created
      // the team, by name and EMAIL ADDRESS.
      req("GET /api/tenancy/team-meta"),
    ]) {
      const attack = await call(r, IDS.burglarUser)
      expect(attack.status, "a client login must not get the agency's own answers").toBe(403)
      expect(attack.text, "and must learn nothing from the refusal").not.toContain("memberCount")
      expect(attack.text).not.toContain("staff@kwapso.app")
    }
    const staff = await call(req("GET /api/tenancy/active"), IDS.staffUser)
    expect(staff.status, `staff lost their own context door: ${staff.text.slice(0, 200)}`).toBe(200)
    expect(JSON.parse(staff.text).memberCount, "staff still see the headcount").toBeGreaterThan(0)
    const meta = await call(req("GET /api/tenancy/team-meta"), IDS.staffUser)
    expect(meta.status, `staff lost the team metadata: ${meta.text.slice(0, 200)}`).toBe(200)
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

// THE FRAMING, checked. The leak was not that someone forgot the fence on one
// door — it is that the fence was decided by a list of what the ACCOUNTS MODULE
// OWNS, so every table a client can reach by another route (a support ticket
// first) was outside it by construction, silently. The deciding list is now an
// enumeration of what the FEED CAN BE ASKED ABOUT, and this is the check that
// makes an undecided table a red build instead of an open door.
describe("the activity fence is decided by DATA, and the data is complete", () => {
  /** Every table the (table, id) read will answer about: the modules the route
   * resolves through the gate map, plus the fixed-scope aliases the reader
   * names. DERIVED from both sources — retyping either is how they drift. */
  const REACHABLE = [...new Set([...Object.keys(ACTIVITY_GATE_MAP), ...Object.values(FIXED_SCOPE_TABLES)])]

  it("the derivation is alive (a blind scan reports 'all clear' exactly like a passing one)", () => {
    expect(REACHABLE.length, "no reachable table derived — the scan has gone blind").toBeGreaterThan(6)
    expect(REACHABLE, "the table the leak went through must be in the derived set").toContain("help")
    expect(REACHABLE).toContain("users")
  })

  it("every table the feed answers about has a decided fence", () => {
    const undecided = REACHABLE.filter((t) => !(t in PORTAL_ACTIVITY_FENCE))
    expect(
      undecided,
      `these tables answer a CLIENT LOGIN with no decision about what they may see — add a line to PORTAL_ACTIVITY_FENCE ("account", or null with the reason): ${undecided.join(", ")}`
    ).toEqual([])
  })

  it("a table a client reads NOTHING of still says why", () => {
    for (const [table, e] of Object.entries(PORTAL_ACTIVITY_FENCE))
      if (e.fence === null)
        expect(e.why.length, `${table} needs a real reason, not a shrug`).toBeGreaterThan(20)
  })

  it("no rotting lines: every entry names a table the feed can be asked about", () => {
    const rotten = Object.keys(PORTAL_ACTIVITY_FENCE).filter((t) => !REACHABLE.includes(t))
    expect(rotten, `PORTAL_ACTIVITY_FENCE decides tables the feed never answers: ${rotten.join(", ")}`).toEqual([])
  })

  // The two lists describe the same rows from two directions, so they must agree:
  // an account-owned table the feed would answer with `0 = 1` is a fence that
  // locks out the client it exists to serve, and the mirror mistake is the leak.
  it("agrees with ACCOUNT_OWNED_TABLES about which rows the account fence covers", () => {
    const byFence = Object.entries(PORTAL_ACTIVITY_FENCE)
      .filter(([, e]) => e.fence === "account")
      .map(([t]) => t)
      .sort()
    expect(byFence).toEqual([...ACCOUNT_OWNED_TABLES].sort())
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
      // Recursive, through the one shared walker: a spine query that moved into
      // lib/<anything>/ would have walked straight out of this boundary when the
      // scan read one directory flat.
      for (const file of sourceFiles(join(SRC, dir), { extensions: [".ts"] })) {
        if (file.rel === "accounts.ts") continue
        if (/(FROM|INTO|UPDATE)\s+(accounts|account_links|portal_users)\b/.test(file.source))
          offenders.push(`${dir}/${file.rel}`)
      }
    }
    expect(
      offenders,
      `spine SQL outside the one fenced file (lib/accounts.ts): ${offenders.join(", ")}`
    ).toEqual([])
  })
})

// A GRANT ON A NESTED COMPANY MUST NOT CLIMB.
//
// `portal_users.account_id` is the PERSON'S OWN ROW, and the fence walks UP from
// it to the companies that person belongs to, then DOWN through everything under
// the one they're standing in. Store a COMPANY there instead and the same walk
// does something very different: a company is nobody's contact, so the link half
// of ROOTS_SQL finds nothing and the parent half returns THAT COMPANY'S PARENT —
// and the walk down then covers every sibling company beneath it.
//
// It hid for a whole day because every grant anyone happened to make was on a
// TOP-LEVEL company, which has no parent to climb to. The agency screen passed
// the company; the seeding script passed the person; both looked fine.
//
// Bergman S.A. owns Bergman Workshop. A login belonging to a person of the
// Workshop must see the Workshop — never Bergman S.A., and never its siblings.
describe("a portal grant on a nested company does not climb to its parent", () => {
  it("stores the person, and the person's reach starts at their own company", async () => {
    // The suite's own fixture — the REST door is mocked against `holder.db`, so a
    // second database would be written to and then never read.
    const db2 = () => holder.db as DatabaseSync
    const cfg2 = { accountId: "a", apiToken: "t" } as never
    const guard2 = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }
    const actor2 = { id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }

    // A person who belongs to the CHILD company, the way a site manager does.
    const nils = await createAccount(cfg2, guard2, { kind: "staff" }, actor2, {
      accountType: "individual",
      name: "Nils Ekberg",
    })
    await linkPerson(cfg2, guard2, { kind: "staff" }, actor2, {
      accountId: IDS.victimChild,
      personAccountId: nils,
    })
    await grantPortalAccess(cfg2, guard2, { kind: "staff" }, actor2, {
      onAccountId: IDS.victimChild, // granted ON the child
      personAccountId: nils,
      userId: "U_NILS",
    })

    const stored = db2()
      .prepare("SELECT account_id FROM portal_users WHERE user_id = 'U_NILS'")
      .get() as { account_id: string }
    expect(stored.account_id, "the row holds the PERSON, not the company").toBe(nils)

    const scope = await accountScope(cfg2, { ...guard2, userId: "U_NILS" })
    if (scope.kind !== "portal") throw new Error("expected a portal caller")

    // Their world is the company they belong to, and what hangs under it.
    expect(scope.roots).toEqual([IDS.victimChild])
    expect(scope.accountIds).toContain(IDS.victimChild)

    // THE LEAK, named: the parent and every sibling under it.
    expect(scope.accountIds, "the fence must not climb to the parent").not.toContain(IDS.victimAccount)
    expect(scope.accountIds, "…nor reach a sibling through it").not.toContain(IDS.victimSecond)
    expect(scope.accountIds, "…nor another company's person").not.toContain(IDS.victimPerson)
  })
})

// WHAT THE AGENCY'S RECORD SAYS *ABOUT* A CLIENT IS NOT THE CLIENT'S TO READ.
//
// The fence above answers "whose rows?". This answers the other half: given a row
// that IS theirs, which of its columns are theirs. Most of an account is the
// client's own information — that is why the portal opens the door at all — but
// three fields on it are the agency's record about them: `commercialsVisible`
// (our switch governing what money they see) and the two audit names, plus
// `grantedByName` on every login row.
//
// THERE WERE FOUR. `status` — the agency's word for where the relationship stood
// — was redacted here until 0042 retired the column; it is now sent to nobody at
// all, which is the stronger version of the same guarantee. A field the row does
// not carry cannot be leaked by a projection somebody forgets to apply.
//
// The repo had already ruled on exactly these fields, one layer up. The portal
// has no activity feed, and shared/rules/registry.ts gives the reason in so many
// words: an account's history "names the staff who edited the record and shows
// the agency's own before/after values (status moves, commercial flags) — none of
// which is the client's to read". The history was closed; the current values rode
// out on the row beneath it. The portal draws none of them, which is what kept it
// invisible — and precisely why it needs a test on the WIRE rather than a habit
// in a component.
describe("an account row does not carry the agency's own view of the client", () => {
  /** Values a client must never read back, planted on every row so the assertions
   * are about a redaction rather than about an empty fixture. */
  const OPENED_BY = "Nils Opener"
  const TOUCHED_BY = "Nora Editor"

  beforeEach(() => {
    const db = holder.db as DatabaseSync
    db.exec(
      `UPDATE accounts SET commercials_visible = 1,
         creator_name = '${OPENED_BY}', editor_name = '${TOUCHED_BY}';
       UPDATE portal_users SET creator_name = '${OPENED_BY}';`
    )
  })

  /** Every agency-only value, in one place, so a test cannot check two of three. */
  const AGENCY_ONLY = [OPENED_BY, TOUCHED_BY]

  // THE CONTROL. Each assertion below is "this string is absent", and a door that
  // answered nothing at all would satisfy every one of them. So first: the agency
  // app is still served the whole record, which is also the point — this is a
  // projection for one kind of caller, not a column being deleted.
  it("staff still read the whole record (or the absences below prove nothing)", async () => {
    const { status, text } = await call(req("GET /api/tenancy/accounts"), IDS.staffUser)
    expect(status).toBe(200)
    for (const secret of AGENCY_ONLY) expect(text, `staff must still see ${secret}`).toContain(secret)
    expect(text).toContain('"commercialsVisible":true')
  })

  it("the client's own list carries their company and none of our notes on it", async () => {
    const { status, text } = await call(req("GET /api/tenancy/accounts"), IDS.victimUser)
    expect(status).toBe(200)
    // They can see themselves — this is their door, and it still works.
    expect(text, "the client must still get their own company back").toContain("Bergman")
    for (const secret of AGENCY_ONLY)
      expect(text, `a client login was sent the agency's "${secret}"`).not.toContain(secret)
    expect(text, "the commercial flag is a switch ABOUT them, not for them").not.toContain(
      '"commercialsVisible":true'
    )
    expect(text).toContain('"commercialsVisible":null')
    // …and `status` is on NO row now, ours or theirs (0042).
    expect(text).not.toContain('"status"')
  })

  it("nor through the detail door the portal actually calls — on EVERY row it opens", async () => {
    const { text: mine } = await call(req("GET /api/tenancy/accounts"), IDS.victimUser)
    const visible = (JSON.parse(mine) as { accounts: { id: string; name: string }[] }).accounts
    expect(visible.length, "the client must have accounts to open, or this walks nothing").toBeGreaterThan(0)

    let logins = 0
    let parents = 0
    for (const row of visible) {
      const { status, text } = await call(
        req("GET /api/tenancy/accounts/detail", undefined, `?id=${row.id}`),
        IDS.victimUser
      )
      expect(status, `the detail door must answer for ${row.name}`).toBe(200)
      for (const secret of AGENCY_ONLY)
        expect(text, `the detail door sent a client login the agency's "${secret}"`).not.toContain(secret)

      const detail = JSON.parse(text) as {
        account: { name: string; createdByName: string | null; editedByName: string | null }
        parent: { createdByName: string | null } | null
        portalUsers: { grantedByName: string | null }[]
      }
      expect(detail.account.name, "the door answered with a real record").toBeTruthy()
      expect(detail.account.createdByName).toBeNull()
      expect(detail.account.editedByName).toBeNull()
      // The PARENT is a second row built by a second query — the place a
      // redaction applied "at the call site" is the one somebody forgets.
      if (detail.parent) {
        parents++
        expect(
          detail.parent.createdByName,
          "the parent row goes through the projection too"
        ).toBeNull()
      }
      // Who handed out the login is a staff decision with a staff name on it.
      for (const p of detail.portalUsers) {
        logins++
        expect(p.grantedByName).toBeNull()
      }
    }
    // The walk has to have MET both of those, or two of the assertions above ran
    // zero times and said so in silence.
    expect(logins, "no login row was reached — the grantedByName check ran on nothing").toBeGreaterThan(0)
    expect(parents, "no nested account was reached — the parent check ran on nothing").toBeGreaterThan(0)
  })

  // The EXPORT is the same rows in a file, and it is reachable at the agency
  // origin by anyone holding accounts:read — a client login included. A CSV that
  // leaked what the JSON withheld would be the same disclosure, one Content-Type
  // along; it is the shape of leak this codebase has already been bitten by.
  it("and not in the CSV either — the export is the same rows in a file", async () => {
    const { status, text } = await call(req("GET /api/tenancy/accounts/export"), IDS.victimUser)
    expect(status).toBe(200)
    expect(text, "the export must still contain their own company").toContain("Bergman")
    for (const secret of AGENCY_ONLY)
      expect(text, `the CSV export sent a client login the agency's "${secret}"`).not.toContain(secret)
  })
})
