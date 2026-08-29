// This lane's own screens — the three places a chart landed where only bare
// text sat before: an account's Impact tab (per-app), an app's Impact tab
// (per-process), and an account's Rates tab (the margin breakdown).
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"   // staging, alaap@kwapso.com's team
const ACCOUNT = "01KZXBT5T6CVY065QVW9M2S47G" // Confia — 1 app, 4 processes on it
const APP = "01KZXD652HR0RPQF70BYJ09NQ8"     // Confia's one app

// Click the named tab, then scroll the new chart's own heading into view — the
// chart sits well below the fold on every width, and the rig's screenshot is
// the viewport, not the full page, so without this the "after" shot would just
// be a taller version of the "before" shot with nothing to compare. The BEFORE
// run has no such heading yet (that is the whole point of shooting it first),
// so a miss falls back to a fixed scroll rather than failing the capture.
const clickTab = (name, chartTitle) => async (page) => {
  await page.getByRole("tab", { name: new RegExp(`^${name}\\b`) }).first().click()
  // Data lands after the click (a fetch, then a render), and whatever sits
  // above the chart can still reflow while that happens — so this polls for
  // several seconds, re-scrolling to the heading's CURRENT position every
  // beat, rather than scrolling once and trusting the page to hold still.
  await page.evaluate(async (title) => {
    for (let i = 0; i < 10; i++) {
      const el = [...document.querySelectorAll("h3,p,span,div")].find(
        (n) => n.children.length === 0 && n.textContent.trim() === title
      )
      if (el) el.scrollIntoView({ block: "center" })
      await new Promise((r) => setTimeout(r, 400))
    }
  }, chartTitle)
}

const WIDTHS = ["phone", "tablet", "laptop", "wide"]
const THEMES = ["light", "dark"]

const SCREENS = [
  ["account-impact", `/t/${TEAM}/accounts/${ACCOUNT}`, clickTab("Impact", "Hours a month, by app")],
  ["account-rates",  `/t/${TEAM}/accounts/${ACCOUNT}`, clickTab("Rates", "Sold, our time and tools, side by side")],
  ["app-impact",     `/t/${TEAM}/apps/${APP}`,         clickTab("Impact", "Hours a month, by process")],
]

export default SCREENS.flatMap(([name, path, prep], i) =>
  WIDTHS.flatMap((width) =>
    THEMES.map((theme) => [
      `${String(i + 1).padStart(2, "0")}-${name}-${width}-${theme}`,
      { width, theme, path, prep },
    ])
  )
)
