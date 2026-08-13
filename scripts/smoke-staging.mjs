// Staging smoke test — the REAL login → onboarding → team journey, run
// against the live staging URL after every deploy. Fails loudly (non-zero
// exit) so a broken deploy never goes unnoticed.
//
// Uses one fixed smoke account: the first run exercises the full team
// factory; later runs prove idempotency (and don't litter team databases).

import { makeApi, makeRpc, timedFetch } from "./lib/api.mjs"

const BASE = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
// Resend's test inbox: real send path, always "delivered", never bounces —
// so running the smoke repeatedly doesn't hurt the sending domain's reputation.
const EMAIL = "delivered@resend.dev"

let failures = 0
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${detail}`}`)
  if (!cond) failures++
}

const api = makeApi(BASE)

// 1 · Both workers answer through the front door.
{
  const a = await api("/api/auth/health")
  const t = await api("/api/tenancy/health")
  const r = await api("/api/realtime/health")
  const m = await api("/api/mcp/health")
  ok("auth health", a.body?.ok === true)
  ok("tenancy health", t.body?.ok === true)
  ok("realtime health", r.body?.ok === true)
  ok("mcp health", m.body?.ok === true)
}

// 2 · Login: mint a code through the ADMIN TEST-LOGIN door (staging-only,
// gated by its OWN TEST_LOGIN_KEY secret, fails closed, and refused outright on
// production). Login codes are NEVER echoed by the real send door in any
// environment, so the smoke needs TEST_LOGIN_KEY in its environment.
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY) {
  console.log("FAIL no TEST_LOGIN_KEY in the environment — cannot sign in (export TEST_LOGIN_KEY before running the smoke)")
  process.exit(1)
}
const start = await api("/api/auth/admin/test-login", {
  method: "POST",
  headers: { "x-admin-key": TEST_LOGIN_KEY },
  body: JSON.stringify({ email: EMAIL }),
})
ok("test-login code minted (admin door)", start.res.ok && typeof start.body?.code === "string", JSON.stringify({ status: start.res.status }))
const code = start.body?.code
if (!code) process.exit(1)

// 2b · The REAL send door must never carry a code in its response. A unique
// +label keeps this outside the fixed account's 5-codes-per-hour throttle
// (Resend's test inbox accepts delivered+anything@resend.dev).
{
  const real = await api("/api/auth/email/start", {
    method: "POST",
    body: JSON.stringify({ email: `delivered+noecho${Date.now()}@resend.dev` }),
  })
  const bodyText = JSON.stringify(real.body ?? {})
  ok("send door response carries NO code", real.res.ok && !/\d{6}/.test(bodyText), bodyText)
}

// 3 · Verify the code → session cookie.
// Raw (not api()) because this one needs the set-cookie header off the Response.
const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code }),
})
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
ok("login verified + cookie set", verify.ok && cookie.startsWith("kwapso_session="))

// 4 · Onboarding profile (idempotent).
const profile = await api(
  "/api/auth/profile",
  { method: "POST", body: JSON.stringify({ firstName: "Smoke", lastName: "Test" }) },
  cookie
)
ok("profile saved", profile.body?.user?.onboardingComplete === true)

// 5 · The team. Bootstrap is asked FIRST and asked again LAST, and the ops door
// sits between them only when the first answer was "none".
//
// WHY THE OPS DOOR IS IN A SMOKE TEST AT ALL. Team creation through the user
// door is closed product-wide — kwapso is one agency, one team, invitation only
// (TEAM_CREATION_CLOSED, shared/product.ts) — so on a freshly reset environment
// bootstrap CORRECTLY returns an empty list, and every assertion after it fails
// for a reason that is not a fault. That is not a hole to route around: it is
// the product, and the smoke has to enter the way an operator does. The ops door
// (x-admin-key, never public, refused on the user surface) is the seam the
// product leaves open for exactly this, and it is the same door a real reset is
// recovered through — so the smoke now exercises the recovery path as well.
//
// Idempotent by construction: the admin call happens ONLY when the caller has no
// team, so the second run finds the first run's team and skips it entirely. No
// litter, and the "later runs prove idempotency" promise at the top of this file
// still holds.
let boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
if (!boot.body?.teams?.length) {
  const ADMIN_KEY = process.env.ADMIN_KEY ?? ""
  if (!ADMIN_KEY) {
    console.log(
      "FAIL the smoke account has no team, and team creation is closed to users by design. " +
        "Export ADMIN_KEY so the smoke can stand one up through the ops door."
    )
    process.exit(1)
  }
  const made = await api("/api/tenancy/admin/create-team", {
    method: "POST",
    headers: { "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ name: "Smoke team", email: EMAIL }),
  })
  ok("team stood up through the ops door", made.res.ok && made.body?.ok === true, JSON.stringify(made.body))
  if (!made.res.ok) process.exit(1)
  boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
}
const team = boot.body?.teams?.[0]
ok("team exists + database ready", team?.dbStatus === "ready", JSON.stringify(boot.body))
ok("current team set", typeof boot.body?.currentTeamId === "string")

// 6 · Active context (Phase A): current team + your role, read from the team DB.
const ctx = await api("/api/tenancy/active", {}, cookie)
ok("active context has the current team", ctx.body?.team?.dbStatus === "ready", JSON.stringify(ctx.body))
ok("active context has your role (Admin)", ctx.body?.role?.title === "Admin", JSON.stringify(ctx.body?.role))

// 7 · The MCP front desk, end to end: create a token (session-gated), act
//     through /mcp AS the smoke user (bearer-gated, team-pinned), then revoke
//     and prove revocation bites immediately.
{
  const created = await api(
    "/api/mcp/tokens",
    { method: "POST", body: JSON.stringify({ label: "smoke token" }) },
    cookie
  )
  const secret = created.body?.secret
  ok("mcp token created (secret shown once)", typeof secret === "string" && secret.startsWith("kwapso_mcp_"))
  if (secret) {
    const call = makeRpc(BASE)
    const rpc = (method, params = {}) => call(secret, method, params)
    const init = await rpc("initialize")
    ok("mcp initialize answers", init.body?.result?.serverInfo?.name === "kwapso-mcp")
    const tools = await rpc("tools/list")
    ok("mcp lists tools", Array.isArray(tools.body?.result?.tools) && tools.body.result.tools.length > 10)
    const who = await rpc("tools/call", { name: "whoami", arguments: {} })
    const whoText = who.body?.result?.content?.[0]?.text ?? ""
    ok("mcp whoami acts AS the token owner", whoText.includes(EMAIL), whoText.slice(0, 120))
    await api("/api/mcp/tokens/revoke", { method: "POST", body: JSON.stringify({ id: created.body?.token?.id }) }, cookie)
    const dead = await rpc("tools/list")
    ok("revoked token is refused immediately", dead.status === 401)
  }
}

// 8 · Session round-trip + logout leaves the world clean.
const me = await api("/api/auth/me", {}, cookie)
ok("me() returns the smoke user", me.body?.user?.email === EMAIL)
await api("/api/auth/logout", { method: "POST" }, cookie)
const after = await api("/api/auth/me", {}, cookie)
ok("logout kills the session", after.res.status === 401)

console.log(failures ? `\nSMOKE FAILED (${failures})` : "\nSMOKE PASSED")
process.exit(failures ? 1 : 0)
