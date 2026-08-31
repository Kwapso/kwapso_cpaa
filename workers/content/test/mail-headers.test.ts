// WHAT THE APP ACTUALLY PUTS ON THE WIRE when it sends a mail — the header half,
// which had no test and no reader for as long as the door has existed.
//
// ── THE BUG THIS LOCKS SHUT ──────────────────────────────────────────────────
//
// MIME headers are SEVEN-BIT. The `Content-Type: …; charset=UTF-8` the encoder
// writes two lines further down describes the BODY and says nothing about the
// headers — which is exactly why nobody caught it: the message is correctly
// declared, for the half that was never broken. A subject with one non-ASCII
// character in it went out as raw UTF-8 bytes in a header field, and every
// receiver falls back to Latin-1/CP1252 there.
//
// MEASURED ON STAGING, 31 Aug 2026, in the knowledge base itself — because the
// app sends the mail and the Gmail sweep then files it back:
//   sent    "kwapso sweep 2026-08-17T12-50-42-898Z — sweep"   (scripts/google-sweep.mjs)
//   stored  "kwapso sweep 2026-08-17T12-50-42-898Z Ã¢Â€Â” sweep"
//   reply   "Re: kwapso sweep … ÃƒÂƒÃ‚Â¢ÃƒÂ‚Ã¢Â‚Â¬ÃƒÂ‚Ã¢Â€Â  sweep"
//
// The reply carrying MORE layers than the message is the signature: each round
// trip mangles what the last one mangled. And the em dash is the least of it —
// a client named Zöllner or Dauerbäck had their own name mangled in the subject
// line of every mail this app sent them.
//
// This suite asserts on BYTES, because that is the thing that was wrong. A test
// that round-tripped through our own encoder would agree with itself.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { gmailSend } from "../src/lib/google-api"

/** The `raw` the door handed Gmail, back as the bytes an MTA would receive. */
let wire = ""

beforeEach(() => {
  wire = ""
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const raw = JSON.parse(String(init.body)).raw as string
      const b64 = raw.replaceAll("-", "+").replaceAll("_", "/")
      wire = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))
      return new Response(JSON.stringify({ id: "M1", threadId: "T1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
  )
})

/** One LOGICAL header, continuations and all. A folded value is several physical
 * lines and only the first begins in column one, so splitting on CRLF alone
 * returns a truncated header and every assertion below would be made about the
 * first 45 bytes of it. */
const headerLine = (name: string) =>
  wire
    .slice(0, wire.indexOf("\r\n\r\n"))
    .split(/\r\n(?![ \t])/)
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`)) ?? ""

/** Every byte of a header line, as a receiving MTA sees them. `wire` is a binary
 * string, so a char code above 127 IS a raw high byte. */
const highBytes = (line: string) => [...line].map((c) => c.charCodeAt(0)).filter((b) => b > 127)

describe("a mail's headers survive the wire", () => {
  it("a non-ASCII subject goes out as an encoded word, not as raw high bytes", async () => {
    await gmailSend("tok", {
      to: "marco@assecuranz.example",
      subject: "kwapso sweep 2026-08-17T12-50-42-898Z — sweep",
      body: "hi",
    })
    const subject = headerLine("Subject")
    // THE ASSERTION THAT WOULD HAVE CAUGHT IT: not one byte above 127 in a
    // header. Before the fix this line carried E2 80 94.
    expect(highBytes(subject), "no raw high bytes in a MIME header").toEqual([])
    expect(subject).toContain("=?UTF-8?B?")
    // …and it still says what it said. Decoded back the way a receiver does.
    const decoded = subject
      .slice("Subject: ".length)
      .split(/\r\n /)
      .map((w) => {
        const b = atob(w.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, ""))
        return Uint8Array.from([...b].map((c) => c.charCodeAt(0)))
      })
    const joined = new Uint8Array(decoded.reduce<number[]>((a, p) => [...a, ...p], []))
    expect(new TextDecoder().decode(joined)).toBe(
      "kwapso sweep 2026-08-17T12-50-42-898Z — sweep"
    )
  })

  it("a client's own name in a subject survives too", async () => {
    await gmailSend("tok", { to: "x@y.example", subject: "Angebot für Marco Zöllner", body: "hi" })
    expect(highBytes(headerLine("Subject"))).toEqual([])
  })

  it("a long non-ASCII subject splits on a CHARACTER boundary, never mid-character", async () => {
    // An encoded word may not exceed 75 characters, so a long value becomes
    // several joined by a fold. Splitting the UTF-8 BYTES anywhere would be
    // fixing this bug and re-introducing it one layer down, so the pieces are
    // decoded and rejoined here and must equal the original exactly.
    const subject = `Zusammenfassung — ${"Prüfung der Verträge ".repeat(6)}Ende`
    await gmailSend("tok", { to: "x@y.example", subject, body: "hi" })
    const line = headerLine("Subject")
    expect(highBytes(line)).toEqual([])
    const words = line.slice("Subject: ".length).split(/\r\n /)
    expect(words.length, "long enough to need more than one word").toBeGreaterThan(1)
    const bytes: number[] = []
    for (const w of words) {
      const b = atob(w.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, ""))
      for (const c of b) bytes.push(c.charCodeAt(0))
    }
    expect(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(bytes))).toBe(subject)
    for (const w of words) expect(w.length, "an encoded word stays under 75 chars").toBeLessThanOrEqual(75)
  })

  it("a plain ASCII subject is left exactly as it was", async () => {
    // Encoding these too would change every mail the app has ever sent, for no
    // gain, and an encoded word is harder for a person reading raw source.
    await gmailSend("tok", { to: "x@y.example", subject: "Your invoice is ready", body: "hi" })
    expect(headerLine("Subject")).toBe("Subject: Your invoice is ready")
  })

  it("the address is never wrapped in an encoded word", async () => {
    // An encoded word may not wrap an ADDRESS — only a display name beside one —
    // so encoding the whole value hides `<addr@host>` from the receiving parser
    // and the mail is not delivered at all. That is strictly worse than a
    // mangled name, which is why `To:` is deliberately left alone.
    await gmailSend("tok", { to: "marco@assecuranz.example", subject: "hi", body: "hi" })
    expect(headerLine("To")).toBe("To: marco@assecuranz.example")
  })

  it("the body still carries its own characters, under the charset it declares", async () => {
    await gmailSend("tok", { to: "x@y.example", subject: "hi", body: "Grüße — kwapso" })
    expect(wire).toContain("Content-Type: text/plain; charset=UTF-8")
    const body = wire.slice(wire.indexOf("\r\n\r\n") + 4)
    const bytes = Uint8Array.from([...body].map((c) => c.charCodeAt(0)))
    expect(new TextDecoder().decode(bytes)).toBe("Grüße — kwapso")
  })
})
