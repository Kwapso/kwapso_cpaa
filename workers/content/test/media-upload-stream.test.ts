// THE THREE MEDIA UPLOAD DOORS, STREAMED — learning media, staff files, brand
// assets. The knowledge base's streamed door has its own suite; these three are
// together because they are one shape with three buckets, and because the thing
// that separates them from the knowledge door is a SECURITY boundary that has to
// hold on all three.
//
// THE DIFFERENCE, AND WHY IT IS THE MAIN TEST HERE. The knowledge base stores
// every byte as `application/octet-stream`, so it can afford to accept any file at
// all — the label a browser would have to trust is never written down. These three
// serve the object BACK under the type the caller declared, because that is what
// makes an image render in an article. So a script-capable type (`text/html`,
// `image/svg+xml`) reaching R2 here would be stored XSS on the app's own origin,
// riding any viewer's session. `INLINE_SAFE_UPLOAD` is the boundary, and these
// tests are what say it did not get left behind when the parse did.
//
// The other three properties are the streamed door's own: the envelope is refused
// before anything expensive, the body reaches R2 UNREAD, and the key carries
// nothing the caller sent.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"

const ctx = vi.hoisted(() => ({
  guard: { teamId: "team01", databaseId: "db1", userId: "u1" },
  actor: { id: "u1", email: "a@b.c", name: "Ana" },
  cfg: {},
  portalRefused: false,
  gatedAs: [] as string[],
}))

vi.mock("@shared/workers/route", () => ({
  gated: async (_r: unknown, _e: unknown, module: string, right: string) => {
    ctx.gatedAs.push(`${module}:${right}`)
    return { guard: ctx.guard, actor: ctx.actor, cfg: ctx.cfg, user: {} }
  },
  gatedBody: async () => ({ guard: ctx.guard, actor: ctx.actor, cfg: ctx.cfg, user: {}, body: {} }),
}))

vi.mock("@shared/workers/account-scope", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refusePortalCaller: async () => {
    if (ctx.portalRefused) throw new Error("a client login was refused at the door")
  },
}))

import { postStreamLearningFile } from "../src/routes/learning"
import { postStreamStaffFile } from "../src/routes/staff"
import { postStreamBrandAsset } from "../src/routes/brand-assets"
import type { Env } from "../src/env"

function bucket() {
  const puts: { key: string; value: unknown; opts: Record<string, unknown> }[] = []
  return {
    puts,
    put: async (key: string, value: unknown, opts: Record<string, unknown>) => {
      puts.push({ key, value, opts })
    },
  }
}

/** Both buckets, so a door writing to the wrong shelf is visible rather than
 * merely passing. */
function envWith(learning: ReturnType<typeof bucket>, internal: ReturnType<typeof bucket>): Env {
  return { LEARNING_MEDIA: learning, INTERNAL_MEDIA: internal } as unknown as Env
}

function upload(opts: { length?: number; type?: string | null } = {}): Request {
  const headers = new Headers()
  headers.set("content-length", String(opts.length ?? 10))
  if (opts.type !== null) headers.set("content-type", opts.type ?? "image/png")
  return new Request("https://x/api/content/learning/upload-stream", {
    method: "POST",
    headers,
    body: new Blob(["bytes"]).stream(),
    // @ts-expect-error — undici requires this for a stream body
    duplex: "half",
  })
}

/** The three doors, each with the bucket it MUST write to and the URL prefix it
 * must hand back. Driven as a table so a new streaming door cannot be added with
 * one of these four facts left untested. */
const DOORS = [
  {
    name: "learning media",
    call: postStreamLearningFile,
    shelf: "learning" as const,
    prefix: "/media/learning/",
    gate: "learning:create",
  },
  {
    name: "staff files",
    call: postStreamStaffFile,
    shelf: "internal" as const,
    prefix: "/media/internal/",
    gate: "staff_profiles:edit",
  },
  {
    name: "brand assets",
    call: postStreamBrandAsset,
    shelf: "internal" as const,
    prefix: "/media/internal/",
    gate: "brand_assets:create",
  },
]

beforeEach(() => {
  ctx.portalRefused = false
  ctx.gatedAs = []
})

