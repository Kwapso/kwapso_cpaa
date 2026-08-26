// THE ONE EMAIL THIS WORKER SENDS TO A CLIENT.
//
// THE OWNER, 26 Aug 2026: "We need to add a switch at the time of granting
// portal access that would say whether an email is allowed or not. If it's
// checked at the time of granting portal access, then an email will be sent from
// our email address that we are using to send all other emails."
//
// WHAT WAS THERE BEFORE: nothing. Switching a login on wrote a row and told
// nobody, so the client learned their portal existed when a person at the agency
// remembered to type the address into a mail by hand — and the address is
// configuration exactly because nobody should be typing it from memory
// (portal.kwapso.app is a DIFFERENT live product of the owner's; the portal is
// client.kwapso.app / staging-client.kwapso.app). A hand-typed welcome is one
// wrong hostname away from telling a customer to sign in somewhere else.
//
// WHY IT IS OPT-IN AND NOT AUTOMATIC. Because sending mail to a customer is the
// agency's decision, not the software's. A login is sometimes switched on days
// before anybody means to tell the client — during a migration, ahead of a
// kick-off, to test the fence — and an email that goes out on the same keystroke
// takes that timing away. The switch sits beside the button so the choice is made
// at the moment of the act, with the consequence written next to it.
//
// R30: this is a `record` send. It carries a `ctaUrl`, that URL is built by the
// one helper, and its audience is `portal` — because the recipient decides which
// app the link opens, and this recipient has just become a client.
//
// BEST EFFORT, LIKE EVERY OTHER SEND. The grant has already committed when this
// runs; a mail failure must never undo a login. The caller is told what actually
// happened so it can say so rather than assume.

import { brand } from "@shared/brand"
import { sendBrandedEmail } from "@shared/workers/notify"
import { frontDoorOrigin, recordLink } from "@shared/workers/record-link"

import type { Env } from "../env"

/** Tell a new client login where their portal is, and what they will find in it.
 * Returns whether the send door accepted the message — never throws, and never
 * reports success it did not have. */
export async function sendPortalWelcome(
  env: Env,
  to: string,
  opts: { personName: string; teamName: string }
): Promise<boolean> {
  const link = recordLink(env, "portal", { kind: "portalHome" })
  // NO LINK, NO EMAIL. An unconfigured portal origin would produce a welcome
  // that says "here is your portal" and names no portal — worse than the silence
  // it replaces, because it looks like the message got lost rather than never
  // sent. The caller reports the false and the screen says so.
  if (!link) return false
  const first = opts.personName.trim().split(/\s+/)[0] || ""
  return sendBrandedEmail(
    env,
    to,
    `Your ${opts.teamName} portal is ready`,
    {
      heading: `Your ${opts.teamName} portal is ready`,
      intro:
        `${first ? `Hello ${first}. ` : ""}${opts.teamName} has given you a login to their client portal. ` +
        `You can see the work in progress, raise a request and follow it through, and read anything shared with you. ` +
        `Sign in with this email address — there is no password to remember, we send you a code.`,
      ctaLabel: link.label,
      ctaUrl: link.url,
      footnote: `If you weren't expecting this, you can ignore this email and nobody will be able to sign in as you.`,
    },
    // The recipient is a CLIENT, so every absolute URL in this message — the
    // logo included — resolves against the portal's origin and never the
    // agency's (R21: an agency hostname in a client's inbox advertises a door
    // they may not pass).
    frontDoorOrigin(env, "portal")
  )
}

/** The product's own name, re-exported so the route can name it in a refusal
 * without importing the brand twice. */
export const PRODUCT = brand.name
