// Screen capture rig for a design lane. Real Chromium, a real staging session,
// every width the app is meant to survive, both themes.
//
// Lifted from fix/design-batch-one's .lane-shots/, which proved it works against
// real staging data, and widened: that lane shot two widths because it was
// checking two faults. A lane REBUILDING a screen has to see it at four, because
// the failure this catches — a column that spills, a rail that overlaps, a table
// that will not scroll inside its own box — appears at exactly one of them and is
// invisible at the others.
//
//   node scripts/lane-shots/shoot.mjs <out-dir> <screens.mjs>
//
// <screens.mjs> default-exports an array of [name, opts]; opts is
// { width, theme, path, prep? } and `prep` is an async (page) => {} that puts the
// screen into the state being captured (typing a search, opening a dialog).
// Widths are named, not numbers, so a filename says what it was.
//
// Needs: KW_SESSION (a staging session cookie — see .session-notes for how one is
// minted) and a dev server already serving BASE.
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

const OUT = process.argv[2]
const LIST = process.argv[3]
const BASE = process.env.SHOOT_BASE || "http://localhost:3055"
const TOKEN = process.env.KW_SESSION
if (!OUT || !LIST) { console.error("usage: shoot.mjs <out-dir> <screens.mjs>"); process.exit(1) }
if (!TOKEN) { console.error("KW_SESSION is not set — the shots would all be the sign-in page."); process.exit(1) }
mkdirSync(OUT, { recursive: true })

// The four the app must survive. phone/laptop are where the app lives; tablet is
// where a two-column layout has to decide; wide is where a centred column either
// holds its measure or strands the reader (R29).
const WIDTHS = {
  phone:  { width: 390,  height: 844 },
  tablet: { width: 768,  height: 1024 },
  laptop: { width: 1280, height: 800 },
  wide:   { width: 1920, height: 1080 },
}

const browser = await chromium.launch()

async function shot(name, { width, theme, path: url, prep }) {
  const size = WIDTHS[width]
  if (!size) throw new Error(`unknown width "${width}" — one of ${Object.keys(WIDTHS).join(", ")}`)
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 })
  await ctx.addCookies([{ name: "kwapso_session", value: TOKEN, domain: "localhost", path: "/" }])
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("theme", t); localStorage.setItem("kwapso:install-prompt-dismissed", "1") } catch {}
  }, theme)
  const page = await ctx.newPage()
  page.on("console", () => {})
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" })
  // The shell resolves client-side; wait for the nav to exist, then let it settle.
  await page.waitForFunction(() => document.querySelectorAll("nav button, nav a").length > 0, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(6000)
  // Dismiss the PWA install sheet if it got through.
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Not now"); if(b) b.click() })
  await page.waitForTimeout(800)
  if (prep) { await prep(page); await page.waitForTimeout(1800) }
  // Hide Next's dev indicator — it is the toolchain talking, not the app, and
  // these files go to the owner beside his own comparison shots.
  await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important }" })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log("  ✓", `${OUT}/${name}.png`)
  await ctx.close()
}

const screens = (await import(resolve(LIST))).default
let bad = 0
for (const [name, opts] of screens) {
  try { await shot(name, opts) } catch (e) { bad++; console.log("  ✗", name, e.message.split("\n")[0]) }
}
await browser.close()
console.log(`\n${screens.length - bad}/${screens.length} captured into ${OUT}`)
// A lane that silently captured nothing looks exactly like a lane with nothing
// to fix, so the exit code has to disagree.
if (bad === screens.length) process.exit(1)
