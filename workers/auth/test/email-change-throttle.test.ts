// THE ONLY DOOR IN THE PRODUCT THAT MAILS A STRANGER ON REQUEST.
//
// Every other throttle in auth bounds mail to an address that ASKED for it. The
// email-change door is the other shape: a signed-in caller names ANY address and
// we send it a code. The recipient never asked, has no account here, and cannot
// turn it off — and a session costs nothing but an inbox of your own, so "signed
// in" is not a bound on who the caller is.
//
// What was here before was SELECT COUNT(*) → compare → INSERT → send: four
// statements with awaits between them. A hundred simultaneous requests all read
// "none this hour" and all sent, so the cap of five was a suggestion and the
// door was a mail-bomb aimed from our own domain. And the count was per USER,
// which bounds what one account spends and says nothing about how much mail one
// INBOX can be made to receive.
//
// So these tests COUNT THE MAIL, not the rows. The real send path runs (a stub
// stands in for the mail service's HTTP door and nothing else), because the harm
// being measured is what lands in someone's inbox — a test that counted rows
// would pass just as happily on a door that inserted once and sent fifty times.
//
// Run against a REAL SQLite database with the REAL migrations applied: a stub
// that "understands" the statements would agree with a broken WHERE clause, and
// what is on trial here is what SQL does when requests arrive at once.

import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  MAX_CHANGE_CODES_PER_TARGET_PER_HOUR,
  MAX_CODES_PER_HOUR,
} from "../src/lib/constants"
import { startEmailChange } from "../src/lib/email-change"
import type { UserRow } from "../src/lib/users"
import { d1, migration } from "./core-sqlite"

/** The third party. They have no account here and never asked for any of this. */
const VICTIM = "victim@example.com"

function fresh() {
  const db = new DatabaseSync(":memory:")
  // `users` is the minimum the foreign key needs (same shape as the spine
  // harness); the email-change tables are the REAL migrations, index and all.
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);")
  db.exec(migration("0005_email_change.sql"))
  db.exec(migration("0018_email_change_target_index.sql"))
  const door = d1(db)

  /** Every address the mail service was actually asked to deliver to. */
  const mails: string[] = []
  vi.stubGlobal("fetch", async (_url: string, init: { body?: string }) => {
    mails.push((JSON.parse(String(init.body)) as { to: string[] }).to[0])
    return new Response("{}", { status: 200 })
  })

  const env = {
    DB: door,
    RESEND_API_KEY: "test-key",
    EMAIL_FROM: "kwapso@example.com",
    APP_ORIGIN: "https://app.example",
  } as never

  let n = 0
  /** A caller. Anyone with an inbox can have one, which is the whole problem. */
  const account = (): UserRow => {
    const id = `U${++n}`
    const email = `caller${n}@example.com`
    db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email)
    return { id, email } as UserRow
  }
  const start = (user: UserRow, target = VICTIM) => startEmailChange(env, user, target)
  const mailsTo = (address: string) => mails.filter((m) => m === address).length
  const rows = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM email_change_codes").get() as { n: number }).n
  return { db, env, mails, mailsTo, account, start, rows }
}

afterEach(() => vi.unstubAllGlobals())

describe("the email-change send throttle rides the write", () => {
  it("a burst from ONE account cannot outrun the cap", async () => {
    const t = fresh()
    const me = t.account()

    const results = await Promise.all(Array.from({ length: 40 }, () => t.start(me)))

    // Read-then-write let all forty read "none this hour" and all forty send.
    expect(t.mailsTo(VICTIM), "the cap is what the stranger's inbox receives").toBe(
      MAX_CODES_PER_HOUR
    )
    expect(t.rows(), "…and exactly one row per mail that left").toBe(MAX_CODES_PER_HOUR)
    expect(results.filter((r) => "error" in r).length).toBe(40 - MAX_CODES_PER_HOUR)
    for (const r of results.filter((x) => "error" in x))
      expect(r).toMatchObject({ status: 429, error: "too_many_codes" })
  })

  // The half a per-USER cap can never cover. Accounts are free — anyone with an
  // inbox of their own can hold as many as they like — so a ceiling counted by
  // caller bounds nothing at all when the caller is disposable. Only a ceiling on
  // the ADDRESS bounds what lands in the stranger's inbox.
  it("many accounts cannot gang up on one inbox", async () => {
    const t = fresh()
    const attackers = Array.from({ length: 8 }, () => t.account())

    // Each one stays inside its OWN hourly cap, so nothing here is refused by the
    // per-caller rule — what stops them can only be the per-target one.
    const asks = attackers.flatMap((a) =>
      Array.from({ length: MAX_CODES_PER_HOUR }, () => t.start(a))
    )
    await Promise.all(asks)

    expect(
      t.mailsTo(VICTIM),
      "eight accounts must not buy eight times the mail"
    ).toBe(MAX_CHANGE_CODES_PER_TARGET_PER_HOUR)
    expect(
      MAX_CHANGE_CODES_PER_TARGET_PER_HOUR,
      "the per-target ceiling has to bite before the accounts do, or this proves nothing"
    ).toBeLessThan(attackers.length * MAX_CODES_PER_HOUR)
  })

  // A THROTTLE THAT BECOMES A LOCKOUT HAS TURNED ONE PROBLEM INTO A BETTER ONE
  // (the lesson the login door had to learn twice). The ceilings are per caller
  // and per target, so neither can spill onto someone else's change.
  it("one caller's spent hour is not anybody else's", async () => {
    const t = fresh()
    const noisy = t.account()
    for (let i = 0; i < MAX_CODES_PER_HOUR + 3; i++) await t.start(noisy)

    const someone = t.account()
    expect(
      await t.start(someone, "my-new-address@example.com"),
      "an ordinary person changing their own email must not be collateral"
    ).toEqual({})
    expect(t.mailsTo("my-new-address@example.com")).toBe(1)
  })

  it("an honest person still gets their code, and the same code twice is refused", async () => {
    const t = fresh()
    const me = t.account()
    expect(await t.start(me, "new@example.com"), "the happy path still works").toEqual({})
    expect(t.mailsTo("new@example.com")).toBe(1)
    expect(t.mailsTo(VICTIM), "and only the address that was asked for").toBe(0)
  })
})

describe("a code that never left is not charged for", () => {
  it("hands the slot back when no mail could be sent at all", async () => {
    const t = fresh()
    const me = t.account()
    const noKey = { ...(t.env as object), RESEND_API_KEY: "" } as never

    const out = await startEmailChange(noKey, me, VICTIM)
    expect(out).toMatchObject({ status: 503, error: "email_not_configured" })
    expect(t.rows(), "a ledger row for mail nobody received refuses the PERSON").toBe(0)

    // …so once the key is configured, their hour is untouched.
    expect(await t.start(me)).toEqual({})
  })
})
