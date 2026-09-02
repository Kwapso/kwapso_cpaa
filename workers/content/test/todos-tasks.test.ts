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
    // A task's attachment goes in the AGENCY's bucket, not the shared one — the
    // agency gateway alone serves /media/internal/, so a client hostname has
    // nowhere to redeem the key (R21). Two buckets here because a test that
    // mocked one would prove nothing about which one the door reached for.
    INTERNAL_MEDIA: { put: async () => undefined },
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
})

describe("a to-do is aimed at the client", () => {
  it("always belongs to one, carries their reference, and emails their people", async () => {
    const id = await askFor("Send us your brand logo as an SVG")
    const row = todoRows()[0]
    expect(row.account_id).toBe(IDS.victimAccount)
    expect(row.ref).toBe("I0001")
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

  // THE BUCKET IS A WRITE TOO, and it is the one a 404 does not undo. /media/*
  // keys are capability URLs served with no session by both gateways, so an
  // object stored before the fence is PUBLISHED even when the row write then
  // refuses — a portal contact naming a foreign to-do id was storing 10 MB of
  // attacker-chosen bytes on the company's own domain, orphaned, for ever.
  // Source order is the invariant: the fenced read comes before the put.
  it("no /media object is stored before the record it hangs on is fenced", () => {
    for (const [file, fencedRead] of [
      ["todos.ts", "todoOrThrow"],
      ["stories.ts", "storyOrThrow"],
    ] as const) {
      const src = readFileSync(join(__dirname, "..", "src", "routes", file), "utf8")
      const put = src.indexOf("env.MEDIA.put")
      expect(put, `${file} no longer uploads — re-read this check`).toBeGreaterThan(-1)
      const fence = src.indexOf(`await ${fencedRead}(`)
      expect(fence, `${file} must resolve ${fencedRead} before it writes the bucket`).toBeGreaterThan(-1)
      expect(fence, `${file}: the ${fencedRead} read must come BEFORE env.MEDIA.put`).toBeLessThan(put)
    }
  })
})

describe("who sees everyone else's tasks is a permission (4.9)", () => {
  /** A second staff member on a role that holds `work` but NOT `all_tasks` —
   * which is what "off by default for every role except Admin" means in
   * practice. Everything else about them is ordinary. */
  const NARROW_USER = "U_NARROW"
  const NARROW_ROLE = "R_NARROW"
  beforeEach(() => {
    db().exec(`
      INSERT INTO users (id, email, first_name, current_team_id)
        VALUES ('${NARROW_USER}', 'narrow@kwapso.app', 'Nadia', '${IDS.team}');
      INSERT INTO team_members (id, team_id, user_id, role_id, created_at)
        VALUES ('m_narrow', '${IDS.team}', '${NARROW_USER}', '${NARROW_ROLE}', '2026-01-01');
      INSERT INTO member_roles (id, title, is_default, created_at)
        VALUES ('${NARROW_ROLE}', 'Developer', 0, '2026-01-01');
      INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
        VALUES ('rp_narrow_work', '${NARROW_ROLE}', 'work', 1, 1, 1, 1);
    `)
  })

  const titles = async (userId: string, query = "") =>
    ((await (await call(userId, "GET /api/content/tasks", undefined, query)).json()) as {
      tasks: { title: string }[]
    }).tasks.map((t) => t.title)

  it("without the right, the list is YOUR tasks — not a refusal, and not everyone's", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Somebody else's job" })
    await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Mine to do",
      assigneeId: NARROW_USER,
    })

    // The door OPENS — `work:read` is what gets you the screen — and answers
    // about you. A 403 here would teach a screen to hide a tab instead of
    // showing the right rows.
    const res = await call(NARROW_USER, "GET /api/content/tasks")
    expect(res.status).toBe(200)
    expect(await titles(NARROW_USER)).toEqual(["Mine to do"])

    // …and the same caller cannot ask about somebody else by naming them: the
    // door REPLACES the filter rather than trusting it.
    expect(await titles(NARROW_USER, `?assigneeId=${IDS.staffUser}`)).toEqual(["Mine to do"])
  })

  it("every count comes back narrowed too — the badge can't advertise rows the list withholds (R16)", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Somebody else's job" })
    await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Mine to do",
      assigneeId: NARROW_USER,
    })
    const body = (await (await call(NARROW_USER, "GET /api/content/tasks")).json()) as {
      total: number
      openTotal: number
      allTotal: number
    }
    expect({ total: body.total, openTotal: body.openTotal, allTotal: body.allTotal }).toEqual({
      total: 1,
      openTotal: 1,
      allTotal: 1,
    })
  })

  it("with the right, the same door answers about the whole team", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Somebody else's job" })
    await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Mine to do",
      assigneeId: NARROW_USER,
    })
    db().exec(
      `INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
         VALUES ('rp_narrow_all', '${NARROW_ROLE}', 'all_tasks', 1, 0, 0, 0);`
    )
    expect((await titles(NARROW_USER)).sort()).toEqual(["Mine to do", "Somebody else's job"])
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
    // A task mints no reference at all (2026-08-31 ruling) — same no-reference
    // category as a process, a role or a dropdown value, regardless of
    // whether it names a client.
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

  // THE FINISHED PILE IS REACHABLE, AND BOTH COUNTS COME BACK.
  //
  // `?view=all` has been parsed by this door since it shipped and nothing on any
  // screen ever sent it, so the app had a two-view collection and could show one
  // view of it — the tester's "cannot switch the view, I only see open ones".
  // A door with a filter nobody sends is indistinguishable from a door without
  // one, so the contract is pinned here: the view CHANGES the rows, and every
  // answer carries both exact counts, because the badge on the tab you are not
  // looking at cannot be counted from the rows on the one you are (R16).
  it("shows the finished ones on ?view=all, and counts both piles either way", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Still to do" })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Already finished" })
    const done = (
      db().prepare(`SELECT id FROM tasks WHERE title = 'Already finished'`).get() as { id: string }
    ).id
    await call(IDS.staffUser, "POST /api/content/tasks/done", { id: done, done: true })

    const open = (await (await call(IDS.staffUser, "GET /api/content/tasks")).json()) as {
      tasks: { title: string }[]
      total: number
      openTotal: number
      allTotal: number
    }
    expect(open.tasks.map((t) => t.title)).toEqual(["Still to do"])
    // `total` stays the count over what was LISTED, so the sidebar badge goes on
    // meaning "what is still on our list".
    expect(open).toMatchObject({ total: 1, openTotal: 1, allTotal: 2 })

    const all = (await (
      await call(IDS.staffUser, "GET /api/content/tasks", undefined, "?view=all")
    ).json()) as { tasks: { title: string }[]; total: number; openTotal: number; allTotal: number }
    expect(all.tasks.map((t) => t.title).sort()).toEqual(["Already finished", "Still to do"])
    expect(all).toMatchObject({ total: 2, openTotal: 1, allTotal: 2 })
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

