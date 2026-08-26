// AN EMAIL TO A CUSTOMER IS NOT A SIDE EFFECT.
//
// THE OWNER, 26 Aug 2026: "We need to add a switch at the time of granting portal
// access that would say whether an email is allowed or not."
//
// Before this, granting a login sent nothing at all, so a client learned their
// portal existed only if somebody remembered to type the address into a mail by
// hand. The cure adds an outbound message to a WRITE, which is a new class of
// mistake for this door: mailing somebody who was not meant to be mailed yet.
// These lock the four things that keep it honest.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { EMAIL_CENSUS } from "@shared/rules/registry"
import { recordLink } from "@shared/workers/record-link"

const HERE = join(__dirname, "..")
const ROOT = join(HERE, "..", "..")
const read = (p: string) => readFileSync(join(HERE, p), "utf8")

describe("the portal welcome only goes when it was asked for", () => {
  it("the door reads `notify` as a LITERAL true, never as a truthy value", () => {
    const src = read("src/routes/accounts.ts")
    // Positional, the way R20 identifies a checked field: the body field has to
    // sit inside the comparison. `if (body.notify)` would mail a customer on the
    // string "false", and every JSON body in the wild eventually carries one.
    expect(
      /body\.notify === true/.test(src),
      "the grant door must gate the welcome on `body.notify === true` — a truthy check mails people by accident"
    ).toBe(true)
    expect(
      /if\s*\(\s*body\.notify\s*\)/.test(src),
      "a truthy check on body.notify has appeared"
    ).toBe(false)
  })

  it("the machine surface reads it the same way the door does", () => {
    // R22 says the tool must FORWARD every body field its door reads; this says
    // it must forward it with the same meaning. A tool that sent `notify: "no"`
    // as truthy would mail a client through the assistant on a word that says
    // the opposite.
    const catalogue = readFileSync(join(ROOT, "shared", "workers", "tool-catalog.ts"), "utf8")
    const tool = /name: "grant_portal_access"[\s\S]*?\n  \},\n/.exec(catalogue)?.[0] ?? ""
    expect(tool, "grant_portal_access is not in the catalogue any more").not.toBe("")
    expect(tool).toContain("notify: i.notify === true")
  })

  it("the send never throws and never claims a success it did not have", () => {
    const src = read("src/lib/portal-welcome.ts")
    // It returns the send door's own answer. `sendBrandedEmail` swallows its
    // errors and reports whether the message was accepted, which is the only
    // honest thing to put in the response the screen reads.
    expect(src).toContain("return sendBrandedEmail(")
    // …and refuses outright rather than sending a welcome with no portal in it.
    expect(src).toContain("if (!link) return false")
  })

  it("the link is the PORTAL's, built by the one helper, and the agency has none", () => {
    const env = { PUBLIC_APP_URL: "https://agency.example", PUBLIC_PORTAL_URL: "https://client.example" }
    const forClient = recordLink(env, "portal", { kind: "portalHome" })
    expect(forClient?.url, "a client must be sent to the portal's own origin").toBe(
      "https://client.example/home"
    )
    // R21 in one assertion: there is no agency address for this message, so no
    // call site can accidentally hand a client a door they may not pass.
    expect(
      recordLink(env, "agency", { kind: "portalHome" }),
      "a staff member has no portal to be welcomed to — this must have no agency destination"
    ).toBe(null)
    // An unconfigured origin is silence, never a link to nowhere.
    expect(recordLink({ PUBLIC_APP_URL: env.PUBLIC_APP_URL }, "portal", { kind: "portalHome" })).toBe(null)
  })

  it("it is classified, and classified as what it is", () => {
    const entry = EMAIL_CENSUS["workers/tenancy/src/lib/portal-welcome.ts::sendPortalWelcome"]
    expect(entry, "R30: an unclassified send").toBeTruthy()
    expect(entry.refersToRecord, "it carries a ctaUrl, so it is a `record` send").toBe(true)
  })
})
