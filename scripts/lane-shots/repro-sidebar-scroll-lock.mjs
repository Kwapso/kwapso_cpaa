// Reproduction + diagnosis for the sidebar-breaks-after-overlay bug: opening
// the assistant (a Radix Sheet) locks body scroll, and closing it again
// leaves the lock in place, so the sticky rail computes against the wrong
// scroll container from then on.
// KW_SESSION=<cookie value> node scripts/lane-shots/repro-sidebar-scroll-lock.mjs
import { chromium } from "playwright"

const BASE = "http://localhost:3055"
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
const page = await ctx.newPage()

async function bodyOverflow() {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body)
    return { x: cs.overflowX, y: cs.overflowY }
  })
}
async function railTop() {
  return page.evaluate(() => {
    const outer = document.querySelector('[data-slot="screen-shell-rail"]')
    const inner = outer ? outer.firstElementChild : null
    return inner ? inner.getBoundingClientRect().top : null
  })
}

await page.goto(`${BASE}/t/${TEAM}/home`, { waitUntil: "domcontentloaded" })
await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(2500)

console.log("fresh load, body overflow:", await bodyOverflow())

// Open the assistant.
await page.getByRole("button", { name: /Open the assistant/i }).click()
await page.waitForTimeout(1000)
console.log("assistant OPEN, body overflow:", await bodyOverflow())

// Close it — try Escape first (Radix's own close path).
await page.keyboard.press("Escape")
await page.waitForTimeout(1000)
console.log("assistant CLOSED (Escape), body overflow:", await bodyOverflow())

// Now scroll the page and check the rail.
await page.evaluate(() => window.scrollTo(0, 380))
await page.waitForTimeout(500)
console.log("after scrolling to 380, rail rect.top:", await railTop())
console.log("window.scrollY:", await page.evaluate(() => window.scrollY))

await page.screenshot({ path: "/tmp/repro-after-close-scroll.png" })
console.log("screenshot: /tmp/repro-after-close-scroll.png")

await browser.close()
