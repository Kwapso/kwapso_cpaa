"use client"

// THE SIGN-IN STATE MACHINE — one copy, for both front doors.
//
// Email → six-digit code → signed in. The two doors LOOK different on purpose
// (the agency app welcomes a colleague; the portal greets a client), so the
// chrome stays in each app's own component. What must never differ is the
// BEHAVIOUR, and it did: this state machine existed twice, and a bug had to be
// fixed twice on the same day. The fix survived only because a test was written
// to scan two files and check they still agreed. That test is now a behaviour
// test, because there is only one behaviour left to test.
//
// TWO DECISIONS THIS FILE OWNS:
//
// 1. THE CODE ONLY EVER GOES TO THE INBOX. It never rides a response and never
//    appears in a toast — a rule of the auth worker, and this is where it would
//    be broken first if someone "helpfully" surfaced it in dev.
//
// 2. A COOLDOWN IS NOT A FAILURE. The send door refuses a second request within
//    60 seconds with `too_soon`. A code WAS minted, it WAS emailed, and it still
//    works — so the person is moved to the code step and told the true thing.
//    Treating it as an error left someone holding a working code with nowhere to
//    type it; one double-click on a slow connection was enough to get there.
//    (It is not an account oracle either: the cooldown fires on the caller's own
//    previous send, whoever the address belongs to.)

import * as React from "react"

import { ApiFailure } from "./api"

/** Which half of the flow the screen is showing. */
export type SignInStep = "email" | "code"

/** The two auth doors, handed in rather than imported: each app keeps its own
 * honest inventory of the endpoints it calls (the portal's is checked against
 * its gateway's allow-list), so this hook takes the callers, not the URLs. */
export type SignInDoors = {
  startEmail: (email: string) => Promise<unknown>
  verifyEmail: (email: string, code: string) => Promise<unknown>
}

export type SignInMachine = {
  step: SignInStep
  email: string
  setEmail: (next: string) => void
  code: string
  busy: boolean
  /** The message to show under the field, or undefined when there's nothing wrong. */
  error: string | undefined
  /** Ask for a code. Safe to call from a form submit or a "resend" button. */
  sendCode: () => Promise<void>
  /** Type into the code field; a full six digits verifies itself. */
  enterCode: (next: string) => void
  /** Back to the email step, cleanly. */
  useDifferentEmail: () => void
}

export function useEmailSignIn({
  startEmail,
  verifyEmail,
  onSignedIn,
  /** A toast, a banner — whatever the app says success with. Optional so a test
   * can drive the machine with no UI at all. */
  announce,
}: SignInDoors & {
  onSignedIn: () => void
  announce?: (message: string) => void
}): SignInMachine {
  const [step, setStep] = React.useState<SignInStep>("email")
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  async function sendCode() {
    setBusy(true)
    setError(undefined)
    try {
      await startEmail(email)
      setStep("code")
      setCode("")
      announce?.("Code sent — check your email.")
    } catch (e) {
      // Decision 2 above. Recognised by its CODE, not its wording — copy changes.
      if (e instanceof ApiFailure && e.code === "too_soon") {
        setStep("code")
        setCode("")
        announce?.("A code is already on its way — check your email.")
        return
      }
      setError(e instanceof ApiFailure ? e.message : "Couldn't send the code.")
    } finally {
      setBusy(false)
    }
  }

  async function verify(full: string) {
    setBusy(true)
    setError(undefined)
    try {
      await verifyEmail(email, full)
      onSignedIn()
    } catch (e) {
      setCode("")
      setError(e instanceof ApiFailure ? e.message : "That didn't work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  function enterCode(next: string) {
    setCode(next)
    if (next.length === 6) void verify(next)
  }

  function useDifferentEmail() {
    setStep("email")
    setError(undefined)
  }

  return { step, email, setEmail, code, busy, error, sendCode, enterCode, useDifferentEmail }
}
