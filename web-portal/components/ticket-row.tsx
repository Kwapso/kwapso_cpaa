"use client"

// One ticket, as a row — shared by Home (the newest few) and Tickets (all of
// them), so the same ticket never looks like two different things.
//
// What it shows: what you asked, where it stands, and when. What it does NOT
// show: who at the agency has it. "The portal shows work status but never which
// staff member is doing it" (SCOPE ch.06) — so there is no assignee here, and
// there is nowhere for one to be added by accident later.

import Link from "next/link"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { ChevronRight } from "lucide-react"

import type { HelpTicket } from "@shared/types"
import { formatRelative } from "@shared/web/format"

/** Plain words for each state, and a colour that means the same thing every
 * time. "In progress" is the only one that needed translating from the wire. */
export const STATUS_WORDS: Record<HelpTicket["status"], { label: string; variant: "secondary" | "default" | "success" | "outline" }> = {
  // THE CLIENT'S WORDS, not ours. "Triaged" is our word for having read and
  // sorted it; what it means to them is that a person here has looked at it. And
  // "Ready" is our word for every piece of work being done — to them it is us
  // about to come back with an answer. SCOPE ch.06: the portal shows work
  // status, and it says it the way the person reading it would.
  new: { label: "With us", variant: "secondary" },
  triaged: { label: "Looked at", variant: "secondary" },
  in_progress: { label: "Being worked on", variant: "default" },
  ready: { label: "Almost there", variant: "default" },
  resolved: { label: "Done", variant: "success" },
}

export function TicketRow({ ticket }: { ticket: HelpTicket }) {
  const status = STATUS_WORDS[ticket.status]
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="line-clamp-2">{ticket.description}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={status.variant}>{status.label}</Badge>
          {/* HOW MUCH WORK IS ON IT, and nothing else about that work
              (.plans/BUILD-1 §7: "stories as a COUNT only — never the titles").
              Two numbers, because "3 pieces of work, 1 done" is a picture and "3
              pieces of work" is a shrug. Absent when there is none, rather than
              a "0 of 0" that reads as neglect on a request somebody answered
              without needing to build anything. */}
          {ticket.storyCount > 0 && (
            <span>
              {ticket.storyCount} {ticket.storyCount === 1 ? "piece" : "pieces"} of work,{" "}
              {ticket.doneStoryCount} done
            </span>
          )}
          <span>{formatRelative(ticket.updatedAt ?? ticket.createdAt)}</span>
        </div>
      </div>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
    </Link>
  )
}
