// A THROWAWAY DROPDOWN CATEGORY, SEEDED THROUGH THE APP'S OWN DOOR, to prove
// use-virtual-rows actually holds up against real data on staging — not a
// guess and not a synthetic jsdom array. Every value below is written through
// POST /api/tenancy/selectable, exactly as a person clicking "New value" over
// and over would produce, so the audit block and the publish are exercised
// too, not just the render.
//
// Same login mechanism scripts/smoke-staging.mjs uses (the staging-only
// admin test-login door, never the real send path) and the same smoke team,
// so this adds nothing to the account surface beyond one dropdown type.
//
//   node scripts/verify-virtual-rows.mjs seed     — create ~300 values
//   node scripts/verify-virtual-rows.mjs cleanup  — deactivate them all
//
// CLEANUP DEACTIVATES RATHER THAN DELETES. This app has no delete door for a
// dropdown value at all (deactivate-not-delete, CLAUDE.md's house rule) — the
// UI's own "Activate"/"Deactivate" pair is the only state change offered, so
// that is what cleanup actually does. The seeded values are set inactive
// through the same door a person would use, which removes them from every
// active-only view (including the one this script exists to test) without
// pretending to a delete this app does not have.

import { makeApi, timedFetch } from "./lib/api.mjs"

const BASE = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
const EMAIL = "delivered@resend.dev"
const TYPE = "ZZZ Virtualization Test"
const COUNT = 300

const mode = process.argv[2]
if (mode !== "seed" && mode !== "cleanup") {
  console.error("usage: node scripts/verify-virtual-rows.mjs <seed|cleanup>")
  process.exit(1)
}

const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY) {
  console.error("no TEST_LOGIN_KEY in the environment — export it before running (see keys.env)")
  process.exit(1)
}

const api = makeApi(BASE)

// 1 · Sign in the same way the staging smoke does.
const start = await api("/api/auth/admin/test-login", {
  method: "POST",
  headers: { "x-admin-key": TEST_LOGIN_KEY },
  body: JSON.stringify({ email: EMAIL }),
})
if (!start.res.ok || typeof start.body?.code !== "string") {
  console.error("could not mint a login code", JSON.stringify(start.body))
  process.exit(1)
}
const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code: start.body.code }),
})
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
if (!verify.ok || !cookie.startsWith("kwapso_session=")) {
  console.error("login did not produce a session cookie")
  process.exit(1)
}

// 2 · The smoke team (already stood up by smoke-staging.mjs runs; created
// through the ops door if this is somehow the very first run against a fresh
// environment).
let boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
if (!boot.body?.teams?.length) {
  const ADMIN_KEY = process.env.ADMIN_KEY ?? ""
  if (!ADMIN_KEY) {
    console.error("no team on this account and no ADMIN_KEY to stand one up")
    process.exit(1)
  }
  const made = await api(
    "/api/tenancy/admin/create-team",
    { method: "POST", headers: { "x-admin-key": ADMIN_KEY }, body: JSON.stringify({ name: "Smoke team", email: EMAIL }) }
  )
  if (!made.res.ok) {
    console.error("could not stand up a team", JSON.stringify(made.body))
    process.exit(1)
  }
  boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
}
const teamId = boot.body?.currentTeamId
if (!teamId) {
  console.error("no current team on the session")
  process.exit(1)
}
console.log(`team ${teamId}`)

if (mode === "seed") {
  let created = 0
  let failed = 0
  for (let i = 0; i < COUNT; i++) {
    const res = await api(
      "/api/tenancy/selectable",
      { method: "POST", body: JSON.stringify({ type: TYPE, value: `Test value ${String(i).padStart(4, "0")}` }) },
      cookie
    )
    if (res.res.ok) created++
    else {
      failed++
      if (failed <= 3) console.error(`row ${i} failed`, res.res.status, JSON.stringify(res.body))
    }
    if (i > 0 && i % 50 === 0) console.log(`${i}/${COUNT}…`)
  }
  console.log(`seeded ${created}/${COUNT} (${failed} failed) into type "${TYPE}" on team ${teamId}`)
  console.log(`view at ${BASE.replace("kwapso-staging.kwapso.workers.dev", "app-staging.kwapso.app")}/t/${teamId}/dropdowns`)
  process.exit(failed > 0 ? 1 : 0)
}

if (mode === "cleanup") {
  const all = await api("/api/tenancy/selectable", {}, cookie)
  const rows = (all.body?.values ?? []).filter((v) => v.type === TYPE && v.active)
  console.log(`deactivating ${rows.length} rows in type "${TYPE}"`)
  let done = 0
  for (const v of rows) {
    const res = await api("/api/tenancy/selectable/active", { method: "POST", body: JSON.stringify({ id: v.id, active: false }) }, cookie)
    if (res.res.ok) done++
    if (done > 0 && done % 50 === 0) console.log(`${done}/${rows.length}…`)
  }
  console.log(`deactivated ${done}/${rows.length}`)
  process.exit(done === rows.length ? 0 : 1)
}
