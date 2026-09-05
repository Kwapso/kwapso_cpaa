// THE STREAMED UPLOAD DOOR — the one that took the 25 MB ceiling off the
// knowledge base by not holding the file.
//
// What is worth testing here is not "does a file arrive" (that is R2's job) but
// the four ways this door could quietly undo the thing it was built for, or give
// something away while doing it:
//
//   • BUFFERING IT ANYWAY. The whole change is that the body is handed to R2 as a
//     stream. If anything in this handler awaits the bytes first, the ceiling is
//     back and nothing in the shape of the code says so — so the test asserts the
//     REQUEST'S OWN STREAM object reaches `put`, unread.
//   • VALIDATING LESS BECAUSE THE FIELDS MOVED. The metadata left a JSON body for
//     a query string. R20 applies identically, and a door that skipped it would
//     look exactly like this one.
//   • LABELLING THE BYTES WITH WHAT THE CALLER SAID. An object served back on the
//     app's own origin must never carry a renderable type.
//   • PUTTING THE CALLER'S WORDS IN THE KEY. `/media/*` is served with no session,
//     so the key IS the credential.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { KNOWLEDGE_EXTRACT_MAX_BYTES, STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"

const ctx = vi.hoisted(() => ({
  guard: { teamId: "team01", databaseId: "db1", userId: "u1" },
  actor: { id: "u1", email: "a@b.c", name: "Ana" },
  cfg: {},
  refused: false,
  created: null as Record<string, unknown> | null,
  published: [] as unknown[],
  extractCalls: 0,
}))

vi.mock("@shared/workers/route", () => ({
  gated: async () => ({ guard: ctx.guard, actor: ctx.actor, cfg: ctx.cfg, user: {} }),
  gatedBody: async () => ({ guard: ctx.guard, actor: ctx.actor, cfg: ctx.cfg, user: {}, body: {} }),
}))

vi.mock("@shared/workers/account-scope", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refusePortalCaller: async () => {
    if (ctx.refused) throw new Error("portal caller refused")
  },
}))

vi.mock("@shared/workers/realtime", () => ({
  publishChange: async (...args: unknown[]) => {
    ctx.published.push(args)
  },
}))

vi.mock("../src/lib/knowledge", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileSource: async (_e: unknown, _c: unknown, _g: unknown, _a: unknown, input: Record<string, unknown>) => {
    ctx.created = input
    return "src01"
  },
  getSource: async () => ({ id: "src01", title: "t" }),
  countSources: async () => 1,
}))

vi.mock("../src/lib/knowledge-files", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  extractFile: async () => {
    ctx.extractCalls++
    return { text: "the words", note: null }
  },
}))

import { postStreamKnowledgeFile } from "../src/routes/knowledge"
import type { Env } from "../src/env"

/** A stand-in R2 bucket that remembers exactly what it was handed. */
function bucket() {
  const puts: { key: string; value: unknown; opts: Record<string, unknown> }[] = []
  return {
    puts,
    put: async (key: string, value: unknown, opts: Record<string, unknown>) => {
      puts.push({ key, value, opts })
    },
    get: async () => ({ arrayBuffer: async () => new TextEncoder().encode("stored bytes").buffer }),
  }
}

function envWith(b: ReturnType<typeof bucket>): Env {
  return { INTERNAL_MEDIA: b } as unknown as Env
}

/** A request whose body is a real stream, with a declared length. */
function upload(
  query: string,
  opts: { length: number; type?: string | null; body?: BodyInit | null } = { length: 10 }
): Request {
  const headers = new Headers()
  headers.set("content-length", String(opts.length))
  if (opts.type !== null) headers.set("content-type", opts.type ?? "application/pdf")
  return new Request(`https://x/api/content/knowledge/upload-stream?${query}`, {
    method: "POST",
    headers,
    body: opts.body === undefined ? new Blob(["hello"]).stream() : opts.body,
    // @ts-expect-error — undici requires this for a stream body
    duplex: "half",
  })
}

beforeEach(() => {
  ctx.refused = false
  ctx.created = null
  ctx.published = []
  ctx.extractCalls = 0
})

describe("the streamed knowledge upload: the envelope, before anything expensive", () => {
  it("refuses a file past the ceiling WITHOUT touching the bucket", async () => {
    const b = bucket()
    const res = await postStreamKnowledgeFile(
      upload("fileName=big.zip", { length: STREAM_UPLOAD_MAX_BYTES + 1 }),
      envWith(b)
    )
    expect(res.status).toBe(413)
    expect(b.puts, "nothing may be written when the answer is no").toEqual([])
    // The refusal must say the size, because "too big" with no number is a dead end.
    expect(await res.clone().text()).toMatch(/90 MB/)
  })

  it("refuses an upload that does not say how big it is", async () => {
    const res = await postStreamKnowledgeFile(upload("fileName=x.pdf", { length: 0 }), envWith(bucket()))
    expect(res.status).toBe(411)
  })

  it("refuses a file that does not say what it is", async () => {
    const res = await postStreamKnowledgeFile(
      upload("fileName=x.pdf", { length: 10, type: null }),
      envWith(bucket())
    )
    expect(res.status).toBe(400)
  })
})

