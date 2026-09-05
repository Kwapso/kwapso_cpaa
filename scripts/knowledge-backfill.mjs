// THE BACKFILL — fill a live environment's knowledge base with the material the
// app already holds, before anybody starts using it.
//
//   node scripts/knowledge-backfill.mjs staging
//   node scripts/knowledge-backfill.mjs production
//
// Needs, in the environment: TEST_LOGIN_KEY (the same staging-only admin door
// the smoke uses) or KNOWLEDGE_COOKIE (a session cookie you already hold —
// production has no test-login door, by design), and BACKFILL_EMAIL for the
// account to act as.
//
// IT IS A LOOP OVER ONE DOOR, and that is the whole point. `POST
// /api/content/knowledge/sync` does a bounded slice and answers `caughtUp`; the
// 15-minute cron calls the SAME engine with the SAME bounds. So there is no
// second ingestion path to keep in step, no script-only SQL, and nothing here
// that has not already been exercised by the cron on every other tick. It writes
// through a gated door as a real signed-in person, so every source it creates
// carries the same audit trail as one typed by hand.
//
// SAFE TO RE-RUN, and safe to interrupt. Each kind keeps its own cursor in the
// team's database, a row whose text has not changed is skipped before it is
// chunked, and a source somebody deliberately took away is never put back. Stop
// it halfway and the next run — or the next cron tick — carries on from there.

import { makeApi, timedFetch } from "./lib/api.mjs"
import { FRONT_DOORS } from "./lib/front-doors.mjs"

const ENV = process.argv[2]
const BASE =
  ENV === "production"
    ? (process.env.PRODUCTION_BASE ?? FRONT_DOORS.production.agency)
    : (process.env.STAGING_BASE ?? "https://kwapso-staging.kwapso.workers.dev")

if (!["staging", "production"].includes(ENV)) {
  console.error("Usage: node scripts/knowledge-backfill.mjs <staging|production>")
  process.exit(1)
}

const api = makeApi(BASE)
const EMAIL = process.env.BACKFILL_EMAIL ?? "delivered@resend.dev"

/** A session, the same way a person gets one. On staging the admin test-login
 * door mints the code (it is gated by its own secret and refused outright on
 * production); on production you supply a cookie you already hold, because there
 * is no way to mint one and there should not be. */
async function signIn() {
  if (process.env.KNOWLEDGE_COOKIE) return process.env.KNOWLEDGE_COOKIE
  const key = process.env.TEST_LOGIN_KEY
  if (!key) {
    console.error(
      "No KNOWLEDGE_COOKIE and no TEST_LOGIN_KEY in the environment — cannot sign in.\n" +
        "On production, sign in as yourself in the browser and export KNOWLEDGE_COOKIE='kwapso_session=…'."
    )
    process.exit(1)
  }
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": key },
    body: JSON.stringify({ email: EMAIL }),
  })
  if (!start.ok || typeof start.body?.code !== "string") {
    console.error(`Could not mint a login code (${start.status}): ${JSON.stringify(start.body)}`)
    process.exit(1)
  }
  const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, code: start.body.code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("kwapso_session=")) {
    console.error("Sign-in did not return a session cookie.")
    process.exit(1)
  }
  return cookie
}

const cookie = await signIn()
console.log(`Backfilling ${ENV} (${BASE}) as ${EMAIL}\n`)

// Where it is starting from — so "it did nothing" and "there was nothing to do"
// are different sentences at the end.
const before = await api("/api/content/knowledge", {}, cookie)
if (!before.ok) {
  console.error(
    `Could not read the knowledge base (${before.status}): ${before.body?.message ?? ""}\n` +
      "A 403 here means this account's role has no `knowledge` rights yet."
  )
  process.exit(1)
}
console.log(`sources before: ${before.body?.total ?? 0}`)

const started = Date.now()
let ticks = 0
let indexed = 0
// A CEILING, not the expected end: the loop stops when the door says every kind
// has caught up. This is what stops a bug in the cursor from becoming an
// infinite bill — and hitting it is loud rather than silent.
const MAX_TICKS = 5_000
for (; ticks < MAX_TICKS; ticks++) {
  const res = await api("/api/content/knowledge/sync", { method: "POST", body: "{}" }, cookie)
  if (!res.ok) {
    console.error(`\nsync failed (${res.status}): ${res.body?.message ?? JSON.stringify(res.body)}`)
    process.exit(1)
  }
  const results = res.body?.results ?? []
  indexed += results.reduce((n, r) => n + (r.indexed ?? 0), 0)
  for (const r of results)
    if (r.error) console.error(`  ! ${r.kind}: ${r.error}`)
  if (ticks % 10 === 0)
    process.stdout.write(`\r  ${ticks} slices · ${indexed} sources indexed · ${res.body?.total ?? "?"} in the base   `)
  if (res.body?.caughtUp) {
    ticks++
    break
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)
const after = await api("/api/content/knowledge", {}, cookie)
const state = await api("/api/content/knowledge/sync", {}, cookie)

console.log(`\n\nDone in ${seconds}s — ${ticks} slices, ${indexed} sources indexed.`)
console.log(`sources now: ${after.body?.total ?? "?"} (was ${before.body?.total ?? 0})\n`)
for (const row of state.body?.ingest ?? [])
  console.log(
    `  ${row.kind.padEnd(8)} ${String(row.sourcesIndexed).padStart(6)} indexed · last ok ${row.lastOkAt ?? "never"}${
      row.lastError ? ` · LAST ERROR: ${row.lastError}` : ""
    }`
  )

if (ticks >= MAX_TICKS) {
  console.error(
    `\nStopped at the ${MAX_TICKS}-slice ceiling WITHOUT catching up. That is not a finished backfill — ` +
      "read the per-kind cursors above before running it again."
  )
  process.exit(1)
}
console.log("\nThe 15-minute sweep keeps it in step from here.")
