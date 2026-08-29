// One-off verification: help-detail.tsx's three new RecordScreen states
// (loading / error / empty) — chrome-persists-while-panel-swaps, prototyped
// on this one screen per the planner's scope-discipline instruction.
//
// Not part of the reusable shoot.mjs rig because it needs route interception
// (delay/abort a specific request) that shoot.mjs's prep() doesn't do.
//
//   KW_SESSION=<cookie> node scripts/lane-shots/verify-help-states.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const REAL_TICKET = "01M0DJKV43EKSZZDZB3SRWCNYX"
const FAKE_TICKET = "01AAAAAAAAAAAAAAAAAAAAAAAA" // valid ULID shape, no such row
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = ".lane-shots/help-detail-states"
mkdirSync(OUT, { recursive: true })

const WIDTHS = { phone: { width: 390, height: 844 }, laptop: { width: 1280, height: 900 } }

const browser = await chromium.launch()

async function shot(name, width, theme, { url, routePrep }) {
  const ctx = await browser.newContext({ viewport: WIDTHS[width], deviceScaleFactor: 2 })
  await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t) } catch {} }, theme)
  const page = await ctx.newPage()
  if (routePrep) await routePrep(page)
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(5500)
  await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important }" })
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log("  ✓", `${OUT}/${name}.png`)
  await ctx.close()
}

const only = process.argv[2] // "loading" | "error" | "empty" | undefined (all)

for (const width of ["phone", "laptop"]) {
  for (const theme of ["light", "dark"]) {
    if (!only || only === "loading")
      // LOADING — delay the help list + by-id doors well past this script's
      // own wait, so the screenshot lands mid-spin every time.
      await shot(`loading-${width}-${theme}`, width, theme, {
        url: `/tickets/${REAL_TICKET}`,
        routePrep: async (page) => {
          await page.route("**/api/content/help*", async (route) => {
            await new Promise((r) => setTimeout(r, 30000))
            await route.continue()
          })
        },
      })
    if (!only || only === "error")
      // ERROR — the ticket list door itself fails.
      await shot(`error-${width}-${theme}`, width, theme, {
        url: `/tickets/${REAL_TICKET}`,
        routePrep: async (page) => {
          await page.route("**/api/content/help?*", (route) => route.abort("failed"))
          await page.route("**/api/content/help", (route) => route.abort("failed"))
        },
      })
    if (!only || only === "empty")
      // EMPTY — a well-formed id nothing answers to.
      await shot(`empty-${width}-${theme}`, width, theme, { url: `/tickets/${FAKE_TICKET}` })
  }
}

await browser.close()
console.log("done")