describe("the streamed knowledge upload: R20 still applies to the query string", () => {
  it("a missing file name is a clean 400, not a 500", async () => {
    const res = await postStreamKnowledgeFile(upload(""), envWith(bucket()))
    expect(res.status).toBe(400)
  })

  it("an over-long field is a clean 400 — the cap did not move with the field", async () => {
    // The metadata moved from a validated JSON body to a query string. If that
    // move had left the validation seam behind, this would be a 500 (or worse, a
    // 200 with a title nothing can store).
    let thrown: unknown
    try {
      await postStreamKnowledgeFile(upload(`fileName=${"a".repeat(5000)}`), envWith(bucket()))
    } catch (e) {
      thrown = e
    }
    const status = (thrown as { status?: number } | undefined)?.status
    expect(thrown, "an over-long query value must be refused at the boundary").toBeDefined()
    expect(status, "…as a 400, the way GuardError maps it").toBe(400)
  })
})

describe("the streamed knowledge upload: it does not hold the file", () => {
  it("hands the REQUEST'S OWN stream to R2, unread", async () => {
    const b = bucket()
    const req = upload("fileName=contract.pdf&title=The%20contract")
    const body = req.body
    const res = await postStreamKnowledgeFile(req, envWith(b))
    expect(res.status).toBe(200)
    expect(b.puts).toHaveLength(1)
    // THE ASSERTION THE WHOLE DOOR EXISTS FOR. Not "a stream was passed" but
    // "the request's own stream was passed" — anything that had buffered the
    // bytes and re-wrapped them would fail here while looking identical.
    expect(b.puts[0].value, "the body must go straight through, never through a variable").toBe(body)
  })

  it("stores the bytes with NO renderable label, whatever the caller declared", async () => {
    const b = bucket()
    await postStreamKnowledgeFile(
      upload("fileName=evil.html", { length: 10, type: "text/html" }),
      envWith(b)
    )
    // text/html is accepted as a LABEL on the row — the knowledge base takes any
    // file — but the object is written neutral, so `/media/*` can never serve it
    // as a page on the app's own origin.
    expect(b.puts[0].opts.httpMetadata).toEqual({ contentType: "application/octet-stream" })
    const stored = ctx.created?.file as { type: string } | undefined
    expect(stored?.type, "the declared type survives as a label").toBe("text/html")
  })

  it("the key carries the team and a random segment — never the caller's words", async () => {
    const b = bucket()
    await postStreamKnowledgeFile(upload("fileName=..%2F..%2Fetc%2Fpasswd"), envWith(b))
    const key = b.puts[0].key
    expect(key.startsWith("team01/knowledge/"), "the team AND the module own the prefix").toBe(true)
    expect(key).not.toContain("..")
    expect(key).not.toContain("passwd")
    // `/media/*` is served with no session, so the key IS the credential: it must
    // not be derivable from anything the caller has seen. The middle segment is
    // the MODULE, so a reclaim on another module's door can never prove ownership
    // of this object — four modules used to share the bare `team01/` prefix.
    expect(key.split("/")).toHaveLength(3)
    expect(key.split("/")[1]).toBe("knowledge")
    expect(key.split("/")[2].length, "a ULID's worth of unguessable tail").toBeGreaterThan(20)
  })
})

describe("the streamed knowledge upload: storing and READING are separate questions", () => {
  it("reads a file within the extract ceiling", async () => {
    await postStreamKnowledgeFile(
      upload("fileName=small.pdf", { length: KNOWLEDGE_EXTRACT_MAX_BYTES - 1 }),
      envWith(bucket())
    )
    expect(ctx.extractCalls).toBe(1)
    const got = ctx.created?.extract as { text: string } | undefined
    expect(got?.text).toBe("the words")
  })

  it("STORES a file past the extract ceiling and says it was not read", async () => {
    const b = bucket()
    await postStreamKnowledgeFile(
      upload("fileName=huge.zip", { length: KNOWLEDGE_EXTRACT_MAX_BYTES + 1 }),
      envWith(b)
    )
    // Kept, listed, and honest about it — the existing promise of this feature,
    // now reaching files that could not previously be uploaded at all.
    expect(b.puts, "the file is still stored").toHaveLength(1)
    expect(ctx.extractCalls, "conversion needs the bytes, so it is not attempted").toBe(0)
    const extract = ctx.created?.extract as { text: string | null; note: string | null } | undefined
    expect(extract?.text).toBeNull()
    expect(extract?.note, "the row says why there are no words").toBeTruthy()
    expect(ctx.published, "and the row is still published (R1)").toHaveLength(1)
  })
})
