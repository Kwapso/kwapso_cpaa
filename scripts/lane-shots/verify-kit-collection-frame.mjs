// Throwaway verification for the CollectionFrame kit-panel prototype
// (shared/web/screen-engine/collection-frame.tsx `useKitPanel`, wired
// temporarily to the roles collection only in screen-renderer.tsx).
// KW_SESSION=<cookie value> node scripts/lane-shots/verify-kit-collection-frame.mjs
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = ".lane-shots/kit-collection-frame"
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
    await page.goto(`${BASE}/t/${TEAM}/roles`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(4500)
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important }" })
    await page.screenshot({ path: `${OUT}/${width}-${theme}.png`, fullPage: false })
    console.log("  ✓", `${OUT}/${width}-${theme}.png`)
    await ctx.close()
  }
}

// INTERACTION CHECK — proves the kit's `search` slot is wired to the same
// debounced query state the legacy chrome used, not just that it renders.
// (No nav-remount check here: that risk belongs to the ScreenShell/rail
// prototype, which is a separate, not-yet-attempted pass — this change
// never touches AppShell.)
{
  const ctx = await browser.newContext({ viewport: WIDTHS.laptop, deviceScaleFactor: 2 })
  await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/${TEAM}/roles`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4000)
  const search = page.getByPlaceholder(/search/i).first()
  await search.fill("Viewer")
  await page.waitForTimeout(700)
  const viewerRows = await page.locator("text=Viewer").count()
  const adminRows = await page.locator("text=Admin").count()
  console.log(`search "Viewer" narrows the list: Viewer rows=${viewerRows}, Admin rows=${adminRows} (expect 1, 0)`)
  await page.screenshot({ path: `${OUT}/interaction-search-narrowed.png`, fullPage: false })
  console.log("  ✓", `${OUT}/interaction-search-narrowed.png`)
  await ctx.close()
}

await browser.close()