// ── THE SIX VIEWS, THE TWO TICKS, AND THE SECOND FIELD ────────────────────────
//
// What the tester asked for, held at the DOOR rather than on the screen: a tab
// that sieved the loaded page would answer "the overdue among the newest N", and
// a department rule only the form knew would be a rule a machine caller never
// meets. Each case below drives the shipped handler.

/** A deadline `n` days from now, as the ISO moment the door stores. */
const deadline = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/** The rows one view answers with, by title. */
async function titlesIn(view: string): Promise<string[]> {
  const res = await call(IDS.staffUser, "GET /api/content/tasks", undefined, `?view=${view}`)
  const body = (await res.json()) as { tasks: { title: string }[] }
  return body.tasks.map((t) => t.title).sort()
}

describe("our own admin comes in six piles, counted once", () => {
  beforeEach(async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Late", dueOn: deadline(-3) })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Soon", dueOn: deadline(5) })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Undated" })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Finished", dueOn: deadline(-1) })
    const done = (db().prepare(`SELECT id FROM tasks WHERE title = 'Finished'`).get() as { id: string }).id
    await call(IDS.staffUser, "POST /api/content/tasks/done", { id: done, done: true })
  })

  it("each view answers a different question, and none of them is a filter over the others", async () => {
    // Overdue is what is PAST its deadline and not done — the finished one is
    // not overdue, which is the distinction a client-side filter kept losing.
    expect(await titlesIn("overdue")).toEqual(["Late"])
    expect(await titlesIn("upcoming")).toEqual(["Soon"])
    expect(await titlesIn("completed")).toEqual(["Finished"])
    // The calendar shows what has a date on it, finished or not: a month grid
    // with last week's completed work missing is a month grid that lies.
    expect(await titlesIn("calendar")).toEqual(["Finished", "Late", "Soon"])
    expect(await titlesIn("open")).toEqual(["Late", "Soon", "Undated"])
    expect(await titlesIn("all")).toEqual(["Finished", "Late", "Soon", "Undated"])
  })

  it("R16 — every badge and the progress pair come back from whichever view was asked", async () => {
    const body = (await (
      await call(IDS.staffUser, "GET /api/content/tasks", undefined, "?view=overdue")
    ).json()) as Record<string, number>
    // The count over what was LISTED, plus the other five, plus today's pair —
    // all eight out of one read, so no two of them can disagree.
    expect(body).toMatchObject({
      total: 1,
      openTotal: 3,
      allTotal: 4,
      overdueTotal: 1,
      upcomingTotal: 1,
      completedTotal: 1,
      calendarTotal: 3,
      // Everything due today or earlier: the late one and the finished one.
      dueTodayTotal: 2,
      dueTodayDone: 1,
    })
  })

  it("a made-up view is the everyday pile, not a SQL fragment (R20)", async () => {
    expect(await titlesIn("'; DROP TABLE tasks;--")).toEqual(["Late", "Soon", "Undated"])
    expect(db().prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 4 })
  })
})

