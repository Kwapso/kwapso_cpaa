// Verification for the RecordScreen state-swap rollout (help-detail prototype,
// commit 73414c58): loading / error / empty, chrome-persists-while-panel-
// swaps, on whichever record screen this is pointed at.
//
// Not part of the reusable shoot.mjs rig because it needs route interception
// (delay/abort a specific request) that shoot.mjs's prep() doesn't do.
//
//   KW_SESSION=<cookie> node scripts/lane-shots/verify-record-states.mjs <kind> [only]
//   <kind>: one of the keys in RECORDS below.
//   [only]: "loading" | "error" | "empty" — omit to shoot all three.
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://localhost:3055"
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"
const FAKE_ID = "01AAAAAAAAAAAAAAAAAAAAAAAA" // valid ULID shape, no such row

// One entry per screen this has been run against. `path` is the URL segment
// (clean top-level) or the full `t/<team>/<module>` deep-link prefix — either
// works, this just appends `/<id>`. `apiPattern` is what gets delayed
// (loading) or aborted (error) — the door this screen's own query reads.
// `hasError` is false for a screen with no error branch to shoot (its data
// arrives as host-fed props, not its own query — task-detail today).
const RECORDS = {
  help: { path: "tickets", realId: "01M0DJKV43EKSZZDZB3SRWCNYX", apiPattern: "**/api/content/help*", hasError: true },
  story: { path: "stories", realId: "01M0YHZZ8BNADAHKVA25YA5ZAT", apiPattern: "**/api/content/stories?*", hasError: true },
  task: { path: "tasks", realId: "01M0CAGMC6AYY6PHJDV9PTPXM3", apiPattern: "**/api/content/tasks*", hasError: false },
  account: { path: `t/${TEAM}/accounts`, realId: "01M0YCM30PRASKYJC7MER9C7AN", apiPattern: "**/api/tenancy/accounts/detail*", hasError: true },
  app: { path: `t/${TEAM}/apps`, realId: "01KZXD6DQZSEYS5D39QHHDAM9T", apiPattern: "**/api/tenancy/apps*", hasError: true },
  knowledge: { path: `t/${TEAM}/knowledge`, realId: "01M165ZD4MBEVT47HJEEQHJM7Y", apiPattern: "**/api/content/knowledge*", hasError: true },
  meeting: { path: `t/${TEAM}/meetings`, realId: "01M0B1J2JC05M83YZRXEBF4DDJ", apiPattern: "**/api/content/meetings*", hasError: true },
  process: { path: `t/${TEAM}/processes`, realId: "01M0Y5YG0F860X9EJXKKA178R7", apiPattern: "**/api/tenancy/processes*", hasError: true },
  role: { path: `t/${TEAM}/roles`, realId: "01KZWXFHVTT7SZXCN3N2FDNY46", apiPattern: "**/api/tenancy/roles*", hasError: true },
  selectable: { path: `t/${TEAM}/dropdowns`, realId: "5a52269589deb373b89be75443731610", apiPattern: "**/api/tenancy/selectable*", hasError: true },
  sprint: { path: `t/${TEAM}/sprints`, realId: "01M0W6BVBBRJXXAP6TCV70Z9AD", apiPattern: "**/api/content/sprints*", hasError: true },
  wave: { path: `t/${TEAM}/waves`, realId: "01M0W6BK1PTRDQK8H53KMMJ34P", apiPattern: "**/api/tenancy/waves*", hasError: true },
}

const kind = process.argv[2]
const only = process.argv[3]
const record = RECORDS[kind]
if (!record) { console.error(`usage: verify-record-states.mjs <${Object.keys(RECORDS).join("|")}> [loading|error|empty]`); process.exit(1) }
const TOKEN = process.env.KW_SESSION
if (!TOKEN) { console.error("KW_SESSION not set"); process.exit(1) }
const OUT = `.lane-shots/${kind}-detail-states`
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

for (const width of ["phone", "laptop"]) {
  for (const theme of ["light", "dark"]) {
    if ((!only || only === "loading"))
      await shot(`loading-${width}-${theme}`, width, theme, {
        url: `/${record.path}/${record.realId}`,
        routePrep: async (page) => {
          await page.route(record.apiPattern, async (route) => {
            await new Promise((r) => setTimeout(r, 30000))
            await route.continue()
          })
        },
      })
    if (record.hasError && (!only || only === "error"))
      await shot(`error-${width}-${theme}`, width, theme, {
        url: `/${record.path}/${record.realId}`,
        routePrep: async (page) => {
          await page.route(record.apiPattern, (route) => route.abort("failed"))
        },
      })
    if (!only || only === "empty")
      await shot(`empty-${width}-${theme}`, width, theme, { url: `/${record.path}/${FAKE_ID}` })
  }
}

await browser.close()
console.log("done")
