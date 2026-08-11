// Unit tests for the auth worker's pure logic (no network, no database).
import { describe, expect, it, vi } from "vitest"

import { randomCode, randomToken, sha256Hex } from "../src/lib/crypto"
import {
  isValidEmail,
  maskEmail,
  normalizeEmail,
  validateNewEmail,
} from "../src/lib/email"
import { ulid } from "@shared/workers/id"
import { dataUrlBytes, MAX_IMAGE_BYTES, parseDataUrl } from "@shared/workers/image"

describe("randomCode", () => {
  it("is always exactly 6 digits (zero-padded)", () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^\d{6}$/)
  })
})

describe("sha256Hex", () => {
  it("matches the known SHA-256 of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})

describe("randomToken", () => {
  it("is URL-safe and long enough", () => {
    const t = randomToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(43) // 32 bytes base64url
  })
})

describe("ulid", () => {
  it("is 26 chars and sorts by time", () => {
    const a = ulid(1_000_000_000_000)
    const b = ulid(2_000_000_000_000)
    expect(a).toHaveLength(26)
    expect(b).toHaveLength(26)
    expect(a < b).toBe(true)
  })
})

describe("email rules (same as the old Glide transformer)", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alaap@SwiftStruck.com ")).toBe("alaap@swiftstruck.com")
  })
  it("accepts real shapes, rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true)
    expect(isValidEmail("a.b+c@d-e.io")).toBe(true)
    expect(isValidEmail("nope")).toBe(false)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("a @b.co")).toBe(false)
  })
})

describe("validateNewEmail (email-change shape check)", () => {
  it("rejects a junk address", () => {
    expect(validateNewEmail("me@a.com", "nope")?.error).toBe("invalid_email")
  })
  it("rejects the same address (case/space-insensitive)", () => {
    expect(validateNewEmail("me@a.com", "  ME@A.com ")?.error).toBe("same_email")
  })
  it("accepts a valid, different address", () => {
    expect(validateNewEmail("me@a.com", "new@b.io")).toBeNull()
  })
})

describe("maskEmail (security notice)", () => {
  it("hides the local part, keeps the domain", () => {
    expect(maskEmail("alaap@swiftstruck.com")).toBe("a****@swiftstruck.com")
  })
  it("never reveals a one-letter local part", () => {
    expect(maskEmail("a@b.co")).toBe("a*@b.co")
  })
  it("returns junk unchanged (no @)", () => {
    expect(maskEmail("notanemail")).toBe("notanemail")
  })
})

// The profile door (POST /api/auth/profile) is on the client portal's allow-list
// and gates on the session alone, so it is the one image door a stranger with a
// login can hammer. It used to `atob()` whatever arrived and check the size of
// the RESULT — asking the worker to allocate the payload in order to decide it
// was too big. The byte count was always knowable from the encoded text.
describe("image bounds (measure before you decode)", () => {
  const dataUrl = (b64: string) => `data:image/png;base64,${b64}`

  it("counts the decoded bytes from the encoded text, padding and all", () => {
    for (const s of ["abc", "hi", "hello", "a longer sample string, still short"])
      expect(dataUrlBytes(dataUrl(btoa(s))), `wrong count for "${s}"`).toBe(s.length)
  })

  it("refuses an oversize image WITHOUT decoding it", () => {
    const spy = vi.spyOn(globalThis, "atob")
    // 4 base64 chars = 3 bytes, so this is ~3MB decoded — over the 2.5MB cap.
    const big = "A".repeat(4 * 1_000_000)
    expect(dataUrlBytes(dataUrl(big))).toBeGreaterThan(MAX_IMAGE_BYTES)
    expect(parseDataUrl(dataUrl(big)), "an oversize image must not parse").toBeNull()
    expect(
      spy,
      "the payload was DECODED before it was measured — the cap has to come first"
    ).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it("still parses a real image (the cap is a cap, not a wall)", () => {
    const out = parseDataUrl(dataUrl(btoa("PNG-ish bytes")))
    expect(out?.contentType).toBe("image/png")
    expect(out?.bytes.byteLength).toBe(13)
  })
})