describe("a task carries the two ticks, a department, and whatever that department asks for", () => {
  it("scores the Eisenhower pair (important × 2) + urgent + 1, and stores neither the score nor a guess", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Neither" })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Urgent only", urgent: true })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Important only", important: true })
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Both", important: true, urgent: true })
    const body = (await (
      await call(IDS.staffUser, "GET /api/content/tasks", undefined, "?view=all")
    ).json()) as { tasks: { title: string; priority: number }[] }
    const score = Object.fromEntries(body.tasks.map((t) => [t.title, t.priority]))
    expect(score).toEqual({ Neither: 1, "Urgent only": 2, "Important only": 3, Both: 4 })
  })

  it("a non-boolean tick is not a tick — it is false, never a truthy string (R20)", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", { title: "Typed wrong", important: "false" })
    const row = db().prepare(`SELECT important, urgent FROM tasks`).get() as Record<string, number>
    expect(row).toEqual({ important: 0, urgent: 0 })
  })

  it("refuses a Production task with no app, and a Sales task with no client", async () => {
    const noApp = await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Ship the dispatch change",
      department: "Production",
    })
    expect(noApp.status).toBe(400)
    const noClient = await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Chase the renewal",
      department: "Sales",
    })
    expect(noClient.status).toBe(400)
    // Nothing half-written: the rule runs before the insert.
    expect(db().prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })

  it("takes a Production task that names its app, and an Admin task with no client at all", async () => {
    expect(
      (
        await call(IDS.staffUser, "POST /api/content/tasks", {
          title: "Ship the dispatch change",
          department: "Production",
          appId: IDS.victimApp,
        })
      ).status
    ).toBe(200)
    expect(
      (
        await call(IDS.staffUser, "POST /api/content/tasks", {
          title: "File the VAT return",
          department: "Admin",
        })
      ).status
    ).toBe(200)
    const rows = db()
      .prepare(`SELECT department, app_id FROM tasks ORDER BY title`)
      .all() as Record<string, string | null>[]
    expect(rows).toEqual([
      { department: "Admin", app_id: null },
      { department: "Production", app_id: IDS.victimApp },
    ])
  })

  it("refuses an app that is not ours, the same way it refuses a client that is not", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Work on somebody else's system",
      department: "Production",
      appId: "A_MADE_UP_APP",
    })
    expect(res.status).toBe(400)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })

  // THE NAME ON THE ROW IS THE ASSIGNEE'S. It used to be the CREATOR's, whoever
  // the task was for, because the insert reached for `actor.name` — so every task
  // in the list said the name of the person who wrote it down.
  it("writes the assignee's own name beside their id, not the writer's", async () => {
    await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "Somebody else's job",
      assigneeId: IDS.contactUser,
    })
    const row = db().prepare(`SELECT assignee_id, assignee_name FROM tasks`).get() as Record<
      string,
      string | null
    >
    expect(row.assignee_id).toBe(IDS.contactUser)
    expect(row.assignee_name).not.toBe("Staff Member")
    expect(row.assignee_name).toBeTruthy()
  })

  it("refuses an assignee who is not on the team", async () => {
    const res = await call(IDS.staffUser, "POST /api/content/tasks", {
      title: "For a stranger",
      assigneeId: "U_NOBODY",
    })
    expect(res.status).toBe(400)
    expect(db().prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
  })
})
