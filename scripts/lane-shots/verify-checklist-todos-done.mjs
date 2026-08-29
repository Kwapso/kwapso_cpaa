// Screenshot rig for the TodosPanel done-pile Checklist swap
// (web/components/work-panels.tsx) — four widths, both themes, real staging
// data (the smoke team's completed to-dos). SESSION_COOKIE is minted the way
// this session's own notes describe (staging-session-on-a-local-worktree);
// needs a dev server already running against staging on VERIFY_PORT (default
// 3064).
//
//   SESSION_COOKIE=<kwapso_session value> node scripts/lane-shots/verify-checklist-todos-done.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const cookie = process.env.SESSION_COOKIE
if (!cookie) { console.error("SESSION_COOKIE not set"); process.exit(1) }
const PORT = process.env.VERIFY_PORT ?? "3064"
const TEAM = "01M0THFJC37525M1WD1PPWTPBY"
const OUT = "/tmp/checklist-shots"
mkdirSync(OUT, { recursive: true })

const WIDTHS = { phone: 390, tablet: 768, laptop: 1280, wide: 1920 }
const browser = await chromium.launch()

for (const theme of ["light", "dark"]) {
  for (const [name, width] of Object.entries(WIDTHS)) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies([{ name: "kwapso_session", value: cookie.replace("kwapso_session=", ""), domain: "localhost", path: "/" }])
    await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t) } catch {} }, theme)
    const page = await ctx.newPage()
    await page.goto(`http://localhost:${PORT}/t/${TEAM}/tasks`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("text=Waiting on them", { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    // Click into the Done tab of the "waiting on them" (TodosPanel) section.
    const doneTab = page.getByRole("tab", { name: /Done/ }).last()
    if (await doneTab.count()) {
      await doneTab.click()
      await page.waitForSelector('[data-slot="checklist-item"]', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
    const file = `${OUT}/${theme}-${name}.png`
    await page.screenshot({ path: file, fullPage: false })
    console.log("saved", file)
    await ctx.close()
  }
}
await browser.close()
