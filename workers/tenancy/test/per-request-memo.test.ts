// THE PER-REQUEST MEMOS, AND THE ONE PROPERTY THAT MAKES THEM SAFE.
//
// `hasRight` and `accountScope` are both resolved once per request now, keyed on
// the guard OBJECT. That turns seven permission reads and seven fence reads on
// one record-screen open into one of each — every one of those was a separate
// HTTPS request to the D1 REST API, because a team database is created at
// runtime and cannot be a native binding (ARCHITECTURE.md).
//
// The saving is not what needs a test. The SAFETY does. A memo on a permission
// answer inside a long-lived Worker isolate is a tenant-isolation bug waiting to
// be written: the isolate serves many callers, so anything keyed on a string
// (`roleId`, `userId`, `teamId`) survives the request that made it and can hand
// the next caller the previous caller's rights. The whole defence is that the
// key is an object whose lifetime IS the request — `requireMember` builds a
// fresh literal every time — so two requests can never collide on it.
//
// That is an invariant nothing else states, which is exactly the kind that rots.
// These tests state it: two guards, same role, same module, must each pay for
// their own read and must each get their own answer.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@shared/workers/d1-rest", () => ({
  d1Query: vi.fn(),
  d1ExecScript: vi.fn(),
}))

import { d1Query } from "@shared/workers/d1-rest"
import { hasRight } from "@shared/workers/gating"
import { accountScope } from "@shared/workers/account-scope"

const q = d1Query as unknown as ReturnType<typeof vi.fn>
const cfg = { accountId: "a", apiToken: "t" } as never

/** A request, as the gating seam builds one: a fresh object every time. */
function newGuard(roleId = "ROLE") {
  return { userId: "ME", teamId: "TEAM", roleId, databaseId: "db" }
}

beforeEach(() => q.mockReset())

describe("hasRight — one read per module per request", () => {
  it("answers four rights on one module from a single read", async () => {
    q.mockResolvedValue([{ can_read: 1, can_create: 1, can_edit: 0, can_delete: 0 }])
    const guard = newGuard()
    expect(await hasRight(cfg, guard, "help", "read")).toBe(true)
    expect(await hasRight(cfg, guard, "help", "create")).toBe(true)
    expect(await hasRight(cfg, guard, "help", "edit")).toBe(false)
    expect(await hasRight(cfg, guard, "help", "delete")).toBe(false)
    // The row always carried all four; it used to be re-read for each one.
    expect(q).toHaveBeenCalledTimes(1)
  })

  it("still reads once per MODULE — a memo is not a blanket yes", async () => {
    q.mockImplementation(async (_c: unknown, _db: unknown, _sql: string, params?: string[]) =>
      params?.[1] === "help" ? [{ can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }] : []
    )
    const guard = newGuard()
    expect(await hasRight(cfg, guard, "help", "read")).toBe(true)
    // A module with no row is a refusal, not the previous module's answer.
    expect(await hasRight(cfg, guard, "accounts", "read")).toBe(false)
    expect(q).toHaveBeenCalledTimes(2)
  })

  it("NEVER crosses requests, even for the same role and module", async () => {
    // The isolate-reuse case, stated plainly: caller one is allowed, the role's
    // sheet then changes, caller two must see the change. A cache keyed on
    // roleId would answer the second request out of the first one's read.
    q.mockResolvedValueOnce([{ can_read: 1, can_create: 1, can_edit: 1, can_delete: 1 }])
    expect(await hasRight(cfg, newGuard(), "help", "edit")).toBe(true)
    q.mockResolvedValueOnce([{ can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }])
    expect(await hasRight(cfg, newGuard(), "help", "edit")).toBe(false)
    expect(q).toHaveBeenCalledTimes(2)
  })

  it("does not cache a failure into the rest of the request", async () => {
    const guard = newGuard()
    q.mockRejectedValueOnce(new Error("D1 is having a moment"))
    await expect(hasRight(cfg, guard, "help", "read")).rejects.toThrow()
    q.mockResolvedValueOnce([{ can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }])
    expect(await hasRight(cfg, guard, "help", "read")).toBe(true)
  })

  it("shares ONE in-flight read between racing callers in the same request", async () => {
    q.mockResolvedValue([{ can_read: 1, can_create: 0, can_edit: 0, can_delete: 0 }])
    const guard = newGuard()
    const [a, b] = await Promise.all([
      hasRight(cfg, guard, "help", "read"),
      hasRight(cfg, guard, "help", "read"),
    ])
    expect([a, b]).toEqual([true, true])
    // The promise is memoised, not the value — two racing doors must not both
    // start the query, which is the shape a record screen actually has.
    expect(q).toHaveBeenCalledTimes(1)
  })
})

describe("accountScope — one fence per request", () => {
  it("resolves once however many doors ask", async () => {
    q.mockResolvedValue([]) // no portal_users row → staff
    const guard = newGuard()
    expect(await accountScope(cfg, guard)).toEqual({ kind: "staff" })
    await accountScope(cfg, guard)
    await accountScope(cfg, guard)
    // refusePortalCaller + the door itself + a counter used to be three reads.
    expect(q).toHaveBeenCalledTimes(1)
  })

  it("NEVER crosses requests — a revoked login does not keep its fence", async () => {
    q.mockResolvedValueOnce([
      { account_id: "ACC", app_restriction: null, current_account_id: null, deactivated_at: null },
    ])
    q.mockResolvedValueOnce([{ id: "ACC" }])
    q.mockResolvedValueOnce([{ id: "ACC" }])
    const first = await accountScope(cfg, newGuard())
    expect(first.kind).toBe("portal")

    q.mockResolvedValueOnce([])
    const second = await accountScope(cfg, newGuard())
    expect(second.kind).toBe("staff")
  })

  it("does not cache a failure into the rest of the request", async () => {
    const guard = newGuard()
    q.mockRejectedValueOnce(new Error("D1 is having a moment"))
    await expect(accountScope(cfg, guard)).rejects.toThrow()
    q.mockResolvedValueOnce([])
    expect(await accountScope(cfg, guard)).toEqual({ kind: "staff" })
  })
})
