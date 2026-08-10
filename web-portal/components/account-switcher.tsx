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

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kwapso/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Check, ChevronsUpDown } from "lucide-react"

import { invalidate } from "@shared/web/store"
import { ApiFailure, portal } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

export function AccountSwitcher({
  accounts,
  currentAccountId,
  onSwitched,
}: {
  accounts: { id: string; name: string }[]
  currentAccountId: string
  /** The shell's own session reload. Dropping the caches marks them stale; this
   * is what actually re-reads and repaints. Without it the server moves and the
   * screen does not. */
  onSwitched: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const current = accounts.find((a) => a.id === currentAccountId)

  // One company: say which one, plainly, and offer no control.
  if (accounts.length < 2)
    return <span className="truncate font-medium">{current?.name ?? ""}</span>

  async function stand(accountId: string) {
    if (accountId === currentAccountId) return
    setBusy(true)
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
      // Dropping a cache marks it stale; this re-reads it. The shell holds the
      // context inside its session read, so the header, this menu's tick and
      // every screen below repaint from one call.
      onSwitched()
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Couldn't switch. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="-ml-2 max-w-[14rem] gap-2 font-medium" disabled={busy}>
          <span className="truncate">{current?.name ?? "Choose a company"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
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
