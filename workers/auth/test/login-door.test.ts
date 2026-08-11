// The login-code doors, source-locked (seam-test style — reads the real code off
// disk). Three security invariants that must never regress:
//   1. A login code appears NOWHERE but the user's inbox — no echo field, no
//      config var that could re-enable one, in any environment. Automated tests
//      sign in through the ADMIN test-login door instead (staging-only secret).
//   2. Every secret-guarded door FAILS CLOSED when its secret is unset.
//   3. The attempt cap is ATOMIC — the limit check and the increment are one
//      statement, so concurrent guesses can't each read a stale count.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

const SRC = join(__dirname, "..", "src")
const ROOT = join(__dirname, "..", "..", "..")
const index = readFileSync(join(SRC, "index.ts"), "utf8")
const emailChange = readFileSync(join(SRC, "lib", "email-change.ts"), "utf8")
const loginCodes = readFileSync(join(SRC, "lib", "login-codes.ts"), "utf8")

const authSources = (): string[] =>
  sourceFiles(SRC, { extensions: [".ts"] }).map((f) => f.source)

describe("no login code ever leaves through anything but the inbox", () => {
  it("the echo path AND its config var are gone from the auth worker", () => {
    for (const src of authSources()) expect(src).not.toContain("DEV_ECHO_CODES")
    // The var can't be re-enabled by configuration either.
    const wrangler = readFileSync(join(SRC, "..", "wrangler.jsonc"), "utf8")
    expect(wrangler).not.toContain("DEV_ECHO_CODES")
  })

  it("the send doors' success responses carry no code field", () => {
    // emailStart returns a bare ok — the code variable never reaches json().
    const start = index.slice(index.indexOf("async function emailStart"), index.indexOf("async function adminTestLogin"))
    expect(start).toContain("return json({ ok: true })")
    expect(start, "emailStart must never place a code in its response").not.toMatch(/json\(\{[^}]*code/i)
    // The email-change start door likewise.
    const changeStart = index.slice(index.indexOf("async function emailChangeStart"), index.indexOf("async function emailChangeVerify"))
    expect(changeStart).toContain("return json({ ok: true })")
    expect(changeStart).not.toMatch(/json\(\{[^}]*code/i)
    expect(emailChange).not.toContain("devCode")
  })

  it("the web client has no code-toast path left", () => {
    for (const f of [
      join(ROOT, "web", "components", "temp", "auth-card.tsx"),
      join(ROOT, "web", "components", "email-change-dialog.tsx"),
      join(ROOT, "web", "lib", "api.ts"),
    ])
      expect(readFileSync(f, "utf8"), `${f} must not reference devCode`).not.toContain("devCode")
  })

  it("the admin test-login door exists, shares the mint, and FAILS CLOSED", () => {
    const door = index.slice(index.indexOf("async function adminTestLogin"), index.indexOf("async function emailVerify"))
    // Fails closed on its OWN secret — deliberately NOT the shared ADMIN_KEY
    // maintenance key, which an operator sets on other workers in BOTH
    // environments (one mistyped directory would otherwise arm impersonation).
    expect(door).toContain("!env.TEST_LOGIN_KEY ||")
    expect(door, "the impersonation door must never share the maintenance key's name").not.toContain("env.ADMIN_KEY")
    // …and refuses outright on production, so the isolation is structural
    // rather than a sentence in a runbook.
    expect(door).toContain('env.ENVIRONMENT === "production"')
    // Same mint as the real send door — TTL/throttle/hashing can never drift.
    expect(door).toContain("mintLoginCode(")
    const start = index.slice(index.indexOf("async function emailStart"), index.indexOf("async function adminTestLogin"))
    expect(start).toContain("mintLoginCode(")
  })
})

describe("every internal door fails closed", () => {
  it("send-email, log-error and mcp-session all refuse when INTERNAL_KEY is unset", () => {
    for (const fn of ["internalSendEmail", "internalLogError", "internalMcpSession"]) {
      const start = index.indexOf(`async function ${fn}`)
      expect(start, `${fn} must exist`).toBeGreaterThan(-1)
      const body = index.slice(start, start + 600)
      expect(body, `${fn} must fail closed (!env.INTERNAL_KEY || …)`).toContain("!env.INTERNAL_KEY ||")
    }
  })
})

describe("the attempt cap is atomic", () => {
  it("login verify spends a try in the same statement that checks the budget", () => {
    // The cap and the spend are ONE statement (CONCURRENCY.md) — the check moved
    // from index.ts into the mint's own file, but it may never move back apart.
    expect(loginCodes).toMatch(
      /UPDATE login_codes SET attempts = attempts \+ 1\s+WHERE id = \? AND consumed_at IS NULL AND \$\{ATTEMPTS_LEFT\}/
    )
    // The burstable read-then-check gate is gone from both files.
    expect(index).not.toMatch(/row\.attempts >= MAX_CODE_ATTEMPTS/)
    expect(loginCodes).not.toMatch(/row\.attempts >= MAX_CODE_ATTEMPTS/)
  })

  // EARNED: the cap used to be one shared pool, so anyone who knew an email
  // address could burn five junk tries and lock its owner out of the product.
  it("the budget asks WHO is spending it — on both write paths", () => {
    // Two lanes, chosen inside the statement: all five for the address the code
    // was sent to, a small share for anyone else. A flat `attempts < ?` here is
    // the lockout, restored.
    expect(loginCodes).toContain(
      "attempts < (CASE WHEN sent_ip = ? THEN ? ELSE ? END)"
    )
    // Both halves carry it: charging a wrong guess AND consuming a right one —
    // or a brute-forcer who finally lands on the digits walks in past the cap.
    const spends = loginCodes.match(/\$\{ATTEMPTS_LEFT\}/g) ?? []
    expect(spends.length, "the charge and the consume must both carry the budget").toBe(2)
    // …and the consume carries `consumed_at IS NULL` too, exactly as the charge
    // above does. This line used to pin the statement WITHOUT it — a green test
    // holding a real race in place: the SELECT filtered on consumed_at and the
    // write didn't, so two verifies of one correct code both passed and ONE code
    // minted TWO sessions (double-submit.test.ts runs that race).
    expect(loginCodes).toMatch(
      /UPDATE login_codes SET consumed_at = \? WHERE id = \? AND consumed_at IS NULL AND \$\{ATTEMPTS_LEFT\}/
    )
  })

  it("the verify door owns no copy of the rules — it calls the one seam", () => {
    const door = index.slice(index.indexOf("async function emailVerify"), index.indexOf("async function emailChangeStart"))
    expect(door).toContain("verifyLoginCode(")
    expect(door, "the caller is named, so the try is charged to them").toContain("clientIp(request)")
    expect(door, "no second copy of the attempt cap may grow here").not.toContain("attempts")
  })

  it("email-change verify uses the same atomic pattern", () => {
    expect(emailChange).toContain(
      "UPDATE email_change_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed_at IS NULL"
    )
    expect(emailChange).not.toMatch(/row\.attempts >= MAX_CODE_ATTEMPTS/)
  })
})
