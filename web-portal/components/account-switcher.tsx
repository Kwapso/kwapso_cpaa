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

import { invalidate } from "@shared/web/store"
import { ApiFailure, portal } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

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
      // Everything on screen belonged to the company they just left. CONTEXT
      // FIRST — it holds which company they are standing in and its name, so
      // leaving it cached switches the server and not the screen: the header,
      // this menu's tick and the company page all keep naming the old company
      // while the tickets underneath belong to the new one. That is worse than
      // not switching at all.
      invalidate(cacheKeys.context)
      invalidate(cacheKeys.session)
      invalidate(cacheKeys.tickets)
      invalidate(cacheKeys.ticketsTotal)
      invalidate(cacheKeys.ticketsCursor)
      invalidate(cacheKeys.company(currentAccountId))
      invalidate(cacheKeys.company(accountId))
      // THE VALUE, for the same reason as the tickets and for one more: the
      // figure on that screen is hours saved for the company they were standing
      // in, and it is the number they are most likely to read out to somebody.
      // Left cached, the header would name one company over another company's
      // savings — the one-at-a-time confusion, wearing its most quotable form.
      invalidate(cacheKeys.value)
      // WHAT WE ARE WAITING ON, AND WHAT THEY BOUGHT — both are lists of one
      // company's rows, and both would otherwise be the previous company's under
      // the new company's name. The to-do list is the worse of the two: it is a
      // list somebody ACTS on, so a stale one is not a wrong screen, it is a
      // person sending us another client's logo.
      invalidate(cacheKeys.todos)
      invalidate(cacheKeys.delivery)
      // Dropping a cache marks it stale; this re-reads it. The shell holds the
      // context inside its session read, so the header, this menu's tick and
      // every screen below repaint from one call.
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
