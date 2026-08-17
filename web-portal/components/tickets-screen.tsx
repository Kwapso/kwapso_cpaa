"use client"

// TICKETS — everything this client has asked us, newest first.
//
// No tabs — still, and now for a better reason than the one this comment used
// to give. It said a client's list was "already all theirs" because the ticket
// fence pinned a portal caller to the tickets they personally raised, so a My /
// All strip would offer a choice between a list and the same list. Since the
// owner ruled that a contact sees their COMPANY's questions (11 Aug 2026) those
// two lists genuinely differ, and the door serves both (`?scope=mine`). We are
// still not drawing the strip: this screen is the company's record of what it
// has asked us, and a filter is not what makes that readable — attribution is.
// A row saying WHO raised it is the open piece of work here, and it is not a
// one-liner: `raiserName` can be a staff name the day staff raise a ticket on an
// account's behalf (SCOPE ch.07), so it needs the same server-side decision the
// thread's authors now get (lib/help listReplies) rather than a field the screen
// prints and hopes about.
// R3 is satisfied by having no toggle at all rather than a prettier one.
//
// R14: the list PAGES. "Show older" walks the opaque cursor the door handed us,
// so a client four years in can still reach their first ticket.

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
import { useT } from "@shared/web/language"

export function TicketsScreen({ ready }: { ready: PortalReady }) {
  const t = useT()
  const { tickets, total, loading, hasMore, loadingMore, loadMore } = useTickets()
  const [raising, setRaising] = React.useState(false)

  async function raise(input: { description: string }) {
    await support.raise(input)
    invalidate(cacheKeys.tickets)
    invalidate(cacheKeys.ticketsTotal)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* R16: the collection's count, once, from the server's exact total.
       *
       * "Your company's", not "Your". A contact now sees every ticket their
       * colleagues raise, not only the ones they typed — so a heading that says
       * "Your tickets" over a colleague's question is the screen telling the
       * reader something untrue about who can see what. The copy changed the day
       * the rule did. */}
      <CollectionHeading
        label={t("Your company's tickets")}
        total={total}
        action={
          <Button onClick={() => setRaising(true)}>
            <Plus className="size-3.5" />
            {t("Ask us something")}
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
          <p>{t("Nothing here yet.")}</p>
          <p className="mt-1 text-sm">
            {t("Anything you ask us, a question, a problem, a change, lives on this page.")}
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
              {t("Show older")}
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
