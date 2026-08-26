// parseUploadDataUrl is the upload boundary for learning files — it decides what
// bytes reach R2. It must accept inline-safe media, decode correctly, and refuse
// non-strings, malformed input, over-cap payloads, AND script-capable types (the
// stored-XSS boundary: the gateway serves these back on the app origin). These lock that.

import { describe, expect, it } from "vitest"

import { ANY_FILE_TYPE, NEUTRALISED_CONTENT_TYPE, parseUploadDataUrl, storedContentType } from "@shared/workers/image"

const b64 = (s: string) => btoa(s)

describe("parseUploadDataUrl", () => {
  it("parses a valid data URL into contentType + bytes", () => {
    const out = parseUploadDataUrl(`data:image/png;base64,${b64("hello")}`, 1000)
    expect(out?.contentType).toBe("image/png")
    expect(out && new TextDecoder().decode(out.bytes)).toBe("hello")
  })

  it("accepts non-image media types (video / audio / pdf)", () => {
    expect(parseUploadDataUrl(`data:video/mp4;base64,${b64("x")}`, 1000)?.contentType).toBe("video/mp4")
    expect(parseUploadDataUrl(`data:audio/mpeg;base64,${b64("x")}`, 1000)?.contentType).toBe("audio/mpeg")
    expect(parseUploadDataUrl(`data:application/pdf;base64,${b64("x")}`, 1000)?.contentType).toBe(
      "application/pdf"
    )
  })

  it("rejects script-capable types (the stored-XSS boundary): text/html, svg, xhtml", () => {
    expect(parseUploadDataUrl(`data:text/html;base64,${b64("<script>alert(1)</script>")}`, 9999)).toBeNull()
    expect(parseUploadDataUrl(`data:image/svg+xml;base64,${b64("<svg onload=alert(1)>")}`, 9999)).toBeNull()
    expect(
      parseUploadDataUrl(`data:application/xhtml+xml;base64,${b64("<html/>")}`, 9999)
    ).toBeNull()
  })

  it("rejects a non-string", () => {
    expect(parseUploadDataUrl(123, 1000)).toBeNull()
    expect(parseUploadDataUrl(null, 1000)).toBeNull()
    expect(parseUploadDataUrl({ data: "x" }, 1000)).toBeNull()
  })

  it("rejects a malformed data URL (no base64, no mime, junk)", () => {
    expect(parseUploadDataUrl("not a data url", 1000)).toBeNull()
    expect(parseUploadDataUrl("data:image/png,plain", 1000)).toBeNull()
    expect(parseUploadDataUrl("data:;base64,xxxx", 1000)).toBeNull()
  })

  it("enforces the max-size cap (over → null, under → ok)", () => {
    const big = b64("a".repeat(2000))
    expect(parseUploadDataUrl(`data:image/png;base64,${big}`, 100)).toBeNull()
    expect(parseUploadDataUrl(`data:image/png;base64,${big}`, 5000)).not.toBeNull()
  })
})

// THE WIDER TYPE RULE, and the two things that must stay true about it. The
// knowledge base takes any file from a person's desktop, so it passes
// `ANY_FILE_TYPE` — and that is only safe because it stores every byte with no
// renderable label (see NEUTRALISED_CONTENT_TYPE). What is locked here is that
// the widening is OPT-IN, and that it widens the TYPE and nothing else.
describe("parseUploadDataUrl: the opt-in type rule", () => {
  it("defaults to the inline-safe list, so no existing door widened", () => {
    expect(parseUploadDataUrl(`data:text/html;base64,${b64("<b>x</b>")}`, 9999)).toBeNull()
    expect(
      parseUploadDataUrl(
        `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${b64("PK")}`,
        9999
      )
    ).toBeNull()
  })

  it("takes any well-formed type when a door asks for one", () => {
    expect(
      parseUploadDataUrl(`data:application/zip;base64,${b64("PK")}`, 9999, ANY_FILE_TYPE)?.contentType
    ).toBe("application/zip")
    expect(
      parseUploadDataUrl(`data:text/html;base64,${b64("<b>x</b>")}`, 9999, ANY_FILE_TYPE)?.contentType
    ).toBe("text/html")
  })

  it("still refuses a malformed data URL and an over-cap payload — the SHAPE rule never moved", () => {
    expect(parseUploadDataUrl("data:;base64,xxxx", 9999, ANY_FILE_TYPE)).toBeNull()
    expect(parseUploadDataUrl("not a data url", 9999, ANY_FILE_TYPE)).toBeNull()
    expect(parseUploadDataUrl(123, 9999, ANY_FILE_TYPE)).toBeNull()
    expect(
      parseUploadDataUrl(`data:application/zip;base64,${b64("x".repeat(500))}`, 100, ANY_FILE_TYPE)
    ).toBeNull()
  })
})

