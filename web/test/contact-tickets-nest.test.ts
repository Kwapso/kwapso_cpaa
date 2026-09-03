// A TICKET RAISED FOR A CONTACT NESTS UNDER THEM, THE SAME WAY AN APP'S OWN
// TICKETS TAB ALREADY DOES.
//
// THE CLIENT, verbatim: "for example now i went inside an app, and then inside
// a ticket - and what happened is that i was 3 levels deep but only had 2 tabs
// - it switched … should not be like this at all … do not redirect, keep
// adding tabs."
//
// Tracing the actual click path for that exact journey (Apps → an app's own
// record → its nested Tickets tab → a ticket) shows `AppTicketsPanel`
// (work-panels.tsx) already builds the nested address correctly — off
// `host.base`, the record's own address, exactly as `deep-link/route.ts`'s
// `trailPath` expects. It could not be reproduced there.
//
// The SAME shape of bug — a ticket (or a meeting) opened from inside a
// nested tab landing on the FLAT top-level address instead of nesting under
// the record it was raised for — was still live on the sibling panel:
// `ContactTicketsPanel` / `ContactMeetingsPanel` (contact-panels.tsx), a
// contact's own Tickets/Meetings tabs. Both rebuilt their link off
// `basePath.replace(/\/accounts$/, "/tickets")` — the exact anti-pattern
// `deep-link/route.ts`'s own header comment names as the OTHER half of the
// 24 Aug 2026 bug ("the panels … stripped the collection segment off the path
// … before appending, so opening a story from a client deliberately left the
// client behind"). `basePath` there was already the SECTION path, with no
// record id on it at all, so the swap could never have carried the contact's
// id forward — the base it rewrote from was already the wrong shape to nest
// under.
//
// This locks the fix at the source level (no React render needed): both
// panels take a `host: PanelHost` — the contact's own address — and build
// off `host.base`, never a section-path rewrite.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")
const panels = stripComments(
  readFileSync(join(WEB, "components", "contact-panels.tsx"), "utf8")
)
const detail = stripComments(
  readFileSync(join(WEB, "components", "contact-detail.tsx"), "utf8")
)

describe("a contact's own Tickets/Meetings tabs nest, never rebuild a flat base", () => {
  it("the old section-swap anti-pattern is gone", () => {
    expect(
      panels.includes(".replace(/\\/accounts$/"),
      "contact-panels.tsx must not rebuild a flat top-level base off the " +
        "section path — that is the exact shape of the bug the 24 Aug 2026 " +
        "fix retired everywhere else (deep-link/route.ts's own header " +
        "comment). A ticket or meeting opened from here must nest under the " +
        "contact, off `host.base`, like AppTicketsPanel already does."
    ).toBe(false)
  })

  it("both panels take the record's own address, not the bare section path", () => {
    for (const name of ["ContactTicketsPanel", "ContactMeetingsPanel"]) {
      const fn = new RegExp(`export function ${name}\\(\\{([\\s\\S]*?)\\}\\)`).exec(panels)?.[1] ?? ""
      expect(fn.includes("host"), `${name} must take a \`host\` prop`).toBe(true)
    }
  })

  it("the links are built off host.base, never a section-path rewrite", () => {
    expect(panels).toContain("`${host.base}/tickets`")
    expect(panels).toContain("`${host.base}/meetings`")
  })

  it("the record screen hands both panels its OWN address, not the raw section path", () => {
    // The bug's root: `basePath` handed straight through was the accounts
    // SECTION path (no id on it) — so the caller must build `host` off its
    // own record id before handing it down.
    expect(detail).toMatch(/const host = \{ base: `\$\{basePath\}\/\$\{accountId\}` \}/)
    expect(detail).toMatch(/<ContactTicketsPanel accountId=\{accountId\} host=\{host\} \/>/)
    expect(detail).toMatch(/<ContactMeetingsPanel accountId=\{accountId\} host=\{host\} \/>/)
  })
})
