// AN EDIT EDITS. IT DOES NOT REPLACE.
//
// `POST /api/tenancy/accounts/update` wrote every optional column as
// `input.X ?? null`, and `optionalText` folds absent / null / blank into one
// `undefined` — so a caller who sent `{id, name}` did not rename an account, they
// renamed it AND erased its email, phone, address, reference, currency, language
// and time zone. Nothing said so and nothing showed it.
//
// Two callers were doing exactly that:
//   • the assistant's `update_account` tool, whose builder drops absent fields —
//     so "rename Bergman to Bergman S.A." destroyed the rest of the record, with
//     no confirm panel between the model and the wipe;
//   • the app's OWN account form, which has never sent currency, language or time
//     zone at all — so every save from the screen wiped all three.
//
// These tests drive the REAL route through the REAL schema, because the bug lived
// exactly in the gap between "what the door received" and "what the column got".
// A test against updateAccount() alone would have missed it: the interesting half
// is the boundary, where `""` and "never mentioned" used to become the same thing.

import type { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("../../../shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/workers/d1-rest")>()
  const { d1Impl } = await import("./d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv, req } from "./spine-harness"

/** Every optional column an account carries, filled in — the record a wipe would
 * take away. */
const FULL = {
  email: "hello@bergman.example",
  phone: "+27 21 000 0000",
  address: "1 Long Street, Cape Town",
  code: "BERG",
  currency: "ZAR",
  locale: "en-ZA",
  timezone: "Africa/Johannesburg",
}

const post = (body: unknown) =>
  worker.fetch(
    req("POST /api/tenancy/accounts/update", body),
    makeEnv(() => holder.db as DatabaseSync, IDS.staffUser)
  )

const account = () =>
  holder.db!.prepare("SELECT * FROM accounts WHERE id = ?").get(IDS.victimAccount) as Record<
    string,
    unknown
  >

beforeEach(() => {
  holder.db = buildSpineDb()
  // Start from a fully-filled record, so anything missing afterwards was taken.
  holder.db
    .prepare(
      `UPDATE accounts SET email = ?, phone = ?, address = ?, code = ?, currency = ?,
         locale = ?, timezone = ?, status = 'client' WHERE id = ?`
    )
    .run(
      FULL.email, FULL.phone, FULL.address, FULL.code, FULL.currency,
      FULL.locale, FULL.timezone, IDS.victimAccount
    )
})

describe("a field the caller never mentioned is left alone", () => {
  it("renaming an account keeps every other field", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman S.A." })
    expect(res.status, await res.text()).toBe(200)

    const row = account()
    expect(row.name).toBe("Bergman S.A.")
    // The whole point, field by field — a loop would report "something changed"
    // and leave whoever reads the failure guessing which column went.
    expect(row.email, "email survived a rename").toBe(FULL.email)
    expect(row.phone, "phone survived a rename").toBe(FULL.phone)
    expect(row.address, "address survived a rename").toBe(FULL.address)
    expect(row.code, "reference survived a rename").toBe(FULL.code)
    expect(row.currency, "currency survived a rename").toBe(FULL.currency)
    expect(row.locale, "language survived a rename").toBe(FULL.locale)
    expect(row.timezone, "time zone survived a rename").toBe(FULL.timezone)
    expect(row.status, "status survived a rename").toBe("client")
  })

  it("the fields the app's own form does not carry survive a save from it", async () => {
    // The account form sends exactly these keys and no others. Currency, language
    // and time zone are not among them — and used to be wiped by every save.
    const res = await post({
      id: IDS.victimAccount,
      name: "Bergman S.A.",
      code: FULL.code,
      email: FULL.email,
      phone: FULL.phone,
      address: FULL.address,
      status: "client",
    })
    expect(res.status).toBe(200)

    const row = account()
    expect(row.currency).toBe(FULL.currency)
    expect(row.locale).toBe(FULL.locale)
    expect(row.timezone).toBe(FULL.timezone)
  })
})

describe("clearing a field is something the caller has to say", () => {
  it("an empty string empties that field and only that field", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman", email: "" })
    expect(res.status).toBe(200)

    const row = account()
    expect(row.email, "the field they emptied is empty").toBeNull()
    expect(row.phone, "the fields they didn't mention are untouched").toBe(FULL.phone)
    expect(row.code).toBe(FULL.code)
  })

  it("an explicit null empties it too — that is what the form sends", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman", phone: null, address: null })
    expect(res.status).toBe(200)

    const row = account()
    expect(row.phone).toBeNull()
    expect(row.address).toBeNull()
    expect(row.email, "and still takes nothing it wasn't asked to take").toBe(FULL.email)
  })

  it("a new value replaces the old one", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman", code: "BERG2" })
    expect(res.status).toBe(200)
    expect(account().code).toBe("BERG2")
  })
})

describe("status has no empty state to reach", () => {
  // The column is NOT NULL DEFAULT 'active'. Treating "" as "clear it" would turn
  // a blank dropdown into a constraint violation — a 500 where the caller only
  // meant "leave it". Absent and empty both keep what is there.
  it("an empty status keeps the current one instead of failing", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman", status: "" })
    expect(res.status, await res.text()).toBe(200)
    expect(account().status).toBe("client")
  })

  it("a real status still moves it", async () => {
    const res = await post({ id: IDS.victimAccount, name: "Bergman", status: "past_client" })
    expect(res.status).toBe(200)
    expect(account().status).toBe("past_client")
  })
})
