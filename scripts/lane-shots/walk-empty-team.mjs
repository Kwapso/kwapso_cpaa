// WALK THE APP WITH NOTHING IN IT — every nav destination, against a team
// created through the app's OWN doors (not a D1 seed), asking two questions
// per screen: does it render at all with zero rows, and does it say what to
// do next.
//
// THE INSTRUMENT LESSON. An empty screen and a broken screen photograph
// identically — silence either way. So every destination is asserted, not
// eyeballed: a canary run against the POPULATED smoke team proves the same
// probe reports real content when content exists, before any zero on the
// fresh team is trusted as "empty" rather than "the probe found nothing".
//
//   FRESH_COOKIE=<cookie> FRESH_TEAM=<id> CANARY_COOKIE=<cookie> CANARY_TEAM=<id> \
//     node scripts/lane-shots/walk-empty-team.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const PORT = process.env.VERIFY_PORT ?? "3065"
const OUT = "/tmp/empty-walk-shots"
mkdirSync(OUT, { recursive: true })

const FRESH_COOKIE = process.env.FRESH_COOKIE
const FRESH_TEAM = process.env.FRESH_TEAM
const CANARY_COOKIE = process.env.CANARY_COOKIE
const CANARY_TEAM = process.env.CANARY_TEAM
if (!FRESH_COOKIE || !FRESH_TEAM) {
  console.error("FRESH_COOKIE / FRESH_TEAM not set")
  process.exit(1)
}

// The owner's 20, agency door.
const DESTINATIONS = [
  "home", "accounts", "apps", "brand", "invitations", "knowledge", "kwapso",
  "meetings", "members", "processes", "profile", "purposes", "roles",
  "settings", "sprints", "stories", "tasks", "tickets", "time", "waves",
]

const browser = await chromium.launch()

/** One destination's probe. Returns counted, asserted facts — never a guess. */
async function probe(page, path, screenshotPath) {
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  const consoleErrors = []
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })

  let status = null
  try {
    const resp = await page.goto(`http://localhost:${PORT}/${path}`, { waitUntil: "domcontentloaded", timeout: 20000 })
    status = resp?.status() ?? null
  } catch (e) {
    return { path, ok: false, crash: String(e), status: null }
  }

  // Give the client-resolved shell + one data round-trip time to settle.
  // NOT a fixed sleep — a cold Next dev-server route (first hit compiles it)
  // can take several seconds, and a fixed 2.5s wait produced a false "empty"
  // reading on a screen later proven to have three real rows. Poll instead:
  // wait for the nav to have more than the two auth-independent items, then
  // for the skeleton count to settle at zero, each with its own budget.
  await page.waitForFunction(
    () => document.querySelectorAll("nav a, aside a").length > 2,
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForFunction(
    () => document.querySelectorAll('[class*="skeleton"], [aria-busy="true"]').length === 0,
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForTimeout(500)

  const facts = await page.evaluate(() => {
    const body = document.body
    const text = body.innerText.trim()
    const skeletons = document.querySelectorAll('[class*="skeleton"], [aria-busy="true"]').length
    // A real row in a collection: the library's own row/list-item markers,
    // counted broadly rather than matched to one collection shape.
    const rows = document.querySelectorAll(
      // The library's real markers, found by reading the actual DOM rather
      // than guessing at <li>/<tr>/role="row" (none of which this app's
      // `list` primitive uses — it renders data-slot="list-row").
      '[data-slot="list-row"], [data-slot$="-row"], [data-slot="checklist-item"], [role="row"]:not([role="row"] [role="row"])'
    ).length
    // An offered next step: a button/link whose own text says so. Broad on
    // purpose — this is "did the screen name an action" not "does it use one
    // particular component".
    const actionWords = /add|create|new|invite|import|start|ask for/i
    const buttons = [...document.querySelectorAll("button, a")]
      .map((el) => el.textContent?.trim() || el.getAttribute("aria-label") || "")
      .filter((t) => t && actionWords.test(t))
    // The kit's own empty/error register text landmark.
    const hasEmptyRegister = !!document.querySelector('[data-slot*="empty"], [data-slot*="register"]')
    return {
      bodyTextLength: text.length,
      bodyTextSample: text.slice(0, 200),
      skeletonsStillPresent: skeletons,
      rowCount: rows,
      actionLabelsFound: [...new Set(buttons)].slice(0, 5),
      hasEmptyRegister,
    }
  })

  if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => {})

  return { path, status, crash: null, pageErrors: errors, consoleErrors: consoleErrors.slice(0, 3), ...facts }
}

async function withSession(cookie, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: "kwapso_session", value: cookie.replace("kwapso_session=", ""), domain: "localhost", path: "/" }])
  const page = await ctx.newPage()
  const result = await fn(page)
  await ctx.close()
  return result
}

// ── CANARY, FIRST ─────────────────────────────────────────────────────────
// Prove the probe reports real content on a screen known to have it, before
// trusting any zero from the fresh team.
if (CANARY_COOKIE && CANARY_TEAM) {
  console.log("\n=== CANARY (populated smoke team) ===")
  for (const path of ["accounts", "tickets"]) {
    const r = await withSession(CANARY_COOKIE, (page) => probe(page, path))
    console.log(`${path}: rows=${r.rowCount} bodyLen=${r.bodyTextLength} status=${r.status}`)
    if (r.rowCount === 0) {
      console.error(`CANARY FAILED on /${path} — the probe found zero rows on a team known to have data. Fix the probe before trusting the fresh-team results.`)
      process.exit(1)
    }
  }
  console.log("canary passed — probe genuinely detects content when present\n")
}

// ── THE WALK ─────────────────────────────────────────────────────────────
console.log("=== FRESH TEAM WALK ===")
const results = []
for (const path of DESTINATIONS) {
  const r = await withSession(FRESH_COOKIE, (page) => probe(page, path, `${OUT}/${path}.png`))
  results.push(r)
  console.log(
    `${path.padEnd(12)} status=${r.status ?? "ERR"} rows=${r.rowCount ?? "-"} ` +
    `bodyLen=${r.bodyTextLength ?? "-"} skeletons=${r.skeletonsStillPresent ?? "-"} ` +
    `actions=[${(r.actionLabelsFound ?? []).join(", ")}] ` +
    `pageErrors=${r.pageErrors?.length ?? "-"}`
  )
}
console.log(`screenshots saved to ${OUT}`)

await browser.close()
console.log("\nJSON:", JSON.stringify(results))
