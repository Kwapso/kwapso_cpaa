// A 25 MB VIDEO IS NOT A SMALL IMAGE, AND /media/* USED TO SERVE BOTH THE SAME WAY.
//
// `serveMedia` read the whole object and answered 200, with no `Accept-Ranges` and
// no handling of `Range:`. A learning attachment may be a 25 MB clip (the upload
// door's own cap), so dragging a player's scrub bar re-downloaded the file from
// byte zero, every time, through the worker — and a download interrupted at 90%
// started again at 0%. R2 has supported ranged reads all along; the door simply
// never asked for one.
//
// These read the real function against a stub bucket, because the whole question
// is which bytes and which headers come back — and the wrong answer here is not an
// error, it is a 200 carrying a slice, which is the one reply a player cannot
// detect.

import { describe, expect, it } from "vitest"

import { serveMedia } from "@shared/workers/front-door"

const KEY = "T1/01J000000000000000000000"
const SIZE = 1000

/** A bucket holding ONE object, which records the range it was asked for and
 * answers the way R2 does — echoing back the range it actually served. */
function bucket() {
  const asked: unknown[] = []
  return {
    asked,
    get: (async (_key: string, options?: { range?: unknown }) => {
      asked.push(options?.range ?? null)
      const range = options?.range as
        | { offset?: number; length?: number; suffix?: number }
        | undefined
      return {
        body: null,
        size: SIZE,
        range,
        httpMetadata: { contentType: "video/mp4" },
      }
    }) as never,
  }
}

describe("uploaded media is seekable and resumable", () => {
  it("advertises ranges on a whole-object read, so a player knows it may ask", async () => {
    const b = bucket()
    const res = await serveMedia(b, `/media/${KEY}`, "/media/")
    expect(res.status).toBe(200)
    expect(res.headers.get("Accept-Ranges"), "without this a browser never asks").toBe("bytes")
    expect(b.asked[0], "no Range header means no range asked for").toBeNull()
  })

  it("a byte range comes back as 206, with Content-Range describing what was SENT", async () => {
    const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", "bytes=100-199")
    expect(res.status, "a 200 carrying a slice is the one answer a player cannot detect").toBe(206)
    expect(res.headers.get("Content-Range")).toBe(`bytes 100-199/${SIZE}`)
    expect(res.headers.get("Content-Length")).toBe("100")
  })

  it("an open-ended range runs to the end of the object", async () => {
    const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", "bytes=900-")
    expect(res.status).toBe(206)
    expect(res.headers.get("Content-Range")).toBe(`bytes 900-999/${SIZE}`)
    expect(res.headers.get("Content-Length")).toBe("100")
  })

  it("a suffix range names the bytes from the END — the one whose start is computed", async () => {
    const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", "bytes=-250")
    expect(res.status).toBe(206)
    expect(res.headers.get("Content-Range")).toBe(`bytes 750-999/${SIZE}`)
  })

  it("a range it cannot understand is served WHOLE, not wrongly", async () => {
    // Multi-range is legal HTTP that no media player sends, and a reversed range is
    // nonsense. Either way the honest reply is the entire object with a 200 — never
    // a 206 describing bytes nobody asked for.
    for (const header of ["bytes=0-10, 20-30", "bytes=500-100", "items=0-10", "bytes=-", "", "junk"]) {
      const b = bucket()
      const res = await serveMedia(b, `/media/${KEY}`, "/media/", header)
      expect(res.status, `"${header}" must not become a partial answer`).toBe(200)
      expect(b.asked[0], `"${header}" must not reach the bucket as a range`).toBeNull()
    }
  })

  it("the key is still validated at the boundary before any of this", async () => {
    // The range path must not become a way around safeMediaKey — a probe gets the
    // same 404 as a miss, and the bucket is never touched.
    const b = bucket()
    const res = await serveMedia(b, "/media/../secrets", "/media/", "bytes=0-99")
    expect(res.status).toBe(404)
    expect(b.asked.length, "a probe must not reach the bucket at all").toBe(0)
  })

  it("every media answer keeps its security headers, ranged or not", async () => {
    for (const header of [undefined, "bytes=0-99"]) {
      const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", header)
      expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox")
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
      expect(res.headers.get("Content-Type")).toBe("video/mp4")
      expect(res.headers.get("Cache-Control")).toContain("immutable")
    }
  })
})
