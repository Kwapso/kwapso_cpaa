// TWO THINGS THE AGENT'S DOORS OWE A STRANGER: a ceiling in front of the parse,
// and one sentence for "not yours" and "not there".
//
// THE CEILING. `POST /agent/chat` has real caps — eight files, ~5 MB each — and
// every one of them was read AFTER `request.json()` had already buffered and
// parsed the whole body. So the caps bounded what could be IMPORTED while the
// parse bounded what could be SENT, and the parse's own bound was 40 MB of JSON
// string in a 128 MB isolate. A ceiling is only a ceiling if it is checked before
// the expensive step, so the ORDER is the assertion, not the number.
//
// THE SENTENCE. `listMessages` read the thread row and then judged it: a
// colleague's thread id answered 403 and a made-up one 404. Forty lines below it,
// its write-side sibling `requireOwnThread` resolves ownership INSIDE the WHERE
// and says why in one line — "404, not 403: 'that thread isn't yours' confirms
// the thread exists". Two answers on one table is an existence oracle over every
// private conversation in the team, from the door that exists to keep them private.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import { AGENT_CHAT_MAX_BYTES, AGENT_FILE_MAX_BYTES, AGENT_MAX_FILES } from "@shared/workers/limits"
import { listMessages, requireOwnThread } from "../src/lib/threads"
import { buildSpineDb, IDS } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync
const cfg = { accountId: "a", apiToken: "t" } as never
const mine = { userId: IDS.staffUser, teamId: IDS.team, roleId: IDS.adminRole, databaseId: "db_team" }

describe("the chat door's ceiling sits in front of the parse", () => {
  // COMMENTS STRIPPED FIRST, or explaining the rule would break it: the comment
  // above the guard names `request.json()`, and an ordering test that reads prose
  // measured the sentence instead of the statement.
  const src = readFileSync(join(__dirname, "..", "src/routes/agent.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
  const handler = src.slice(
    src.indexOf("export async function postAgentChat"),
    src.indexOf("export async function postAgentConfirm")
  )

  it("the content-length check comes BEFORE request.json()", () => {
    const guard = handler.indexOf("AGENT_CHAT_MAX_BYTES")
    const parse = handler.indexOf("request.json()")
    expect(guard, "postAgentChat no longer reads the request ceiling").toBeGreaterThan(-1)
    expect(parse, "postAgentChat no longer parses a body — re-read this test").toBeGreaterThan(-1)
    expect(guard, "a cap read after the parse describes nothing the parse did").toBeLessThan(parse)
  })

  it("it refuses with a 413, which is what 'too big to send' means on the wire", () => {
    const at = handler.indexOf("AGENT_CHAT_MAX_BYTES")
    expect(handler.slice(at, at + 220)).toContain("413")
  })

  // The outer number is only correct while it is bigger than what the inner caps
  // allow. Derived-constant arithmetic, the same shape as reply-ceiling.test.ts:
  // shrink the outer one and a legal attachment set becomes an unexplainable
  // refusal; raise the inner ones and the outer stops bounding anything.
  it("and it is big enough to carry the caps it guards", () => {
    expect(AGENT_CHAT_MAX_BYTES).toBeGreaterThan(AGENT_MAX_FILES * AGENT_FILE_MAX_BYTES)
  })
})

describe("a thread that isn't yours reads exactly like one that never existed", () => {
  beforeEach(() => {
    holder.db = buildSpineDb()
    db().exec(
      `INSERT INTO agent_threads (id, title, last_message_at, created_at, creator_id, creator_email, creator_name)
       VALUES ('T_MINE', 'Mine', '2026-01-01', '2026-01-01', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
              ('T_THEIRS', 'A colleague''s', '2026-01-01', '2026-01-01', '${IDS.victimUser}', 'marta@bergman.example', 'Marta');
       INSERT INTO agent_messages (id, thread_id, role, content, source, created_at)
       VALUES ('M1', 'T_MINE', 'user', 'hello', 'web', '2026-01-01'),
              ('M2', 'T_THEIRS', 'user', 'PRIVATE-MARKER', 'web', '2026-01-01');`
    )
  })

  it("my own thread still reads", async () => {
    expect((await listMessages(cfg, mine, "T_MINE")).map((m) => m.content)).toEqual(["hello"])
  })

  /** The two answers that must be indistinguishable. */
  const asked = async (id: string) =>
    listMessages(cfg, mine, id).then(
      () => ({ status: 0, code: "" }),
      (e: { status: number; code: string }) => ({ status: e.status, code: e.code })
    )

  it("a colleague's thread and a made-up id give the SAME status and the SAME code", async () => {
    const theirs = await asked("T_THEIRS")
    const nowhere = await asked("T_INVENTED")
    expect(theirs).toEqual(nowhere)
    expect(theirs.status, "404 — 'that isn't yours' would confirm it exists").toBe(404)
  })

  it("and nothing of theirs comes back on the way to the refusal", async () => {
    await expect(listMessages(cfg, mine, "T_THEIRS")).rejects.toMatchObject({ status: 404 })
    // Belt and braces: the write-side sibling answers the same sentence, and the
    // two doors sitting on one table are what made the oracle readable.
    await expect(requireOwnThread(cfg, mine, mine.userId, "T_THEIRS")).rejects.toMatchObject({
      status: 404,
    })
  })
})