// ── WHAT AN ATTACHMENT DOOR STORES, AND WHY IT CAN NOW TAKE ANYTHING ────────
//
// THE OWNER, 26 Aug 2026: attaching an .md to a ticket answered "That file
// didn't come through. Try again, up to 10MB." It was 4KB. The refusal was the
// TYPE — ticket and story attachments took inline-safe media only — and the
// sentence blamed a size that was never the problem, so the obvious next move
// (shrink the file) could never work.
//
// The narrow list guarded something real: the gateway serves an attachment back
// under its declared type on the SAME origin as the app, so a `text/html`
// upload is stored XSS. The knowledge base had already answered it the right
// way round — the boundary is HOW THE BYTES ARE STORED, not which are accepted.
// `storedContentType` is that rule, and these are the two halves of it.
describe("storedContentType: accepted widely, served safely", () => {
  it("neutralises every script-capable type", () => {
    // The three that matter, and the reason the list existed at all.
    for (const t of ["text/html", "application/xhtml+xml", "image/svg+xml"])
      expect(storedContentType(t), `${t} must never be served under its own type`).toBe(
        NEUTRALISED_CONTENT_TYPE
      )
  })

  it("neutralises everything else that is not inline-safe media", () => {
    for (const t of ["text/markdown", "text/csv", "application/zip", "application/json"])
      expect(storedContentType(t)).toBe(NEUTRALISED_CONTENT_TYPE)
  })

  it("leaves media and PDF under their own type, so a screenshot still opens in a tab", () => {
    // The half that keeps the feature pleasant. Neutralising these too would be
    // safe and would send every screenshot on every ticket to the Downloads
    // folder, which is a cure worse than the disease.
    for (const t of ["image/png", "image/jpeg", "image/webp", "video/mp4", "audio/mpeg", "application/pdf"])
      expect(storedContentType(t)).toBe(t)
  })

  it("both attachment doors pass ANY_FILE_TYPE and store through the rule", async () => {
    // Derived off the source, because the danger is one door being widened and
    // the other left behind — or, worse, a door widened WITHOUT the storage rule,
    // which is the exact shape of stored XSS.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    for (const f of ["help.ts", "stories.ts", "todos.ts"]) {
      const src = readFileSync(join(__dirname, "..", "src", "routes", f), "utf8")
      expect(src, `${f} must accept any type`).toMatch(/BYTES, ANY_FILE_TYPE/)
      expect(src, `${f} must store through storedContentType`).toContain(
        "contentType: storedContentType(parsed.contentType)"
      )
      expect(
        src.includes("httpMetadata: { contentType: parsed.contentType }"),
        `${f} stores an attachment under its declared type — that is stored XSS`
      ).toBe(false)
    }
  })

  it("every attachment door names the real reason, on all four", async () => {
    // A single sentence for three causes is how somebody spends ten minutes
    // shrinking a file that was never too big. Tickets, stories, to-dos and
    // tasks — all four take files, and all four used to blame size.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    for (const f of ["help.ts", "stories.ts", "todos.ts"]) {
      const src = readFileSync(join(__dirname, "..", "src", "routes", f), "utf8")
      expect(src, `${f} must say when a file is genuinely too big`).toContain("That file is over 10MB")
      expect(src, `${f} must measure before blaming size`).toContain("dataUrlBytes(body.fileDataUrl)")
      expect(
        src.includes("Try again, up to 10MB") || src.includes("isn't one we can take"),
        `${f} still carries a refusal that blames the wrong thing`
      ).toBe(false)
    }
  })
})

// A DOOR THAT WIDENED ITS TYPE RULE MUST NEUTRALISE WHAT IT STORES.
//
// The rule this whole file is about, said once over the SOURCE rather than once
// per door — because the danger has always been the NEXT door, not the ones
// somebody has already thought about. An object served back under a type the
// caller chose, on the app's own origin, is stored XSS.
//
// There are two safe shapes and the check knows both:
//   • the door keeps the DEFAULT inline-safe list (brand assets, staff files),
//     so `parsed.contentType` was already filtered before it was ever seen — and
//     that is right for those two: a logo and a staff photo are rendered as
//     <img>, so neutralising them would break the one thing they exist for;
//   • the door passes ANY_FILE_TYPE, and then every byte it writes must go out
//     through `storedContentType` or as NEUTRALISED_CONTENT_TYPE.
//
// What it forbids is the combination: widened AND storing the caller's word.
describe("a door that widened its type rule neutralises what it stores", () => {
  it("no widened door writes an unfiltered caller type", async () => {
    // Through the one roster read, not a hand-rolled walk — `source-scan` is the
    // seam every law here stands on, and a second way of finding files is a
    // second thing to keep honest.
    const { sourceFiles } = await import("@shared/rules/source-scan")
    const { join } = await import("node:path")
    const offenders: string[] = []
    let widened = 0
    let puts = 0
    for (const file of sourceFiles(join(__dirname, "..", "src", "routes"), { extensions: [".ts"] })) {
      const f = file.rel
      const src = file.source
      const isWide = src.includes("ANY_FILE_TYPE")
      if (isWide) widened++
      for (const m of src.matchAll(/httpMetadata:\s*\{\s*contentType:\s*([^}]+?)\s*\}/g)) {
        puts++
        if (!isWide) continue // the default list already filtered it
        const expr = m[1].trim()
        if (!expr.startsWith("storedContentType(") && expr !== "NEUTRALISED_CONTENT_TYPE")
          offenders.push(`${f}: ${expr}`)
      }
    }
    expect(
      offenders,
      `these doors take any file type AND store it under the caller's own word — ` +
        `that is stored XSS. Pass it through storedContentType(): ${offenders.join(", ")}`
    ).toEqual([])
    // Two tripwires: a scan that found no writes, or no widened door, passes
    // exactly like a clean one.
    expect(puts, "the R2-write census found nothing — it has gone blind").toBeGreaterThan(3)
    expect(widened, "no door takes any file type any more — re-point this check").toBeGreaterThan(2)
  })
})
