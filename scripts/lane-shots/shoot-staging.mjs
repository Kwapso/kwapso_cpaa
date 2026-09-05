// The INTEGRATED result, against deployed staging. Each lane checks its own
// work; nobody checks what they add up to. No dev server — this is the real site.
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { FRONT_DOORS } from "../lib/front-doors.mjs"
const BASE = FRONT_DOORS.staging.agency
const API = "https://kwapso-staging.kwapso.workers.dev"
const KEY = process.env.TEST_LOGIN_KEY
const OUT = process.argv[2] || "/tmp/staging-shots"
mkdirSync(OUT, { recursive: true })

const start = await fetch(`${API}/api/auth/admin/test-login`, {
  method: "POST", headers: { "content-type": "application/json", "x-admin-key": KEY },
  body: JSON.stringify({ email: "alaap@kwapso.com" }),
}).then(r => r.json())
const verify = await fetch(`${API}/api/auth/email/verify`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "alaap@kwapso.com", code: start.code }),
})
const token = (verify.headers.get("set-cookie") ?? "").split(";")[0].split("=")[1]
if (!token) { console.log("no session"); process.exit(1) }

const WIDTHS = { phone: [390,844], tablet: [768,1024], laptop: [1280,800], wide: [1920,1080] }
// A record screen and a deep-linked one are here on purpose: they took the
// state-swap change today, and a detail page's chrome is drawn by a different
// composition from a collection's.
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"
const SCREENS = [
  ["home", "/"],
  ["tickets", "/tickets"],
  ["knowledge", "/knowledge"],
  ["accounts", "/accounts"],
  ["ticket-detail", "/tickets/01M0DJKV43EKSZZDZB3SRWCNYX"],
  ["stories", `/t/${TEAM}/stories`],
  ["work-logs", `/t/${TEAM}/work-logs`],
  ["settings", `/t/${TEAM}/settings`],
]
const browser = await chromium.launch()
const problems = []
for (const [name, path] of SCREENS) {
  for (const [wname,[w,h]] of Object.entries(WIDTHS)) {
    for (const theme of ["light","dark"]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
      await ctx.addCookies([{ name: "kwapso_session", value: token, domain: new URL(BASE).hostname, path: "/" }])
      await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("kwapso:install-prompt-dismissed","1") } catch {} }, theme)
      const page = await ctx.newPage()
      const errs = []
      page.on("pageerror", e => errs.push(String(e).slice(0,120)))
      await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(()=>{})
      await page.waitForTimeout(7000)
      // Does the page scroll sideways? That is the failure a screenshot hides.
      const overflow = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
      const file = `${OUT}/${name}-${wname}-${theme}.png`
      await page.screenshot({ path: file })
      if (overflow > 2) problems.push(`${name} ${wname} ${theme}: page scrolls sideways by ${overflow}px`)
      if (errs.length) problems.push(`${name} ${wname} ${theme}: ${errs[0]}`)
      await ctx.close()
    }
  }
  console.log(`  shot ${name} at 4 widths x 2 themes`)
}
await browser.close()
console.log(problems.length ? "\nPROBLEMS:\n" + problems.map(p=>"  "+p).join("\n") : "\nno horizontal overflow and no page errors on any of the 32")
