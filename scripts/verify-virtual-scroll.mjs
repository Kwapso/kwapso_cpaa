// PROVE SCROLL-TRIGGERED RE-WINDOWING AGAINST REAL DATA, in a REAL browser.
//
// The MCP Browser pane throttles a hidden/backgrounded tab hard enough that
// requestAnimationFrame never fires — use-virtual-rows.ts schedules its own
// scroll-position read inside one, so a scroll never recomputes the window in
// that pane no matter what fires the DOM 'scroll' event (a real wheel event
// through the pane's own input path, a dispatched Event, even a patched
// window.requestAnimationFrame — none of it reaches a tab the OS considers
// backgrounded). Overriding document.hidden/visibilityState doesn't help
// either: the throttle is enforced by the browser engine below the level a
// page can see or override. A real Playwright browser has no such pane and no
// such throttle, so this script exists to answer the one question the pane
// cannot: does scrolling actually move the window.
//
//   SESSION_COOKIE=<kwapso_session value> node scripts/verify-virtual-scroll.mjs
//
// Needs a dev server already running against real data — see
// staging-session-on-a-local-worktree in this session's own notes for how to
// mint SESSION_COOKIE and start one:
//   cd web && DEV_API_ORIGIN=https://agency-staging.kwapso.app npx next dev -p 3063
//
// WRITES 403 THROUGH THIS SETUP, AND THAT IS NOT A BUG. The app's CSRF check
// (shared/workers/front-door.ts) refuses any non-GET request whose Origin
// header doesn't match the door's own — the browser sends
// Origin: http://localhost:3063, DEV_API_ORIGIN proxies the request on to
// https://agency-staging.kwapso.app, and the mismatch is exactly what the
// check exists to catch. Every write in this app is protected the same way;
// it is not specific to this screen. So this script proves the WINDOW moves
// and the ROW IDENTITY stays correct through a click into edit mode — the
// two things specific to use-virtual-rows — and stops short of the actual
// save, which needs a real deployed origin to test honestly.

import { chromium } from "playwright"

const cookie = process.env.SESSION_COOKIE
if (!cookie) {
  console.error("SESSION_COOKIE not set — see this file's header for how to mint one")
  process.exit(1)
}
const TEAM = process.env.VERIFY_TEAM ?? "01M0THFJC37525M1WD1PPWTPBY"
const PORT = process.env.VERIFY_PORT ?? "3063"
const GROUP = process.env.VERIFY_GROUP ?? "ZZZ Virtualization Test"

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addCookies([{ name: "kwapso_session", value: cookie, domain: "localhost", path: "/" }])
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/t/${TEAM}/dropdowns`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("h2", { timeout: 15000 })
await page.waitForTimeout(1500)

const heading = page.locator("h2", { hasText: GROUP })
await heading.scrollIntoViewIfNeeded()
const ul = heading.locator("xpath=following-sibling::ul[1]")

const readWindow = () =>
  ul.evaluate((el) => {
    const rows = [...el.querySelectorAll("li")].filter((li) => !li.hasAttribute("data-virtual-spacer"))
    return {
      count: rows.length,
      firstPosinset: rows[0]?.getAttribute("aria-posinset"),
      lastPosinset: rows[rows.length - 1]?.getAttribute("aria-posinset"),
      scrollTop: el.scrollTop,
    }
  })

const before = await readWindow()
console.log("before scroll:", JSON.stringify(before))

// A real wheel scroll inside the box — the thing the pane's version of this
// test could never get past.
const box = await ul.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 40; i++) {
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(30)
}
await page.waitForTimeout(500)

const after = await readWindow()
console.log("after scroll:", JSON.stringify(after))
if (after.firstPosinset === before.firstPosinset) {
  console.error("FAIL: the window did not move — scroll had no effect")
  await browser.close()
  process.exit(1)
}

// ROW IDENTITY ACROSS AN EDIT-MODE SWAP. `aria-posinset` is derived from the
// row's index in the FULL 300-item list (ValueRow's `posinset` prop), so if
// clicking "Rename" ever opened a different row than the one under the
// pointer, its posinset would read wrong the moment edit mode replaces the
// row's children (the <a> included, so a naive by-id lookup has nothing left
// to check against — posinset survives because it is set on the <li> itself,
// not derived from what is currently rendered inside it).
const rowsSnapshot = await ul.evaluate((el) =>
  [...el.querySelectorAll("li")]
    .filter((li) => !li.hasAttribute("data-virtual-spacer"))
    .map((li) => ({ text: li.textContent.trim(), posinset: li.getAttribute("aria-posinset") }))
)
const mid = rowsSnapshot[Math.floor(rowsSnapshot.length / 2)]
console.log("editing row:", JSON.stringify(mid))

const allLis = ul.locator("li:not([data-virtual-spacer])")
const targetLi = allLis.nth(Math.floor(rowsSnapshot.length / 2))
await targetLi.locator('button[aria-label="More actions"]').click()
await page.waitForTimeout(300)
await page.getByRole("menuitem", { name: "Rename" }).click()
const valueInput = targetLi.locator('input[aria-label="Option"]')
await valueInput.waitFor({ state: "visible", timeout: 5000 })

const posinsetAfter = await targetLi.getAttribute("aria-posinset")
console.log("posinset before edit mode:", mid.posinset, "/ after:", posinsetAfter)

await browser.close()

if (posinsetAfter !== mid.posinset) {
  console.error("FAIL: the row that opened for editing is not the row under the pointer")
  process.exit(1)
}
console.log("PASS: window moved on scroll, and the edited row's identity survived the edit-mode swap")