describe.each(DOORS)("$name, streamed", ({ call, shelf, prefix, gate }) => {
  const shelves = () => {
    const learning = bucket()
    const internal = bucket()
    return { learning, internal, env: envWith(learning, internal), of: (s: typeof shelf) => (s === "learning" ? learning : internal) }
  }

  it("refuses a file past the ceiling WITHOUT touching a bucket", async () => {
    const s = shelves()
    const res = await call(upload({ length: STREAM_UPLOAD_MAX_BYTES + 1 }), s.env)
    expect(res.status).toBe(413)
    expect(s.learning.puts, "nothing is written when the answer is no").toEqual([])
    expect(s.internal.puts).toEqual([])
    expect(await res.clone().text(), "the refusal names the size").toMatch(/90 MB/)
  })

  it("refuses an upload that does not say how big it is", async () => {
    const s = shelves()
    const res = await call(upload({ length: 0 }), s.env)
    expect(res.status).toBe(411)
  })

  it("opens with its own gate, on the write half", async () => {
    const s = shelves()
    await call(upload(), s.env)
    expect(ctx.gatedAs, "the right this door has always needed").toEqual([gate])
  })

  it("refuses a client login at the door (R21)", async () => {
    ctx.portalRefused = true
    const s = shelves()
    await expect(call(upload(), s.env)).rejects.toThrow(/client login/)
    expect(s.of(shelf).puts, "and writes nothing on the way out").toEqual([])
  })

  it("hands the REQUEST'S OWN stream to R2, unread, on the right shelf", async () => {
    const s = shelves()
    const req = upload()
    const body = req.body
    const res = await call(req, s.env)
    expect(res.status).toBe(200)
    const shelf_ = s.of(shelf)
    expect(shelf_.puts).toHaveLength(1)
    // The assertion the door exists for: not "a stream was passed" but "the
    // request's own stream was passed". Anything that buffered the bytes and
    // re-wrapped them would look identical here and mean the opposite.
    expect(shelf_.puts[0].value, "the body goes straight through, never through a variable").toBe(body)
    const { url } = (await res.json()) as { url: string }
    expect(url.startsWith(prefix), "served back from the shelf it was written to").toBe(true)
  })

  it("keeps the declared type, because this object IS served back under it", async () => {
    const s = shelves()
    await call(upload({ type: "video/mp4" }), s.env)
    // Unlike the knowledge door, which neutralises every byte: an article's clip
    // has to come back as a video or it will not play.
    expect(s.of(shelf).puts[0].opts.httpMetadata).toEqual({ contentType: "video/mp4" })
  })

  it("the key is the team plus a random segment — never the caller's words", async () => {
    const s = shelves()
    await call(upload(), s.env)
    const key = s.of(shelf).puts[0].key
    expect(key.startsWith("team01/")).toBe(true)
    expect(key.split("/")).toHaveLength(2)
    // `/media/*` is served with no session, so the key IS the credential and must
    // not be derivable from an id the caller has already seen.
    expect(key.split("/")[1].length, "a ULID's worth of unguessable tail").toBeGreaterThan(20)
  })

  // THE ONE THAT MATTERS MOST. The parse is gone; the allow-list must not have
  // gone with it. Each of these is a real stored-XSS payload if it reaches R2
  // under its own type on the app's origin.
  it.each(["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", ""])(
    "REFUSES a script-capable type (%s) and writes nothing",
    async (type) => {
      const s = shelves()
      const res = await call(upload({ type: type || null }), s.env)
      expect(res.status).toBe(400)
      expect(s.learning.puts, "stored XSS would be one put away").toEqual([])
      expect(s.internal.puts).toEqual([])
    }
  )

  it("accepts the types an article actually carries", async () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "video/mp4", "audio/mpeg", "application/pdf"]) {
      const s = shelves()
      const res = await call(upload({ type }), s.env)
      expect(res.status, `${type} must be allowed`).toBe(200)
    }
  })

  it("ignores parameters on the content type — 'image/png; charset=x' is image/png", async () => {
    const s = shelves()
    const res = await call(upload({ type: "image/png; charset=utf-8" }), s.env)
    expect(res.status).toBe(200)
    expect(s.of(shelf).puts[0].opts.httpMetadata).toEqual({ contentType: "image/png" })
  })
})
