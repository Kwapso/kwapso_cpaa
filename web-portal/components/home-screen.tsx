"use client"

// HOME — the client's world at a glance, in the order they'd ask about it.
//
// Every dashboard is a series of decisions about what someone cares about most.
// Here it is: am I waiting on anything, and how do I ask for something? So the
// screen is a greeting, the one action, the newest few requests, and a way to
// the rest. There is no chart, no metric tile, no "recent activity" feed — a
// feed of internal history would name the staff moving the work, which the
// portal never does (SCOPE ch.06).
//
// The empty state matters more than the full one: most clients will land here
// with nothing outstanding, and "nothing outstanding" should read as good news,
// not as an app that failed to load.

import * as React from "react"
import Link from "next/link"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { ArrowRight, Plus } from "lucide-react"

import { invalidate } from "@shared/web/store"
import { support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { CollectionHeading } from "@/components/collection-heading"
import { RaiseTicketDialog } from "@/components/raise-ticket-dialog"
import { TicketRow } from "@/components/ticket-row"
import type { PortalReady } from "@/components/portal-shell"

/** How many requests Home shows before handing over to Support. Three is enough
 * to recognise "yes, that's mine" and short enough to read without scrolling. */
const PREVIEW = 3

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function HomeScreen({ ready }: { ready: PortalReady }) {
  const { tickets, total, loading } = useTickets()
  const [raising, setRaising] = React.useState(false)
  const company = ready.accounts.find((a) => a.id === ready.currentAccountId)?.name ?? ""
  const newest = (tickets ?? []).slice(0, PREVIEW)

  async function raise(input: { description: string }) {
    await support.raise(input)
    invalidate(cacheKeys.tickets)
    invalidate(cacheKeys.ticketsTotal)
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}
          {ready.user.firstName ? `, ${ready.user.firstName}` : ""}.
        </h1>
        <p className="text-muted-foreground">
          {company ? `This is everything we're doing for ${company}.` : "This is your work with us."}
        </p>
      </div>

      <Button size="lg" className="w-full" onClick={() => setRaising(true)}>
        <Plus className="size-3.5" />
        Ask us something
      </Button>

      <section>
        {/* R16: the exact server total for the WHOLE collection, in the one place
         * the portal renders a count — not the length of the three rows below. */}
        <CollectionHeading label="Your requests" total={total} />

        {loading && !tickets ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : newest.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
            <p>You haven&apos;t asked us for anything yet.</p>
            <p className="mt-1 text-sm">When you do, it&apos;ll live here — and so will our reply.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {newest.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
            {(total ?? 0) > newest.length ? (
              <Link
                href="/support"
                className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2 text-sm"
              >
                See all of them
                <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <RaiseTicketDialog
        open={raising}
        onOpenChange={setRaising}
        onSubmit={raise}
        draftKey={`portal:ticket:new:${ready.currentAccountId}`}
      />
    </div>
  )
}
