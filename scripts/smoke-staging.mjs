// Staging smoke test — the REAL login → onboarding → team journey, run
// against the live staging URL after every deploy. Fails loudly (non-zero
// exit) so a broken deploy never goes unnoticed.
//
// Uses one fixed smoke account: the first run exercises the full team
// factory; later runs prove idempotency (and don't litter team databases).

const BASE = process.env.SMOKE_BASE ?? "https://brimba-staging.swift-struck.workers.dev"
// Resend's test inbox: real send path, always "delivered", never bounces —
// so running the smoke repeatedly doesn't hurt the sending domain's reputation.
const EMAIL = "delivered@resend.dev"

let failures = 0
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` — ${detail}`}`)
  if (!cond) failures++
}

const api = async (path, opts = {}, cookie = "") => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...opts.headers,
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { res, body }
}

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
// ADMIN_KEY-gated, fails closed). Login codes are NEVER echoed by the real send
// door in any environment, so the smoke needs ADMIN_KEY in its environment.
const ADMIN_KEY = process.env.ADMIN_KEY ?? ""
if (!ADMIN_KEY) {
  console.log("FAIL no ADMIN_KEY in the environment — cannot sign in (export ADMIN_KEY before running the smoke)")
  process.exit(1)
}
const start = await api("/api/auth/admin/test-login", {
  method: "POST",
  headers: { "x-admin-key": ADMIN_KEY },
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
const verify = await fetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code }),
})
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
ok("login verified + cookie set", verify.ok && cookie.startsWith("brimba_session="))

// 4 · Onboarding profile (idempotent).
const profile = await api(
  "/api/auth/profile",
  { method: "POST", body: JSON.stringify({ firstName: "Smoke", lastName: "Test" }) },
  cookie
)
ok("profile saved", profile.body?.user?.onboardingComplete === true)

// 5 · Bootstrap: first run births a team database; later runs return it.
const boot = await api("/api/tenancy/bootstrap", { method: "POST" }, cookie)
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
  ok("mcp token created (secret shown once)", typeof secret === "string" && secret.startsWith("brimba_mcp_"))
  if (secret) {
    const rpc = async (method, params = {}) => {
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
      return { res, body: await res.json().catch(() => null) }
    }
    const init = await rpc("initialize")
    ok("mcp initialize answers", init.body?.result?.serverInfo?.name === "brimba-mcp")
    const tools = await rpc("tools/list")
    ok("mcp lists tools", Array.isArray(tools.body?.result?.tools) && tools.body.result.tools.length > 10)
    const who = await rpc("tools/call", { name: "whoami", arguments: {} })
    const whoText = who.body?.result?.content?.[0]?.text ?? ""
    ok("mcp whoami acts AS the token owner", whoText.includes(EMAIL), whoText.slice(0, 120))
    await api("/api/mcp/tokens/revoke", { method: "POST", body: JSON.stringify({ id: created.body?.token?.id }) }, cookie)
    const dead = await rpc("tools/list")
    ok("revoked token is refused immediately", dead.res.status === 401)
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
