"use client"

// THE ACCOUNT SWITCHER — one company at a time, and a way to move.
//
// Exactly the bargain the team switcher makes on the agency side, and for the
// same reason: a person who acts for two of our clients belongs to both, but
// mixing two clients' work into one screen is confusing at best and a disclosure
// at worst (shared/workers/account-scope.ts, "ONE AT A TIME, deliberately").
//
// Two rules this component exists to keep:
//   • It renders NOTHING when there is one company. Most clients have one, and a
//     switcher with a single entry is a control that teaches nothing and asks a
//     question that has no answer.
//   • It never decides scope. It posts a company id the SERVER handed it, and
//     the server refuses anything outside the caller's set with the same 404 a
//     made-up id gets. The list is display; the fence is elsewhere.
//
// After a switch the whole session cache is dropped, not patched: the person is
// standing somewhere else now, so every screen's contents are a different
// company's. Patching would leave the previous company's tickets on screen under
// the new company's name.
//
// AND IT TAKES A COUPLE OF SECONDS, so it has to SAY so. A switch is a round
// trip AND a context re-read, and the cache layer is deliberately
// stale-while-revalidate: dropping a key leaves the old value on screen until
// the new one lands (shared/web/store, `sync`). That is right everywhere else in
// the app and wrong here — it meant the client tapped a company and watched the
// previous company's name sit above the previous company's requests, with
// nothing moving (owner, staging, Aug 2026). So this component owns a `pending`
// state that outlives the POST and is cleared by the ANSWER arriving.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kwapso/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Check, ChevronsUpDown } from "lucide-react"

import { clearCache } from "@shared/web/store"
import { ApiFailure, portal } from "@/lib/api"

export function AccountSwitcher({
  accounts,
  currentAccountId,
  onSwitched,
  onSwitching,
}: {
  accounts: { id: string; name: string }[]
  currentAccountId: string
  /** The shell's own session reload. Dropping the caches marks them stale; this
   * is what actually re-reads and repaints. Without it the server moves and the
   * screen does not. */
  onSwitched: () => void
  /** Raised while a switch is in flight, so the shell can hold the body back.
   * Without it the header would name the company being ENTERED over rows still
   * belonging to the one being LEFT — briefly, but that is the exact pairing the
   * one-at-a-time rule exists to prevent, and it reads as a leak even though
   * nothing leaked. */
  onSwitching?: (busy: boolean) => void
}) {
  /** The company being moved to — null when nothing is in flight. Not a boolean:
   * the trigger names where you are GOING while you wait, which is the whole
   * answer to "did my tap do anything". */
  const [pending, setPending] = React.useState<string | null>(null)
  const current = accounts.find((a) => a.id === currentAccountId)
  const target = pending === null ? undefined : accounts.find((a) => a.id === pending)

  // THE SWITCH IS OVER WHEN THE SESSION SAYS SO, NOT WHEN THE POST RETURNS.
  // The old flag was cleared in a `finally` the moment the round trip landed —
  // but the context re-read that repaints the header, this menu's tick and every
  // screen below happens AFTER that, and it is most of the wait. Clearing on the
  // prop means the indicator ends exactly when the new company is on screen, with
  // no timer and nothing to keep in sync.
  React.useEffect(() => {
    if (pending !== null && pending === currentAccountId) setPending(null)
  }, [pending, currentAccountId])

  React.useEffect(() => {
    onSwitching?.(pending !== null)
  }, [pending, onSwitching])

  // One company: say which one, plainly, and offer no control.
  if (accounts.length < 2)
    return <span className="truncate font-medium">{current?.name ?? ""}</span>

  async function stand(accountId: string) {
    if (accountId === currentAccountId) return
    setPending(accountId)
    try {
      await portal.switchAccount(accountId)
      // EVERYTHING on screen belonged to the company they just left, so the
      // whole cache goes — not a list of keys.
      //
      // This used to name them one by one (context, session, tickets and their
      // total and cursor, both companies, the value, the to-dos, the delivery
      // list), and each line arrived the same way: somebody noticed a screen
      // still showing the previous company's rows under the new company's name.
      // That is the shape R21 has already been bitten by twice — a hand-kept
      // list of what a client can reach, which is correct until the next screen
      // is added and then silently isn't. A switch is a change of WHO IS ASKING;
      // the honest answer is that nothing cached survives it.
      //
      // AND IT HAPPENS BEFORE THE RE-READ BELOW. The context cache holds which
      // company they are standing in and its name, so a repaint that ran while it
      // was still cached would name the old company over the new one's rows —
      // worse than not switching at all.
      clearCache()
      onSwitched()
    } catch (e) {
      // The move didn't happen, so stop saying it is happening — the effect
      // above only fires when the new company actually lands.
      setPending(null)
      toast.error(e instanceof ApiFailure ? e.message : "Couldn't switch. Try again.")
    }
  }

  const busy = pending !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="-ml-2 max-w-[14rem] gap-2 font-medium"
          disabled={busy}
          aria-busy={busy}
        >
          <span className="truncate">{target?.name ?? current?.name ?? "Choose a company"}</span>
          {busy ? (
            <Spinner size="sm" className="size-3.5 shrink-0" />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => void stand(a.id)}>
            <Check className={a.id === currentAccountId ? "size-3.5" : "size-3.5 opacity-0"} />
            <span className="truncate">{a.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
