"use client"

// SUPPORT — everything this client has asked us, newest first.
//
// No tabs. The agency's help screen splits My / All because a team member cares
// which tickets are theirs among everyone's; a client's list is already all
// theirs (the help fence pins a portal caller to their own, whatever scope they
// ask for), so a tab strip here would offer a choice between a list and the same
// list. R3 is satisfied by having no toggle at all rather than a prettier one.
//
// R14: the list PAGES. "Show older" walks the opaque cursor the door handed us,
// so a client four years in can still reach their first request.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Plus } from "lucide-react"

import { invalidate } from "@shared/web/store"
import { support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { CollectionHeading } from "@/components/collection-heading"
import { RaiseTicketDialog } from "@/components/raise-ticket-dialog"
import { TicketRow } from "@/components/ticket-row"
import type { PortalReady } from "@/components/portal-shell"

export function SupportScreen({ ready }: { ready: PortalReady }) {
  const { tickets, total, loading, hasMore, loadingMore, loadMore } = useTickets()
  const [raising, setRaising] = React.useState(false)

  async function raise(input: { description: string }) {
    await support.raise(input)
    invalidate(cacheKeys.tickets)
    invalidate(cacheKeys.ticketsTotal)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* R16: the collection's count, once, from the server's exact total. */}
      <CollectionHeading
        label="Your requests"
        total={total}
        action={
          <Button onClick={() => setRaising(true)}>
            <Plus className="size-3.5" />
            Ask us something
          </Button>
        }
      />

      {loading && !tickets ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : (tickets ?? []).length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
          <p>Nothing here yet.</p>
          <p className="mt-1 text-sm">
            Anything you ask us — a question, a problem, a change — lives on this page.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(tickets ?? []).map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
          {hasMore ? (
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Spinner /> : null}
              Show older
            </Button>
          ) : null}
        </div>
      )}

      <RaiseTicketDialog
        open={raising}
        onOpenChange={setRaising}
        onSubmit={raise}
        draftKey={`portal:ticket:new:${ready.currentAccountId}`}
      />
    </div>
  )
}
