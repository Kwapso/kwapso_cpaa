// Throwaway verification for the StepperHero prototype (help-status-stepper.tsx
// swap from StatusStepper to the kit's StepperHero, in RecordChrome's `hero`
// slot). KW_SESSION=<cookie value> node scripts/lane-shots/verify-stepper-hero.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const REAL_ID = "01M0DJKV43EKSZZDZB3SRWCNYX"
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = ".lane-shots/stepper-hero"
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
    await page.goto(`${BASE}/tickets/${REAL_ID}`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important }" })
    await page.screenshot({ path: `${OUT}/${width}-${theme}.png`, fullPage: false })
    console.log("  ✓", `${OUT}/${width}-${theme}.png`)
    await ctx.close()
  }
}
await browser.close()
