// PROTOTYPE verification for the ScreenShell/AppShell experiment
// (experiment/screen-shell-appshell branch, web/components/app-shell.tsx).
// Not for commit to the lane branch — screenshots + the navigation-identity
// check the planner asked for, before any merge.
// KW_SESSION=<cookie value> node scripts/lane-shots/verify-screen-shell-appshell.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = ".lane-shots/screen-shell-appshell"
mkdirSync(OUT, { recursive: true })

const WIDTHS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 900 },
  wide: { width: 1920, height: 1080 },
}

const browser = await chromium.launch()

for (const width of Object.keys(WIDTHS)) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: WIDTHS[width], deviceScaleFactor: 2 })
    await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
    await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t) } catch {} }, theme)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/t/${TEAM}/home`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important }" })
    await page.screenshot({ path: `${OUT}/${width}-${theme}.png`, fullPage: false })
    console.log("  ✓", `${OUT}/${width}-${theme}.png`)
    await ctx.close()
  }
}

// NAVIGATION IDENTITY CHECK — the thing a still frame cannot prove. Grab a
// handle to the rail's own root DOM node (an ElementHandle is a reference to
// one specific node, not a live query), then click through four different
// sections and re-query the SAME selector each time, comparing the fresh
// query against the ORIGINAL handle with `===`. Two different DOM nodes that
// merely look alike (same aria-label, same content) are never `===`; only
// the literal same object survives an unmount+remount as `===`. This also
// doubles as a React-mount-count probe: app-shell.tsx's rail content is
// wrapped in a component whose top-level div carries `data-rail-collapsed`,
// stamped fresh only on a genuine (re)mount of that JSX subtree — so if the
// handle comparison ever says "different node", this file's own markup is
// what produced two of them, not a fluke of the selector.
{
  const ctx = await browser.newContext({ viewport: WIDTHS.laptop, deviceScaleFactor: 2 })
  await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
  const page = await ctx.newPage()

  await page.goto(`${BASE}/t/${TEAM}/home`, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2000)

  const RAIL_SELECTOR = '[data-slot="screen-shell-rail"]'
  const initialHandle = await page.evaluateHandle((sel) => document.querySelector(sel), RAIL_SELECTOR)
  const hadInitial = await page.evaluate((el) => el !== null, initialHandle)
  console.log("rail selector found on initial load:", hadInitial)
  if (!hadInitial) {
    console.log("Selector missed — dumping every aria-label in the doc for diagnosis:")
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[aria-label]")).map((el) => `${el.tagName}[aria-label="${el.getAttribute("aria-label")}"]`)
    )
    console.log(labels.join("\n"))
  }

  let allSame = hadInitial
  const sections = ["Accounts", "Tickets", "Stories", "Home"]
  for (const label of sections) {
    await page.getByRole("button", { name: new RegExp(`^${label}$`) }).first().click()
    await page.waitForTimeout(1200)
    const sameNode = await page.evaluate(
      ({ el, sel }) => document.querySelector(sel) === el,
      { el: initialHandle, sel: RAIL_SELECTOR }
    )
    const url = page.url()
    console.log(`after clicking "${label}" (${url}): rail node identity preserved = ${sameNode}`)
    allSame = allSame && sameNode
  }

  console.log(
    allSame
      ? "PASS: the rail's DOM node was the exact same object across all four navigations"
      : "FAIL: the rail node changed identity at some point — it unmounted and remounted"
  )
  await ctx.close()
}

await browser.close()
