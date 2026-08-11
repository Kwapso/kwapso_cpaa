// SWITCHING COMPANY HAS TO SAY IT IS SWITCHING.
//
// The move is a round trip AND a context re-read, and it takes a couple of
// seconds. The cache layer is stale-while-revalidate on purpose — dropping a key
// leaves the old value on screen until the new one lands (shared/web/store,
// `sync`) — so for those seconds the client saw the company they had just left,
// its requests, and nothing moving. "There's no subtle clean loading indicator
// which is a bit confusing" (owner, staging, Aug 2026).
//
// The bug underneath the missing indicator is a timing one, and it is the reason
// this is a render test rather than a source scan: the old flag was cleared in a
// `finally`, so even a spinner wired to it would have stopped a second or more
// before the new company appeared. The assertion that matters is the one in the
// middle — the POST has landed, the session has NOT, and the switcher must still
// be waiting.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const wire = vi.hoisted(() => ({
  /** Resolves the in-flight switch — the test decides when the POST lands. */
  land: () => {},
  switched: 0,
}))

vi.mock("@/lib/api", () => ({
  ApiFailure: class ApiFailure extends Error {},
  portal: {
    switchAccount: () =>
      new Promise<void>((resolve) => {
        wire.switched += 1
        wire.land = () => resolve()
      }),
  },
}))

const { AccountSwitcher } = await import("@/components/account-switcher")

const ACCOUNTS = [
  { id: "acc_a", name: "Northwind" },
  { id: "acc_b", name: "Contoso" },
]

describe("the switcher waits until the new company is actually on screen", () => {
  let root: Root | null = null
  let host: HTMLDivElement
  let switching: boolean[]

  async function show(currentAccountId: string) {
    await act(async () => {
      root?.render(
        React.createElement(AccountSwitcher, {
          accounts: ACCOUNTS,
          currentAccountId,
          onSwitched: () => {},
          onSwitching: (b: boolean) => switching.push(b),
        })
      )
    })
  }

  const trigger = () => host.querySelector("button") as HTMLButtonElement
  const waiting = () => trigger().getAttribute("aria-busy") === "true"
  /** The Spinner primitive renders role="status". */
  const spinner = () => trigger().querySelector('[role="status"]')

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    wire.switched = 0
    switching = []
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await show("acc_a")
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    host.remove()
    root = null
  })

  /** Open the menu (Radix opens on Enter) and pick the other company. */
  async function pickContoso() {
    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      )
    })
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes("Contoso")
    ) as HTMLElement | undefined
    expect(item, "the menu must offer the other company").toBeTruthy()
    await act(async () => {
      item?.click()
    })
  }

  it("sits quietly when nothing is happening", () => {
    expect(waiting()).toBe(false)
    expect(spinner()).toBeNull()
    expect(trigger().textContent).toContain("Northwind")
  })

  it("names where you are GOING, with a spinner, the moment you pick", async () => {
    await pickContoso()
    expect(wire.switched).toBe(1)
    expect(waiting()).toBe(true)
    expect(spinner()).not.toBeNull()
    // Not "Northwind" — the tap is answered by the header immediately.
    expect(trigger().textContent).toContain("Contoso")
    expect(switching).toContain(true)
  })

  it("KEEPS WAITING after the POST lands, because the session has not", async () => {
    await pickContoso()
    await act(async () => {
      wire.land()
    })
    // The exact regression: a `finally` here would have stopped the indicator
    // while the context re-read — most of the wait — was still running.
    expect(waiting()).toBe(true)
    expect(switching.at(-1)).toBe(true)
  })

  it("stops the moment the new company arrives on the prop", async () => {
    await pickContoso()
    await act(async () => {
      wire.land()
    })
    await show("acc_b") // the session caught up
    expect(waiting()).toBe(false)
    expect(spinner()).toBeNull()
    expect(trigger().textContent).toContain("Contoso")
    expect(switching.at(-1)).toBe(false)
  })
})

// THE OTHER HALF: the BODY has to wait too.
//
// The switcher naming the company being ENTERED is the right answer at the point
// of the tap — and on its own it makes things worse, because for those seconds
// the new company's name sits above the old company's requests. That pairing is
// exactly what the one-at-a-time rule exists to prevent; it reads as a leak even
// though nothing leaked. So the shell holds the body back on the same signal.
//
// Read from source: rendering the shell means standing up the session, the live
// socket and the router to observe one boolean, and the failure this guards is
// an omission — somebody deleting the wiring and leaving the spinner behind.
describe("the shell holds the body back on the same signal", () => {
  const shell = readFileSync(resolve(__dirname, "../components/portal-shell.tsx"), "utf8")

  it("takes the switcher's signal", () => {
    expect(shell, "the shell must subscribe to the switch").toMatch(/onSwitching=\{setSwitching\}/)
  })

  it("and actually gates the children on it, rather than only storing it", () => {
    expect(shell, "a flag nothing reads is a flag that does nothing").toMatch(
      /switching \?[\s\S]{0,600}children\(session\)/
    )
    expect(
      shell,
      "the wait is drawn with the library Skeleton, like every other wait here"
    ).toContain("<Skeleton")
  })
})
