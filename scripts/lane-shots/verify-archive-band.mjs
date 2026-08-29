// PROTOTYPE verification for the archive `band` seam on Tickets
// (useKitPanel + band, wired temporarily in tickets-collection.tsx).
// KW_SESSION=<cookie value> node scripts/lane-shots/verify-archive-band.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = ".lane-shots/archive-band"
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
    await page.goto(`${BASE}/tickets`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    await page.getByRole("tab", { name: /Archived/i }).first().click().catch(async () => {
      // Fall back to a plain click if it isn't exposed with the tab role.
      await page.getByText(/^Archived$/).first().click().catch(() => {})
    })
    await page.waitForTimeout(2000)
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important }" })
    await page.screenshot({ path: `${OUT}/${width}-${theme}.png`, fullPage: false })
    console.log("  ✓", `${OUT}/${width}-${theme}.png`)
    await ctx.close()
  }
}
await browser.close()
