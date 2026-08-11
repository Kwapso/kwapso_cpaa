"use client"

// ONE REQUEST — what you asked, where it stands, and the conversation.
//
// TWO THINGS THIS SCREEN DELIBERATELY DOES NOT HAVE, both worth stating because
// both look like omissions until you know why:
//
// 1. NO ACTIVITY TAB. Every record detail in the base carries Overview +
//    Activity (R2). A record's history is a list of sentences like "Alaap moved
//    this to in progress" — it NAMES the staff moving the work, which the portal
//    never does (SCOPE ch.06). The activity door isn't on the portal gateway's
//    surface either, so this isn't a hidden button; it is a door that was never
//    opened. Recorded as a reasoned exemption in shared/rules/registry.ts
//    (PORTAL_ACTIVITY_EXEMPT) and held true by the portal's rules test — an
//    exemption nobody checks is just a skip with better manners.
//
// 2. NO STATUS CONTROL. Moving a ticket along its lifecycle is gated on
//    help:edit, which is the agency's job. The client sees where it stands.
//
// THE ONE PIECE OF REAL LOGIC: who wrote a reply. A thread now has three kinds
// of author, not two — since the owner ruled that a contact sees their COMPANY's
// questions (11 Aug 2026), the people on a thread are this person, their
// COLLEAGUES, and the agency.
//
// The server decides which is which, because only the server knows: it sends a
// name for everyone on the client's side of the fence and NO name for anyone on
// ours (lib/help listReplies). So the rule here is simply "you, or the name we
// were given, or us" — and the staff-anonymity rule (SCOPE ch.06) is kept by the
// wire rather than by this component choosing not to draw something it was sent.
// Which matters: the old version printed the agency's name for every author who
// wasn't you, and would have introduced a client's own colleague as "kwapso".

import * as React from "react"
import Link from "next/link"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  TicketThread,
  type TicketStatus,
} from "@kwapso/ui/registry/collections/ticket-thread/ticket-thread"
import { ArrowLeft } from "lucide-react"

import { brand } from "@shared/brand"
import type { HelpMessage } from "@shared/types"
import { formatRelative } from "@shared/web/format"
import { primeCache, useCached } from "@shared/web/store"
import { ApiFailure, support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { STATUS_WORDS } from "@/components/ticket-row"
import type { PortalReady } from "@/components/portal-shell"

/** wire (underscore) → the library's hyphenated status. */
const TO_LIBRARY: Record<string, TicketStatus> = {
  open: "open",
  in_progress: "in-progress",
  resolved: "resolved",
  reopened: "reopened",
}

export function TicketScreen({ ready, ticketId }: { ready: PortalReady; ticketId: string }) {
  // The list is usually already warm (they tapped a row to get here), so read the
  // ticket out of it; fall back to the by-id door on a cold deep link from email.
  const { tickets } = useTickets()
  const fromList = (tickets ?? []).find((t) => t.id === ticketId)
  const oneQ = useCached(fromList ? null : `portal:ticket:${ticketId}`, () =>
    support.ticket(ticketId)
  )
  const ticket = fromList ?? oneQ.data ?? null

  const threadQ = useCached<HelpMessage[]>(cacheKeys.thread(ticketId), () =>
    support.thread(ticketId).then((r) => {
      primeCache(cacheKeys.threadTotal(ticketId), r.total)
      return r.replies
    })
  )

  async function reply(body: string) {
    try {
      const r = await support.reply(ticketId, body)
      primeCache(cacheKeys.thread(ticketId), r.replies)
      primeCache(cacheKeys.threadTotal(ticketId), r.total)
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Couldn't send that. Try again.")
    }
  }

  const back = (
    <Link
      href="/tickets"
      className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="size-3.5" />
      All tickets
    </Link>
  )

  if (!ticket)
    return (
      <div className="flex flex-col gap-6">
        {back}
        {oneQ.loading || threadQ.loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          // Outside the fence a real id and a made-up one are the same sentence —
          // the door answers null either way, and so do we.
          <p className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
            We can&apos;t find that request.
          </p>
        )}
      </div>
    )

  const me = ready.user.id
  const replies = (threadQ.data ?? []).map((m) => ({
    id: m.id,
    author: m.authorId === me ? "You" : (m.authorName ?? brand.name),
    time: formatRelative(m.createdAt),
    body: m.body,
  }))

  return (
    <div className="flex flex-col gap-6">
      {back}
      <TicketThread
        ticket={{
          description: ticket.description,
          type: STATUS_WORDS[ticket.status].label,
          status: TO_LIBRARY[ticket.status] ?? "open",
        }}
        replies={replies}
        // No @mentions from this surface: a client has no business naming which
        // staff member picks their request up.
        members={[]}
        canResolve={false}
        showStatusControl={false}
        onReply={(body) => void reply(body)}
      />
    </div>
  )
}
