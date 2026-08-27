// A 25 MB VIDEO IS NOT A SMALL IMAGE, AND /media/* USED TO SERVE BOTH THE SAME WAY.
//
// `serveMedia` read the whole object and answered 200, with no `Accept-Ranges` and
// no handling of `Range:`. A knowledge-base file may be a 25 MB clip (the upload
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
 * answers THE WAY R2 MEASURABLY DOES — which is not the way this stub used to.
 *
 * IT USED TO ECHO BACK the very object `byteRange` had just built: a clean union
 * carrying only the keys we set. That made every case here a test of our own
 * parser round-tripping through a mirror, and it is why this suite was green
 * while `/media/*` served `content-range: bytes NaN-NaN/2810365` in production —
 * every ranged read, every shape, for as long as ranges have existed here.
 *
 * What R2 really hands back carries ALL THREE KEYS with `undefined` values: it
 * does not say which slice it sent. That was established by measuring staging
 * across four request shapes and reproducing all four exactly against this
 * shape; the one rival hypothesis (accessors on a prototype, which `in` also
 * finds) was ruled out because it leaves the suffix case correct and production
 * had it broken too. `reports` lets a case ask for the other world — a runtime
 * that DOES report a narrowed slice — because the door must still believe one. */
function bucket(reports?: { offset?: number; length?: number; suffix?: number }) {
  const asked: unknown[] = []
  return {
    asked,
    get: (async (_key: string, options?: { range?: unknown }) => {
      asked.push(options?.range ?? null)
      return {
        body: null,
        size: SIZE,
        // The real answer: every key present, none of them holding anything.
        range: options?.range
          ? (reports ?? { offset: undefined, length: undefined, suffix: undefined })
          : undefined,
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

  it("REPRODUCES THE PRODUCTION BUG when the door reads key presence instead of a number", async () => {
    // The regression lock, stated as the thing that actually happened rather than
    // as an abstraction. `in` finds a key whose value is `undefined`, so the old
    // code took the SUFFIX branch for every request of every shape and computed
    // `size - undefined`. Staging answered `bytes NaN-NaN/2810365` to all four
    // shapes below; this suite was green throughout, because its stub echoed our
    // own parser back at us.
    for (const [header, expected] of [
      ["bytes=100-199", `bytes 100-199/${SIZE}`],
      ["bytes=900-", `bytes 900-999/${SIZE}`],
      ["bytes=-250", `bytes 750-999/${SIZE}`],
      ["bytes=0-0", `bytes 0-0/${SIZE}`],
    ] as const) {
      const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", header)
      expect(res.headers.get("Content-Range"), `${header} must name real bytes`).toBe(expected)
      expect(res.headers.get("Content-Range")).not.toContain("NaN")
    }
  })

  it("believes a runtime that DOES report the slice it sent, and narrows to it", async () => {
    // The premise the old code was written on is still honoured where it holds:
    // R2 may narrow a request, and a runtime that says so must be believed over
    // what we asked for. Asked for 900 bytes, told 100 were sent.
    const res = await serveMedia(
      bucket({ offset: 100, length: 100 }),
      `/media/${KEY}`,
      "/media/",
      "bytes=100-999"
    )
    expect(res.headers.get("Content-Range")).toBe(`bytes 100-199/${SIZE}`)
    expect(res.headers.get("Content-Length")).toBe("100")
  })

  it("never names a byte the object does not have", async () => {
    // A header may not run past the end however its numbers were arrived at —
    // the ask, a narrowed report, or a clamp of either.
    const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", `bytes=${SIZE - 10}-999999`)
    expect(res.headers.get("Content-Range")).toBe(`bytes ${SIZE - 10}-${SIZE - 1}/${SIZE}`)
    expect(res.headers.get("Content-Length")).toBe("10")
  })

  it("serves WHOLE rather than emit a 206 it cannot describe", async () => {
    // A start at or past the end leaves no slice to name. A Content-Range a
    // client cannot parse is worse than no range at all: the player would hold a
    // partial body and a header that does not say which part it is.
    const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", `bytes=${SIZE}-`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Range")).toBe(null)
  })

  it("a HEAD answers the GET's headers and no body — the question a player asks FIRST", async () => {
    // Measured on staging: `curl -I` on a /media URL came back 404 with
    // `content-type: text/html` while the GET beside it served the file. The four
    // route guards read `method === "GET"`, so a HEAD fell past them into the SPA
    // shell. A player learns a file's size and type with a HEAD before it decides
    // how to fetch it, and a door that 404s the question while answering the
    // follow-up looks fine right up until something asks in the ordinary order.
    for (const header of [undefined, "bytes=100-199"] as const) {
      const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", header, "HEAD")
      expect(res.status, "a HEAD must answer what the GET would").toBe(header ? 206 : 200)
      expect(res.headers.get("Content-Type")).toBe("video/mp4")
      expect(res.headers.get("Accept-Ranges")).toBe("bytes")
      // The whole point of the method: the headers, without the bytes.
      expect(await res.text(), "a HEAD carries no body").toBe("")
    }
    // …and the range headers still describe the slice, so a player can plan.
    const ranged = await serveMedia(bucket(), `/media/${KEY}`, "/media/", "bytes=100-199", "HEAD")
    expect(ranged.headers.get("Content-Range")).toBe(`bytes 100-199/${SIZE}`)
  })

  it("a GET is unchanged by the method now being passed", async () => {
    // The parameter is optional and both existing callers pass a real method, so
    // this pins that neither reading changed the ordinary answer.
    for (const method of [undefined, "GET"] as const) {
      const res = await serveMedia(bucket(), `/media/${KEY}`, "/media/", "bytes=100-199", method)
      expect(res.status).toBe(206)
      expect(res.headers.get("Content-Range")).toBe(`bytes 100-199/${SIZE}`)
    }
  })

  it("is correct WHATEVER shape the runtime answers with — the fix does not rest on the diagnosis", async () => {
    // The measurement said R2 returns all three keys holding `undefined`, and
    // that reproduced production exactly. But a diagnosis is a belief about
    // another runtime, and this door should not depend on mine being right — a
    // Cloudflare change, a different binding or a local emulator may answer
    // differently. So every plausible shape is run through the same ask and must
    // produce the same true header.
    const shapes: [string, unknown][] = [
      ["all keys undefined (measured)", { offset: undefined, length: undefined, suffix: undefined }],
      ["the clean union this suite used to assume", { offset: 100, length: 100 }],
      // Read literally this says "from 100 to the end"; against an ask of
      // 100 bytes the ask is the ceiling, because R2 cannot send more than it
      // was asked for. This case is what put that rule in the door.
      ["only the keys it used", { offset: 100 }],
      ["an empty object", {}],
      ["nothing at all", undefined],
      ["nulls rather than undefined", { offset: null, length: null, suffix: null }],
      ["garbage in the fields", { offset: "100", length: NaN, suffix: Infinity }],
    ]
    for (const [what, range] of shapes) {
      const b = {
        get: (async () => ({ body: null, size: SIZE, range, httpMetadata: { contentType: "video/mp4" } })) as never,
      }
      const res = await serveMedia(b, `/media/${KEY}`, "/media/", "bytes=100-199")
      expect(res.headers.get("Content-Range"), `${what} must still name real bytes`).toBe(
        `bytes 100-199/${SIZE}`
      )
      expect(res.headers.get("Content-Length"), what).toBe("100")
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
