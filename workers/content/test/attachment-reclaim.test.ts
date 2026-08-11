// AN EDIT SUPERSEDES AN ATTACHMENT. A DEACTIVATION DOES NOT.
//
// Learning uploads are the biggest objects the product stores — parseUploadDataUrl
// admits video, audio and PDF up to 25 MB — and nothing in this repo had ever
// deleted an R2 object, so every replaced attachment stayed in the bucket forever.
//
// The reclaim is only safe because of what it refuses to take: /media/* is served
// with no session, which makes a key a credential AND a reach. A delete handed a
// key from anywhere but a row the caller already owns is a cross-tenant destroy.
// So the keys come off the row this team's own guard opened, and each one is
// re-proved against that team's prefix (ownedMediaKey) before anything is deleted.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    d1Query: vi.fn(async () => []),
    d1ExecScript: vi.fn(async () => {}),
  }
})

import { d1Query, type D1Rest } from "../../../shared/workers/d1-rest"
import { updateLearning } from "../src/lib/learning"
import type { MemberGuard } from "../../../shared/workers/gating"
import type { Env } from "../src/env"

const CFG = { accountId: "acct", token: "tok" } as unknown as D1Rest
const GUARD: MemberGuard = { userId: "01USER", teamId: "01TEAM", roleId: "01ROLE", databaseId: "db-1" }
const ACTOR = { id: "01USER", email: "chris@x.com", name: "Chris Martin" }

const OLD = "01TEAM/01OLDOLDOLDOLDOLDOLDOLDOLD"
const NEW = "01TEAM/01NEWNEWNEWNEWNEWNEWNEWNEW"
const KEPT = "01TEAM/01KEPTKEPTKEPTKEPTKEPTKE"

/** An R2 stub that records what was destroyed. */
function bucket() {
  const deletes: string[] = []
  return {
    deletes,
    env: {
      DB: {} as Env["DB"],
      LEARNING_MEDIA: {
        async delete(key: string) {
          deletes.push(key)
        },
      },
    } as unknown as Env,
  }
}

/** The row as it stands BEFORE the edit — what learningOrThrow reads. */
function standing(before: { link?: string | null; body?: string | null }) {
  vi.mocked(d1Query).mockImplementation((async (_cfg: unknown, _db: unknown, sql: string) =>
    sql.includes("FROM learning WHERE id")
      ? [
          {
            id: "01ITEM",
            content_title: "How to do the thing",
            category: null,
            content_description: null,
            content_type: null,
            content_link: before.link ?? null,
            content_body: before.body ?? null,
          },
        ]
      : []) as never)
}

beforeEach(() => {
  vi.mocked(d1Query).mockReset()
  vi.mocked(d1Query).mockImplementation((async () => []) as never)
})

describe("editing a learning item reclaims the attachments it dropped", () => {
  it("the replaced file is deleted; the new one is not", async () => {
    standing({ body: `<p>hi</p><img src="/media/learning/${OLD}?v=1">` })
    const b = bucket()
    await updateLearning(b.env, CFG, GUARD, ACTOR, "01ITEM", {
      title: "How to do the thing",
      body: `<p>hi</p><img src="/media/learning/${NEW}?v=2">`,
    })
    expect(b.deletes, "a 25 MB video used to be left behind on every edit").toEqual([OLD])
  })

  it("a file the edit KEEPS is never touched", async () => {
    standing({
      body: `<img src="/media/learning/${KEPT}"><img src="/media/learning/${OLD}">`,
    })
    const b = bucket()
    await updateLearning(b.env, CFG, GUARD, ACTOR, "01ITEM", {
      title: "How to do the thing",
      body: `<img src="/media/learning/${KEPT}">`,
    })
    expect(b.deletes).toEqual([OLD])
  })

  it("an attachment in the LINK field counts too", async () => {
    standing({ link: `/media/learning/${OLD}?v=1` })
    const b = bucket()
    await updateLearning(b.env, CFG, GUARD, ACTOR, "01ITEM", {
      title: "How to do the thing",
      contentLink: "https://example.com/somewhere-else",
    })
    expect(b.deletes).toEqual([OLD])
  })

  it("an unchanged edit destroys nothing", async () => {
    const body = `<img src="/media/learning/${KEPT}">`
    standing({ body })
    const b = bucket()
    await updateLearning(b.env, CFG, GUARD, ACTOR, "01ITEM", { title: "How to do the thing", body })
    expect(b.deletes).toEqual([])
  })

  it("never an object outside this team, whatever the row says", async () => {
    for (const stored of [
      "/media/learning/01OTHERTEAM/01KEYKEYKEYKEYKEYKEYKEYKEY", // another team's
      "/media/learning/01TEAM/../01OTHERTEAM/01KEY", // a traversal probe
      "/media/users/01USER/01KEYKEYKEYKEYKEYKEYKEYKEY", // a different bucket
      "https://evil.example/media/learning/01TEAM/01KEY", // not ours at all
    ]) {
      standing({ body: `<img src="${stored}">` })
      const b = bucket()
      await updateLearning(b.env, CFG, GUARD, ACTOR, "01ITEM", {
        title: "How to do the thing",
        body: "<p>gone</p>",
      })
      expect(b.deletes, `must not delete for ${stored}`).toEqual([])
    }
  })

  it("a bucket that refuses the delete never costs the person their edit", async () => {
    standing({ body: `<img src="/media/learning/${OLD}">` })
    const env = {
      DB: {} as Env["DB"],
      LEARNING_MEDIA: {
        async delete() {
          throw new Error("R2 is having a day")
        },
      },
    } as unknown as Env
    await expect(
      updateLearning(env, CFG, GUARD, ACTOR, "01ITEM", { title: "How to do the thing", body: "" })
    ).resolves.toBeUndefined()
  })
})
