// A CODE IN THE INBOX MUST ALWAYS HAVE SOMEWHERE TO BE TYPED.
//
// The sign-in door refuses a second send within 60 seconds with `too_soon`. That
// refusal is not a failure: a code was minted, it was emailed, and it is still
// valid. Treating every rejection the same way — set an error, stay on the email
// step — left a person holding a working code with no field to enter it in. On a
// slow connection, one double-click was enough to get there.
//
// This used to be a SOURCE SCAN over two files, because the state machine existed
// twice (once per front door) and the only thing holding them together was a test
// that read both and checked they still agreed. There is one machine now
// (shared/web/use-email-sign-in.ts, rendered by both doors), so this is a plain
// behaviour test: drive it, and look at where the person ends up.

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ApiFailure } from "@shared/web/api"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"

/** The send door, refusing the way the auth worker refuses. */
const cooledDown = () => Promise.reject(new ApiFailure(429, "too_soon", "Hold on a moment."))

function machine(startEmail: (email: string) => Promise<unknown>, onSignedIn = vi.fn()) {
  return renderHook(() =>
    useEmailSignIn({ startEmail, verifyEmail: async () => ({}), onSignedIn })
  )
}

describe("a sign-in cooldown moves the person on, it does not strand them", () => {
  it("sends a cooled-down caller to the code step", async () => {
    const { result } = machine(cooledDown)
    await act(async () => {
      await result.current.sendCode()
    })
    expect(result.current.step, "a cooldown means a code IS in their inbox").toBe("code")
  })

  it("does not show a cooldown as an error", async () => {
    const { result } = machine(cooledDown)
    await act(async () => {
      await result.current.sendCode()
    })
    expect(result.current.error, "a cooldown is not an error").toBeUndefined()
  })

  it("still shows a REAL refusal as an error, on the email step", async () => {
    const { result } = machine(() =>
      Promise.reject(new ApiFailure(400, "bad_email", "That email doesn't look right."))
    )
    await act(async () => {
      await result.current.sendCode()
    })
    expect(result.current.step, "a rejected address has no code to type").toBe("email")
    expect(result.current.error).toBe("That email doesn't look right.")
  })

  it("a successful send reaches the code step too (the ordinary path)", async () => {
    const { result } = machine(async () => ({ ok: true }))
    await act(async () => {
      await result.current.sendCode()
    })
    expect(result.current.step).toBe("code")
    expect(result.current.error).toBeUndefined()
  })
})

describe("the machine both front doors render", () => {
  it("verifies as soon as six digits are typed, and signs the person in", async () => {
    const onSignedIn = vi.fn()
    const verifyEmail = vi.fn(async () => ({}))
    const { result } = renderHook(() =>
      useEmailSignIn({ startEmail: async () => ({}), verifyEmail, onSignedIn })
    )
    act(() => result.current.setEmail("someone@example.com"))
    await act(async () => {
      await result.current.sendCode()
    })
    act(() => result.current.enterCode("12345"))
    expect(verifyEmail, "five digits is not a code").not.toHaveBeenCalled()
    act(() => result.current.enterCode("123456"))
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce())
    expect(verifyEmail).toHaveBeenCalledWith("someone@example.com", "123456")
  })

  it("a wrong code clears the field and says so, without losing the step", async () => {
    const { result } = renderHook(() =>
      useEmailSignIn({
        startEmail: async () => ({}),
        verifyEmail: () => Promise.reject(new ApiFailure(400, "bad_code", "That code isn't right.")),
        onSignedIn: vi.fn(),
      })
    )
    await act(async () => {
      await result.current.sendCode()
    })
    act(() => result.current.enterCode("000000"))
    await waitFor(() => expect(result.current.error).toBe("That code isn't right."))
    expect(result.current.code, "the field is cleared so they can retype").toBe("")
    expect(result.current.step).toBe("code")
  })

  it("'use a different email' clears the error and goes back", async () => {
    const { result } = machine(cooledDown)
    await act(async () => {
      await result.current.sendCode()
    })
    act(() => result.current.useDifferentEmail())
    expect(result.current.step).toBe("email")
    expect(result.current.error).toBeUndefined()
  })
})
