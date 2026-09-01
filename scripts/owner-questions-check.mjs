// THE TWO QUESTIONS THE OWNER ASKED AND THE APP COULD NOT ANSWER.
//
// 1 Sep 2026. He asked staging's assistant two things and got nothing useful:
//
//   "What is Alex's full name?"        — nothing anywhere in the base said who
//                                        his own colleagues are. Coverage.
//   "What was the latest week planning about?" — answered from a 2027 calendar
//                                        shell. Question understanding.
//
// Both are now permanent questions in the retrieval bench
// (`scripts/kb-bench-questions.mjs`). This is the OTHER half, and the two are
// different claims: the bench measures RETRIEVAL against the index directly,
// running the working tree's code with no deploy. This asks the DEPLOYED
// ASSISTANT, through the real chat door, as a real signed-in person — model,
// prompt, tool catalogue, permission gate and all.
//
// A bench pass and a live pass can disagree, and when they do the disagreement is
// the finding: retrieval can hold the answer while the model never reaches for
// the door, which is exactly what the routing bench measures separately. So this
// asserts the sentence a PERSON would read, and prints the whole reply when it
// fails, because "it did not say Stadlmair" is not a diagnosis on its own.
//
//   node scripts/owner-questions-check.mjs
//
// WHAT IT COSTS: two assistant turns on the team's own allowance. That is the
// price of asking the deployed thing rather than a stand-in for it, and it is
// the only way this claim can be made honestly.
//
// STAGING ONLY. It signs in through the admin test-login door, which production
// refuses outright.

import { NO_KEY_MESSAGE, testLoginKey } from "./lib/test-login-key.mjs"

const BASE = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
const EMAIL = process.env.OWNER_EMAIL ?? "alaap@kwapso.com"

/** WHAT EACH ANSWER MUST CONTAIN, authored off the material rather than off what
 * the assistant said last time — the same discipline the bench's own key follows.
 *
 * `must` is a list of ALTERNATIVES: any one of them proves the answer reached the
 * right material. `mustNot` is the wrong answer said out loud, which is what
 * makes the second question a real test — the 2027 shells carry the SAME TITLE as
 * the meeting that happened, so "it mentioned Week planning" proves nothing. */
const QUESTIONS = [
  {
    q: "What is Alex's full name?",
    must: ["Stadlmair"],
    mustNot: [],
    why: "R47's `person` kind, and the name arm that reaches it — nothing in the base said who his colleagues were.",
  },
  {
    q: "What was the latest week planning about?",
    // The 31 August meeting's own words. Any one of them means the answer came
    // from the meeting that happened.
    must: ["Keno", "Padel", "Paddle", "Horse", "flu clinic", "Flu Clinic", "warehouse"],
    // The base holds fifty "Week planning" rows dated 2027. A reply naming one is
    // the original bug, whatever else it says.
    mustNot: ["2027"],
    why: "`notYet` in the query grammar — 50 of the 58 'Week planning' rows are empty 2027 calendar shells.",
  },
]

const TEST_LOGIN_KEY = testLoginKey()
if (!TEST_LOGIN_KEY) {
  console.log(NO_KEY_MESSAGE)
  process.exit(1)
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(cookie ? {} : { "x-admin-key": TEST_LOGIN_KEY }),
    },
    body: JSON.stringify(body),
    // An assistant turn is a long door; the machine surface's own ceiling.
    signal: AbortSignal.timeout(180_000),
  })
  return res
}

console.log(`owner-questions-check — ${BASE}\n`)

const start = await post("/api/auth/admin/test-login", { email: EMAIL })
const { code } = await start.json()
if (!code) {
  console.error("the test-login door did not mint a code — is this staging?")
  process.exit(1)
}
const verify = await fetch(`${BASE}/api/auth/email/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, code }),
})
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
if (!cookie.startsWith("kwapso_session=")) {
  console.error("could not sign in")
  process.exit(1)
}

let failed = 0
for (const item of QUESTIONS) {
  // A FRESH THREAD EACH TIME: no `threadId`, so nothing the previous question
  // said can be what answers this one.
  const res = await post("/api/data-ops/agent/chat", { message: item.q }, cookie)
  const body = await res.json().catch(() => ({}))
  const reply = String(body.reply ?? body.message ?? "")
  const hit = item.must.some((w) => reply.toLowerCase().includes(w.toLowerCase()))
  const wrong = item.mustNot.find((w) => reply.toLowerCase().includes(w.toLowerCase()))
  const pass = res.ok && hit && !wrong
  if (!pass) failed++
  console.log(`${pass ? "PASS" : "FAIL"}  ${item.q}`)
  if (!pass) {
    console.log(`      ${item.why}`)
    if (!res.ok) console.log(`      HTTP ${res.status}`)
    else if (wrong) console.log(`      the reply names "${wrong}", which is the original bug`)
    else console.log(`      the reply names none of: ${item.must.join(", ")}`)
    // THE WHOLE REPLY, because "it did not say Stadlmair" is not a diagnosis.
    console.log(`      —\n${reply.split("\n").map((l) => `      ${l}`).join("\n")}\n`)
  }
}

console.log("")
console.log(
  failed === 0
    ? `Both of the owner's questions answer correctly on ${BASE}.`
    : `${failed} of ${QUESTIONS.length} still fail.`
)
process.exit(failed === 0 ? 0 : 1)
