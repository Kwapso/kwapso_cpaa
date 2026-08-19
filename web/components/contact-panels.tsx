"use client"

// THE THREE COLLECTION TABS of a CONTACT's record — the companies they belong
// to, the tickets raised for them, and the meetings they were in.
//
// They sit beside contact-detail.tsx for the same reason account-detail-panels
// sits beside account-detail: each is one list answering one question, and the
// record's own screen stays the only place that knows how to read or write the
// person. Every count here is the DOOR's exact total (R16), primed into the same
// sidecar the tab badge reads, so a badge can never advertise rows the list is
// unwilling to show.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { ChevronRight } from "lucide-react"

import type { AccountLink, HelpTicket, Meeting } from "@shared/types"
import { content as contentApi } from "@/lib/api"
import { formatDate } from "@shared/web/format"
import { softNavigate } from "@/lib/nav"
import { totalKey } from "@/lib/live-resources"
import { sliceKey } from "@/components/work-panels"
import { EmptyLine } from "@/components/deep-link/screen-bits"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { richTextPlain } from "@shared/web/rich-text"

/** The two slice kinds these panels cache under. Named constants because the
 * live registry has to invalidate them by PREFIX when any ticket or meeting
 * moves — a slice nobody drops is a tab that goes stale the moment somebody else
 * writes (R15's other half). */
export const TICKETS_OF_ACCOUNT = "tickets-account"
export const MEETINGS_OF_ACCOUNT = "meetings-account"

/** A tappable row. Inactive rows are faded rather than hidden — nothing here is
 * deleted, so "not a contact there any more" is a state, not an absence. */
function Row({
  active = true,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const className = `flex flex-wrap items-center gap-2 px-3 py-2 ${
    active ? "" : "opacity-60"
  } ${onClick ? "hover:bg-muted/40 cursor-pointer text-left" : ""}`
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className={`${className} w-full`}>
          {children}
        </button>
      ) : (
        <div className={className}>{children}</div>
      )}
    </li>
  )
}

/** WHICH COMPANIES THIS PERSON IS A CONTACT OF — the link table read from the
 * person's side. This is the list that made one table the right answer: Marta is
 * a contact of Bergman and of Delaval, and a parent pointer has room for one of
 * them.
 *
 * NOT THE SAME QUESTION AS WHO THEY WORK FOR, which is the parent account and has
 * its own control on the Overview (contact-detail's `moveToCompany`). The two
 * agree for most people and they are different facts: leaving Bergman for Delaval
 * moves the parent, and may well leave the Bergman link exactly where it is,
 * because we still talk to her about Bergman. The line under this list says so
 * once, so a reader who came here looking for the employer knows where it is —
 * rather than this tab growing a second control that writes the same column from
 * a different screen.
 *
 * Read-only on purpose. A link is made and unmade on the COMPANY's Contacts tab,
 * where the question is "who is inside this company?" — the write belongs beside
 * the list it changes, not in two places. */
export function CompaniesPanel({
  companies,
  onOpen,
}: {
  companies: AccountLink[]
  onOpen: (accountId: string) => void
}) {
  const t = useT()
  if (companies.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        {t("They are not linked to a company. Add them as a contact from the company's own page.")}
      </p>
    )
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-border divide-y rounded-xl border">
        {companies.map((c) => (
          <Row key={c.id} active={c.active} onClick={() => onOpen(c.accountId)}>
            <span className="min-w-0 flex-1 truncate text-sm">{c.personName}</span>
            {c.relationship && (
              <span className="text-muted-foreground text-xs">{c.relationship}</span>
            )}
            {c.isMainStakeholder && (
              <Badge variant="secondary" className="text-[10px]">
                {t("Main contact")}
              </Badge>
            )}
            {!c.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                {t("No longer")}
              </Badge>
            )}
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Row>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        {t("The companies they're a contact of. Who they work for is on the Overview.")}
      </p>
    </div>
  )
}

/** THE TICKETS RAISED FOR THIS PERSON. The door narrows by `accountId` and counts
 * the same narrowed question, so the badge above and the rows here are one
 * answer. Page one only: a contact's ticket list is a summary on somebody's
 * record, and the whole collection has its own screen with its own paging. */
export function ContactTicketsPanel({
  accountId,
  basePath,
}: {
  accountId: string
  basePath: string
}) {
  const t = useT()
  const q = useCached<HelpTicket[]>(sliceKey(TICKETS_OF_ACCOUNT, accountId), () =>
    contentApi.help({ accountId }).then((r) => {
      primeCache(totalKey("tickets-account", accountId), r.total)
      return r.tickets
    })
  )
  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the tickets.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  if (q.data.length === 0)
    return <EmptyLine concept="tickets">{t("No tickets raised for them yet.")}</EmptyLine>
  // Tickets live at their own top-level URL; the account list's base is the
  // sibling form we arrived through, so the section swap keeps the same shape.
  const ticketsBase = basePath.replace(/\/accounts$/, "/tickets")
  return (
    <ul className="divide-border divide-y rounded-xl border">
      {q.data.map((ticket) => (
        <Row key={ticket.id} onClick={() => softNavigate(`${ticketsBase}/${ticket.id}`)}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{richTextPlain(ticket.description)}</p>
            <p className="text-muted-foreground truncate text-xs">
              {[ticket.helpType, ticket.status, formatDate(ticket.createdAt)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Row>
      ))}
    </ul>
  )
}

/** THE MEETINGS THIS PERSON WAS IN — the diary, narrowed to their record. Same
 * shape as the tickets above, and the same reason for page one only. */
export function ContactMeetingsPanel({
  accountId,
  basePath,
}: {
  accountId: string
  basePath: string
}) {
  const t = useT()
  const q = useCached<Meeting[]>(sliceKey(MEETINGS_OF_ACCOUNT, accountId), () =>
    contentApi.meetings({ accountId }).then((r) => {
      primeCache(totalKey("meetings-account", accountId), r.total)
      return r.meetings
    })
  )
  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the meetings.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  if (q.data.length === 0)
    return <EmptyLine concept="meetings">{t("No meetings with them yet.")}</EmptyLine>
  const meetingsBase = basePath.replace(/\/accounts$/, "/meetings")
  return (
    <ul className="divide-border divide-y rounded-xl border">
      {q.data.map((m) => (
        <Row key={m.id} onClick={() => softNavigate(`${meetingsBase}/${m.id}`)}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{m.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {/* The date is the first thing here and it is also the answer to
                  "has it happened?", which is why the status word that used to
                  sit third is gone rather than replaced. */}
              {[formatDate(m.startsAt), m.location].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Row>
      ))}
    </ul>
  )
}
