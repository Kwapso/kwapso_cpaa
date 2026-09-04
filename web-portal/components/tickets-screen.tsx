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

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@shared/ui/components/tooltip/tooltip"
import { Input } from "@shared/ui/components/input/input"
import { MagnifyingGlass, X } from "@shared/ui/foundations/icons"
import { Plus } from "@shared/ui/foundations/icons"

import { invalidate } from "@shared/web/store"
import { support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { useDoorSearch } from "@/lib/search"
import { CollectionHeading } from "@/components/collection-heading"
import { ErrorPanel } from "@/components/error-panel"
import { RaiseTicketDialog } from "@/components/raise-ticket-dialog"
import { TicketRow } from "@/components/ticket-row"
import type { PortalReady } from "@/components/portal-shell"
import { useT } from "@shared/web/language"

export function TicketsScreen({ ready }: { ready: PortalReady }) {
  const t = useT()
  const { tickets, total, loading, error, refresh, hasMore, loadingMore, loadMore } = useTickets()
  const [raising, setRaising] = React.useState(false)
  const [term, setTerm] = React.useState("")
  const search = useDoorSearch(
    term,
    async (q) => {
      const page = await support.tickets(null, q)
      return { rows: page.tickets, total: page.total }
    },
    "portal-tickets.search"
  )
  const searching = term.trim().length > 0

  async function raise(input: { description: string; appId?: string; moduleId?: string }) {
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
          // ICON-ONLY (client ruling, 2026-08-31: "+ actions never have a
          // word, they are only the + icon") — the words become the button's
          // accessible name and its tooltip, the same seam the agency app's
          // own `AddButton` (web/components/deep-link/screen-bits.tsx) draws
          // create actions from.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" onClick={() => setRaising(true)} aria-label={t("Ask us something")}>
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("Ask us something")}</TooltipContent>
          </Tooltip>
        }
      />

      {/* R48: SEARCH IS THE DEFAULT ON A COLLECTION, and this one is a growing
        * collection — so it asks the door rather than filtering what is loaded.
        * Drawn in the portal's own calm idiom (one column, no toolbar row, no
        * filter chips) rather than by importing the agency's `ToolbarRow`: the
        * law is about the FUNCTION being present, and the two front doors are
        * deliberately different shapes (UI-RULEBOOK L5). */}
      <div className="relative">
        <MagnifyingGlass
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("Search your tickets")}
          aria-label={t("Search your tickets")}
          className="pr-12 pl-12"
        />
        {term ? (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("Clear the search")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-4 -translate-y-1/2"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {searching ? (
        search.failed ? (
          <ErrorPanel
            title={t("We couldn't run that search.")}
            description={t("Check your connection and try again.")}
            onRetry={() => setTerm(term)}
          />
        ) : search.rows === null ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
            <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
          </div>
        ) : search.rows.length === 0 ? (
          <div className="text-muted-foreground rounded-[var(--radius)] bg-surface-panel p-8 text-center">
            <p>{t("Nothing matched that.")}</p>
            <p className="mt-1 text-sm">{t("Try fewer words, or clear the search to see everything.")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* The door's exact count for THIS search (R16), not the length of
              * what came back — the two differ the moment a match falls past
              * the first page. */}
            <p className="text-muted-foreground text-sm">
              {t("{count} of your tickets match.").replace("{count}", String(search.total ?? search.rows.length))}
            </p>
            {search.rows.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )
      ) : error && !tickets ? (
        <ErrorPanel
          title={t("We couldn't load your tickets.")}
          description={t("Check your connection and try again.")}
          onRetry={refresh}
        />
      ) : loading && !tickets ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
          <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
          <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
        </div>
      ) : (tickets ?? []).length === 0 ? (
        // REGRESSION FIX, 2026-09-01: was `border border-dashed` — see
        // impact-screen.tsx's own note on this box for the full reasoning.
        <div className="text-muted-foreground rounded-[var(--radius)] bg-surface-panel p-8 text-center">
          <p>{t("Nothing here yet.")}</p>
          <p className="mt-1 text-sm">
            {t("Anything you ask us, a question, a problem, a change, lives on this page.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(tickets ?? []).map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
          {hasMore ? (
            <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
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
