import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// A CODE IN THE INBOX MUST ALWAYS HAVE SOMEWHERE TO BE TYPED.
//
// The sign-in door refuses a second send within 60 seconds with `too_soon`.
// That refusal is not a failure: a code was minted, it was emailed, and it is
// still valid. Both sign-in screens used to treat every rejection the same way
// — set an error, stay on the email step — which left a person holding a
// working code with no field to enter it in. On a slow connection, one
// double-click was enough to get there.
//
// Both apps are checked here because they are two files that have to agree, and
// the portal's whole promise is that it has no dead ends.
//
// This reads the source rather than rendering, because the branch is a
// three-line early return: a render test would pass on a component that merely
// *imports* the right things. What matters is that `too_soon` reaches
// `setStep("code")` and does NOT fall through to `setError`.

const SIGN_IN_SCREENS = [
  { app: "the agency app", file: "web/components/temp/auth-card.tsx" },
  { app: "the client portal", file: "web-portal/components/sign-in.tsx" },
]

const ROOT = resolve(__dirname, "../..")

function source(file: string) {
  return readFileSync(resolve(ROOT, file), "utf8")
}

/** The body of the `catch` that wraps the send call. */
function sendCatchBlock(text: string) {
  const start = text.indexOf("auth.startEmail")
  expect(start, "the send call must exist").toBeGreaterThan(-1)
  const catchAt = text.indexOf("} catch", start)
  expect(catchAt, "the send call must be wrapped in a catch").toBeGreaterThan(-1)
  const finallyAt = text.indexOf("} finally", catchAt)
  return text.slice(catchAt, finallyAt === -1 ? text.length : finallyAt)
}

describe("a sign-in cooldown moves the person on, it does not strand them", () => {
  for (const screen of SIGN_IN_SCREENS) {
    it(`${screen.app} sends a cooled-down caller to the code step`, () => {
      const block = sendCatchBlock(source(screen.file))

      // It must recognise the refusal by its code, not by its message — the
      // wording is copy and copy changes.
      expect(block, `${screen.file}: the catch must test for the too_soon code`).toContain('"too_soon"')

      // And recognising it must actually advance the screen.
      const branch = block.slice(block.indexOf('"too_soon"'))
      expect(branch, `${screen.file}: too_soon must move to the code step`).toContain('setStep("code")')
    })

    it(`${screen.app} does not show a cooldown as an error`, () => {
      const block = sendCatchBlock(source(screen.file))
      const branch = block.slice(block.indexOf('"too_soon"'))
      const endOfBranch = branch.indexOf("}")
      const inside = branch.slice(0, endOfBranch === -1 ? branch.length : endOfBranch)

      // The branch must leave before the generic error handling runs, or the
      // person gets moved to the code step AND told something went wrong.
      expect(inside, `${screen.file}: the too_soon branch must return early`).toContain("return")
      expect(inside, `${screen.file}: a cooldown is not an error`).not.toContain("setError")
    })
  }
})
