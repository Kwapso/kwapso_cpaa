// A lane copies this, points it at its own screens, and runs:
//   node scripts/lane-shots/shoot.mjs .lane-shots/before scripts/lane-shots/my-screens.mjs
// Name every file <nn>-<screen>-<width>-<theme> so the same name on both sides is
// provably the same shot.
const TEAM = "01KZWXFD86N0K3RZRBHKMKRWYS"   // staging, alaap@kwapso.com's team

// Put a screen into the state being captured. Kept beside the list because a
// prep is only meaningful next to the screen it prepares.
export const typeSearch = async (page) => {
  await page.evaluate(() => {
    const i = document.querySelector('input[type="search"]')
    if (!i) return
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    set.call(i, "zzzqqq"); i.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

const WIDTHS = ["phone", "tablet", "laptop", "wide"]
const THEMES = ["light", "dark"]

// Every screen at every width in both themes, which is the point of the rig.
const SCREENS = [
  ["home",      "/"],
  ["knowledge", "/knowledge"],
  ["tickets",   "/tickets"],
  ["invites",   `/t/${TEAM}/invites`],   // a deep-link screen, through the shell
]

export default SCREENS.flatMap(([name, path], i) =>
  WIDTHS.flatMap((width) =>
    THEMES.map((theme) => [
      `${String(i + 1).padStart(2, "0")}-${name}-${width}-${theme}`,
      { width, theme, path },
    ])
  )
)
