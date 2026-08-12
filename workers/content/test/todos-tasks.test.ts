// TO-DOS AND TASKS — the two nouns that are the same shape and opposite
// audiences, driven through the SHIPPED route handlers against a real SQLite
// database running the real team migrations.
//
// The case that matters most in this file is the one that proves they stayed
// apart: a client login can see and complete their own to-dos, and cannot see a
// single task. Two tables and two doors is the design; this is the proof that
// the design is what is running.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))
const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string }[] }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

// The send seam, captured rather than stubbed away: WHO an email reaches is half
// of what the two-emails rule (.plans/BUILD-1 §7) actually promises, and a mock
// that swallowed it would leave that half untested.
vi.mock("@shared/workers/notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/notify")>()
  return {
    ...actual,
    sendBrandedEmail: async (_env: unknown, to: string, subject: string) => {
      sent.emails.push({ to, subject })
      return true
    },
  }
})

import { readFileSync } from "node:fs"
import { join } from "node:path"

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
    MEDIA: { put: async () => undefined },
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

const todoRows = () =>
  db().prepare(`SELECT * FROM todos`).all() as Record<string, string | number | null>[]

const historyFor = (id: string): string[] =>
  (db().prepare(`SELECT type FROM activity WHERE related_row_id = ?`).all(id) as { type: string }[])
    .map((h) => h.type)
    .sort()

/** Ask the victim's company for something, and hand back the to-do's id. */
async function askFor(title: string, accountId = IDS.victimAccount): Promise<string> {
  const res = await call(IDS.staffUser, "POST /api/content/todos", { accountId, title })
  expect(res.status, "the to-do door refused a plain create").toBe(200)
  return (db().prepare(`SELECT id FROM todos WHERE title = ?`).get(title) as { id: string }).id
}

beforeEach(() => {
  holder.db = buildSpineDb()
  sent.emails = []
  db().exec(`UPDATE accounts SET code = 'BERG' WHERE id = '${IDS.victimAccount}';`)
})

describe("a to-do is aimed at the client", () => {
  it("always belongs to one, carries their reference, and emails their people", async () => {
    const id = await askFor("Send us your brand logo as an SVG")
    const row = todoRows()[0]
    expect(row.account_id).toBe(IDS.victimAccount)
    expect(row.ref).toBe("BERG-D0001")
    expect(row.completed_at).toBe(null)
    void id

    // ONE OF ONLY TWO THINGS THAT EMAIL A CLIENT (BUILD-1 §7), and it reaches the
    // people at THAT company who can sign in — nobody at another client, and
    // nobody on the agency's side.
    expect(sent.emails.length).toBeGreaterThan(0)
    expect(sent.emails.every((e) => e.to.endsWith("@bergman.example"))).toBe(true)
    // No staff name in the subject: SCOPE ch.06 is a promise about every surface
    // that leaves the building, and email is the easiest one to drop it on.
    expect(sent.emails.some((e) => e.subject.includes("Staff"))).toBe(false)
  })

  it("refuses a client that isn't on the books", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/todos", {
      accountId: "01NOTANACCOUNT",
      title: "Send us something",
    })
    expect(res.status).toBe(400)
    expect(todoRows()).toHaveLength(0)
    expect(sent.emails).toHaveLength(0)
  })

  it("is completed by the client themselves, once", async () => {
    const id = await askFor("Sign the scope")
    // IDS.contactUser is a client login at Bergman.
    const res = await call(IDS.contactUser, "POST /api/content/todos/complete", { id })
    expect(res.status).toBe(200)
    expect(todoRows()[0].completed_at).not.toBe(null)
    expect(todoRows()[0].completer_name).toBe("Luis")

    // R17: completing a completed to-do moves zero rows — no second history line
    // and no second moment.
    const stamp = todoRows()[0].completed_at
    await call(IDS.staffUser, "POST /api/content/todos/complete", { id })
    expect(todoRows()[0].completed_at).toBe(stamp)
    expect(historyFor(id).filter((h) => h === "To-do completed")).toHaveLength(1)
  })

  it("a client at ANOTHER company cannot see it or complete it", async () => {
    const id = await askFor("Bergman's own homework")
    // The burglar holds every right their role can hold and stands in Delaval.
    const listed = (await (await call(IDS.burglarUser, "GET /api/content/todos")).json()) as {
      todos: { id: string }[]
      total: number
    }
    expect(listed.todos).toHaveLength(0)
    expect(listed.total, "the count must not say how many it is refusing to show").toBe(0)

    // …and naming the id directly is the same answer a made-up id gets: 404, so
    // "not yours" never confirms it exists.
    const res = await call(IDS.burglarUser, "POST /api/content/todos/complete", { id })
    expect(res.status).toBe(404)
    expect(todoRows()[0].completed_at).toBe(null)
  })

  it("withdrawing one keeps the row and takes it off their list", async () => {
    const id = await askFor("Something we stopped needing")
    await call(IDS.staffUser, "POST /api/content/todos/cancel", { id })
    // Deactivate-never-delete: the row and the decision both survive.
    expect(todoRows()).toHaveLength(1)
    expect(todoRows()[0].cancelled_at).not.toBe(null)
    expect(todoRows()[0].canceller_name).toBe("Staff")
    const listed = (await (await call(IDS.contactUser, "GET /api/content/todos")).json()) as {
      todos: unknown[]
    }
    expect(listed.todos).toHaveLength(0)
    // R17: withdrawing a withdrawn to-do is not a second event.
    await call(IDS.staffUser, "POST /api/content/todos/cancel", { id })
    expect(historyFor(id).filter((h) => h === "To-do withdrawn")).toHaveLength(1)
  })

  it("a client cannot ask themselves for something, or withdraw one", async () => {
    const id = await askFor("Ours to ask")
    expect(
      (await call(IDS.contactUser, "POST /api/content/todos", { accountId: IDS.victimAccount, title: "Mine" }))
        .status
    ).toBe(403)
    expect((await call(IDS.contactUser, "POST /api/content/todos/cancel", { id })).status).toBe(403)
    expect(todoRows()).toHaveLength(1)
  })
})

