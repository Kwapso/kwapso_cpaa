#!/usr/bin/env node
// EVERY PAGE SAYS WHAT IT IS — walked in a real browser, on both front doors.
//
// WHY IT EXISTS. On 30 Aug 2026 the owner opened Sprints and there was no title
// on it. Nor on Accounts, Tickets, Tasks, Meetings or Apps — six of fourteen
// screens with no name anywhere. His question was the better half of the report:
// how did that get past rules this strict?
//
// It got past them by OBEYING them. R16 says a collection shows its count exactly
// once, and `CollectionHeading` arbitrated by returning null — which satisfies
// that sentence perfectly and takes the title with it. Nothing said a page must
// have a name. A check can only be silent about what it was not asked.
//
// The unit test beside this (`web/test/a-page-keeps-its-name.test.tsx`) locks the
// component. This walks the DEPLOYED app, because the component was never the
// whole story: a screen that simply never renders a heading is invisible to a
// test of the heading, and only a browser knows what a person actually sees.
//
//   set -a && source ~/.config/kwapso/keys.env && set +a
//   node scripts/every-page-has-a-name.mjs
//
// Exits non-zero when a page has no visible name, so it can gate a deploy.

import { chromium } from "playwright"
import { FRONT_DOORS } from "./lib/front-doors.mjs"

const API = process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev"
const AGENCY = process.env.AGENCY_BASE ?? FRONT_DOORS.staging.agency
const KEY = process.env.TEST_LOGIN_KEY
if (!KEY) {
  console.log("FAIL no TEST_LOGIN_KEY — export it first")
  process.exit(1)
}

// DERIVED FROM THE NAV, not hand-listed: every sidebar destination the app
// offers. A page added to the rail tomorrow is walked tomorrow.
//
// AND IT REFUSES RATHER THAN FALLING BACK. This used to end
// `.catch(() => ({ TEAM_SECTIONS: null }))` with a hand-typed array of ten
// segments behind it, which made the comment above true only on the happy path:
// `pages.ts` declares twelve sidebar placements, the fallback listed ten, and
// `processes` and `contacts` were missing from it. A `.mjs` importing a `.ts`
// leans on Node's type stripping, so the day that stops working — a Node
// upgrade, a syntax the stripper does not know, a moved file — this smoke walks
// a SHORTER list and still reports PASS. A gate that narrows its own coverage
// and calls it success is worse than no gate: nothing to notice, and a green
// tick over the pages it stopped visiting.
let TEAM_SECTIONS
try {
  ;({ TEAM_SECTIONS } = await import("../web/lib/pages.ts"))
} catch (err) {
  console.log(`FAIL could not read web/lib/pages.ts, so the walk list cannot be derived: ${err.message}`)
  process.exit(1)
}
const SEGMENTS = TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => s.segment)
if (!SEGMENTS.length) {
  console.log("FAIL web/lib/pages.ts declares no sidebar sections — the walk would visit nothing and pass")
  process.exit(1)
}

async function signIn(email) {
  const s = await fetch(`${API}/api/auth/admin/test-login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": KEY },
    body: JSON.stringify({ email }),
  }).then((r) => r.json())
  const v = await fetch(`${API}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: s.code }),
  })
  return (v.headers.get("set-cookie") ?? "").split(";")[0].split("=")[1]
}

const token = await signIn("alaap@kwapso.com")
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: "kwapso_session", value: token, domain: new URL(AGENCY).hostname, path: "/" }])
const page = await ctx.newPage()

let bad = 0
for (const seg of SEGMENTS) {
  const url = `${AGENCY}/${seg}`
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
  } catch {
    console.log(`FAIL  /${seg} — did not load`)
    bad++
    continue
  }
  // WAIT FOR THE NAME, do not sleep at it. A fixed pause is a flaky oracle: on
  // 30 Aug this check reported four pages nameless that had been fine minutes
  // earlier, purely because they were slower to render that run. A check that
  // fails when the app is slow teaches everyone to re-run it until it is green,
  // which is worse than not having it.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("h1")].some((e) => e.offsetParent !== null && e.textContent.trim()),
      { timeout: 20000 }
    )
    .catch(() => undefined)
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("h1")]
      .filter((e) => e.offsetParent !== null && e.textContent.trim())
      .map((e) => e.textContent.trim())
  )
  if (!names.length) {
    console.log(`FAIL  /${seg} — no visible name on the page`)
    bad++
  } else {
    console.log(`PASS  /${seg} — "${names[0].slice(0, 40)}"`)
  }
}

await browser.close()
console.log(bad ? `\n${bad} page(s) with no name` : "\nevery page says what it is")
process.exit(bad ? 1 : 0)
