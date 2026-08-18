"use client"

// HOME — the client's world at a glance, in the order they'd ask about it.
//
// Every dashboard is a series of decisions about what someone cares about most.
// Here it is: am I waiting on anything, what is this worth, and how do I ask for
// something? So the screen is a greeting, the one thing outstanding, the one
// number, the one action, the newest few tickets, and a way to the rest.
//
// THERE IS STILL NO "RECENT ACTIVITY" FEED, and that half of the original
// decision has not moved: a feed of internal history would name the staff moving
// the work, which the portal never does (SCOPE ch.06).
//
// WHAT DID MOVE, 18 Aug 2026: this screen used to carry no metric tile either,
// on the same line of reasoning. That was the wrong scope for it. "How much time
// is this giving my team back" is not internal history — it is the client's own
// number, computed from estimates they agreed to, and it is the question the
// whole product exists to answer. So it is here, at a glance, WITH the sentence
// that says what it is made of (R25) and a way through to the arithmetic behind
// it. It renders nothing at all until a process has actually been mapped.
//
// The empty state matters more than the full one: most clients will land here
// with nothing outstanding, and "nothing outstanding" should read as good news,
// not as an app that failed to load.

import * as React from "react"
import Link from "next/link"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { ArrowRight, Plus } from "lucide-react"

import { SAVINGS_CAPTION, hoursText } from "@shared/workers/savings"
import { invalidate, useCached } from "@shared/web/store"
import { support, value as valueApi, type PortalValue } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { CollectionHeading } from "@/components/collection-heading"
import { RaiseTicketDialog } from "@/components/raise-ticket-dialog"
import { TicketRow } from "@/components/ticket-row"
import { WaitingOnYou } from "@/components/waiting-on-you"
import { DeliveryBlock } from "@/components/delivery-block"
import type { PortalReady } from "@/components/portal-shell"
import { useT } from "@shared/web/language"

/** How many tickets Home shows before handing over to Tickets. Three is enough
 * to recognise "yes, that's mine" and short enough to read without scrolling. */
const PREVIEW = 3

/** THE ONE NUMBER, on the way past.
 *
 * It reads the SAME cache key the Value screen reads (`cacheKeys.value`), so
 * Home warms it and the drill-down opens instantly — one door, one answer, and
 * no chance of two screens quoting a client two different figures.
 *
 * IT RENDERS NOTHING until a process has been mapped and changed. A tile reading
 * "0 hours" on the day somebody signs up is a promise the product has not made
 * yet, and the Value screen already has the right sentence for that state.
 *
 * R25: the caption ships WITH the figure, word for word, from the one place it
 * is written. The whole point of the number is being believable. */
function TimeGivenBack() {
  const t = useT()
  const { data } = useCached<PortalValue>(cacheKeys.value, () => valueApi.read())
  if (!data || data.apps.length === 0 || data.savedSecondsPerMonth <= 0) return null
  return (
    <Link href="/value" className="hover:bg-muted/40 rounded-xl border p-6 transition-colors">
      <p className="text-muted-foreground text-sm">{t("Time given back, every month")}</p>
      <p className="text-3xl font-semibold tracking-tight">{hoursText(data.savedSecondsPerMonth)}</p>
      <p className="text-muted-foreground mt-3 text-sm">{data.caption ?? SAVINGS_CAPTION}</p>
      <span className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
        {t("See where it comes from")}
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function HomeScreen({ ready }: { ready: PortalReady }) {
  const t = useT()
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

      {/* IS ANYONE WAITING ON ME? — first, above their own requests and above
          the button, because it is the only thing on this screen they can
          finish in the next minute. Both panels render NOTHING when they are
          empty, so a client with nothing outstanding sees the screen they saw
          before this shipped. */}
      <WaitingOnYou />

      <TimeGivenBack />

      <Button size="lg" className="w-full" onClick={() => setRaising(true)}>
        <Plus className="size-3.5" />
        {t("Ask us something")}
      </Button>

      <section>
        {/* R16: the exact server total for the WHOLE collection, in the one place
         * the portal renders a count — not the length of the three rows below. */}
        {/* "Your company's", for the reason tickets-screen.tsx gives at its own
         * heading: this list holds colleagues' tickets too, now. */}
        <CollectionHeading label={t("Your company's tickets")} total={total} />

        {loading && !tickets ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : newest.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
            <p>{t("You haven't asked us for anything yet.")}</p>
            <p className="mt-1 text-sm">{t("When you do, it'll live here, and so will our reply.")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {newest.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
            {(total ?? 0) > newest.length ? (
              <Link
                href="/tickets"
                className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2 text-sm"
              >
                {t("See all of them")}
                <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* WHAT THEY BOUGHT, under what they asked — the blocks are the frame the
          requests sit inside, and reading them in that order is how somebody
          explains their own engagement out loud. */}
      <DeliveryBlock />

      <RaiseTicketDialog
        open={raising}
        onOpenChange={setRaising}
        onSubmit={raise}
        draftKey={`portal:ticket:new:${ready.currentAccountId}`}
      />
    </div>
  )
}