// THE ONE CASE IN THIS FILE THAT IS A SOURCE SCAN, and it is here because it was
// caught being missing. Deliberately breaking the fence on the completing UPDATE
// left all ten behavioural cases green: `completeTodo` resolves the row through
// `todoOrThrow` first, so a burglar is already 404'd before the statement runs,
// and the clause on the write is invisible from outside.
//
// It is still there, and it must stay: "a fence you can only see by reading the
// caller is a fence the next reader will delete" (lib/help.ts). The read and the
// write have to say the same sentence in the same file, or the day somebody
// refactors the lookup away the door quietly opens. Behaviour cannot see it;
// this can.
describe("the fence rides the WRITE, not only the read in front of it", () => {
  it("the completing UPDATE carries the caller's account clause", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "todos.ts"), "utf8")
    const at = src.indexOf("UPDATE todos SET completed_at")
    expect(at, "completeTodo's statement moved — re-read this check").toBeGreaterThan(-1)
    const stmt = src.slice(at, at + 600)
    expect(
      /fence\.sql/.test(stmt),
      "the completing UPDATE must AND the caller's account fence into its own WHERE"
    ).toBe(true)
    expect(/fence\.params/.test(stmt), "…and bind its parameters").toBe(true)
  })
})

describe("a task is ours, and a client never learns one exists", () => {
  it("is written down with no client, and no reference to quote", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "File the quarterly VAT return",
    })
    expect(res.status).toBe(200)
    const row = db().prepare(`SELECT * FROM tasks`).get() as Record<string, string | null>
    expect(row.account_id).toBe(null)
    // A reference is built out of an ACCOUNT's short code, and our own admin has
    // no account. A number nobody can quote is worse than none.
    expect(row.ref).toBe(null)
    expect(row.status).toBe("open")
  })

  it("R17 — ticking a done task twice writes one history line", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Renew the domain" })
    const id = (db().prepare(`SELECT id FROM tasks`).get() as { id: string }).id
    await call(IDS.staffUser, "POST /api/content/tasks/done", { id, done: true })
    const stamp = (db().prepare(`SELECT completed_at FROM tasks WHERE id = ?`).get(id) as {
      completed_at: string
    }).completed_at
    await call(IDS.staffUser, "POST /api/content/tasks/done", { id, done: true })
    expect(historyFor(id)).toEqual(["Task created", "Task done"].sort())
    expect(
      (db().prepare(`SELECT completed_at FROM tasks WHERE id = ?`).get(id) as { completed_at: string })
        .completed_at
    ).toBe(stamp)
  })

  // THE LINE BETWEEN THE TWO NOUNS, proved rather than asserted. A client login
  // holding every right their role can hold reads their own to-dos and is
  // refused the task list outright — which is the whole reason these are two
  // tables, two files and two modules rather than one with a `kind` column.
  it("a client login is refused the task list, while reading their own to-dos", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Our own private chore" })
    await askFor("Their own homework")

    const tasks = await call(IDS.contactUser, "GET /api/content/tasks")
    expect(tasks.status).toBe(403)
    expect(await tasks.text()).not.toContain("private chore")

    const todos = (await (await call(IDS.contactUser, "GET /api/content/todos")).json()) as {
      todos: { title: string }[]
    }
    expect(todos.todos.map((t) => t.title)).toEqual(["Their own homework"])
  })

  it("a client login cannot write a task either", async () => {
    expect(
      (await call(IDS.contactUser, "POST /api/content/tasks", { title: "Not yours to write" })).status
    ).toBe(403)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })
})
