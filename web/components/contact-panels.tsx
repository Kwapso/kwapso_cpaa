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

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { CaretRight } from "@shared/ui/foundations/icons"
import { ShapeStateBody } from "@shared/ui/compositions/states/states"

import type { AccountLink, HelpTicket, Meeting } from "@shared/types"
import { content as contentApi } from "@/lib/api"
import { ToolbarRow } from "@/components/deep-link/screen-bits"
import { formatDate } from "@shared/web/format"
import { softNavigate } from "@/lib/nav"
import { totalKey } from "@/lib/live-resources"
import { sliceKey } from "@/components/work-panels"
import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"
import { primeCache, useCached } from "@shared/web/store"
import { useLanguage, useT } from "@shared/web/language"
import { richTextPlain } from "@shared/web/rich-text"

/** Every list on this file is a bounded, already-loaded array — either the
 * whole of it (Companies) or the door's own "page one, a summary" read
 * (Tickets, Meetings — see each panel's own doc). Either way the narrowing
 * below runs over rows already in the browser, the same shape
 * `selectable-screen.tsx`'s own toolbar uses. */
type ActiveFilter = "all" | "active" | "inactive"
function matchesActive(filter: ActiveFilter, active: boolean): boolean {
  return filter === "all" || (filter === "active" ? active : !active)
}

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
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<ActiveFilter>("all")

  if (companies.length === 0)
    // No `onCreate` on purpose — this whole panel is read-only (see the file
    // header): a link is made on the COMPANY's own Contacts tab, never here.
    return (
      <CollectionEmptyState
        title={t("Not linked to a company.")}
        description={t("Add them as a contact from the company's own page.")}
      />
    )

  const q = query.trim().toLowerCase()
  const shown = companies.filter(
    (c) =>
      matchesActive(status, c.active) &&
      (q === "" ||
        c.personName.toLowerCase().includes(q) ||
        (c.relationship ?? "").toLowerCase().includes(q))
  )

  return (
    <div className="flex flex-col gap-3">
      {companies.length > 1 && (
        <ToolbarRow
          search={
            <>
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search companies…")}
                className="flex-1"
                aria-label={t("Search companies")}
              />
              <Select value={status} onValueChange={(v) => setStatus(v as ActiveFilter)}>
                <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t("Filter by status")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All")}</SelectItem>
                  <SelectItem value="active">{t("Contacts now")}</SelectItem>
                  <SelectItem value="inactive">{t("No longer")}</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      )}
      {shown.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
      )}
      <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {shown.map((c) => (
          <Row key={c.id} active={c.active} onClick={() => onOpen(c.accountId)}>
            <span className="min-w-0 flex-1 truncate text-sm">{c.personName}</span>
            {c.relationship && (
              <span className="text-muted-foreground text-xs">{c.relationship}</span>
            )}
            {c.isMainStakeholder && (
              <Badge variant="secondary" className="text-badge">
                {t("Main contact")}
              </Badge>
            )}
            {!c.active && (
              <Badge variant="secondary" className="text-muted-foreground text-badge">
                {t("No longer")}
              </Badge>
            )}
            <CaretRight className="text-muted-foreground size-4 shrink-0" />
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
  const { t, lang } = useLanguage()
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const q = useCached<HelpTicket[]>(sliceKey(TICKETS_OF_ACCOUNT, accountId), () =>
    contentApi.help({ accountId }).then((r) => {
      primeCache(totalKey("tickets-account", accountId), r.total)
      return r.tickets
    })
  )
  if (q.error)
    return (
      <ShapeStateBody
        shape="recordChrome"
        state="error"
        copy={{ errorTitle: t("Couldn't load the tickets.") }}
        action={
          <Button variant="secondary" onClick={() => q.refresh()}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  if (q.data.length === 0)
    return (
      <CollectionEmptyState
        title={t("No tickets raised for them yet.")}
        description={t("Every ticket about them will show here once one is raised.")}
      />
    )
  // Tickets live at their own top-level URL; the account list's base is the
  // sibling form we arrived through, so the section swap keeps the same shape.
  const ticketsBase = basePath.replace(/\/accounts$/, "/tickets")
  // THE STATUS OPTIONS ARE DERIVED FROM WHAT'S ON SCREEN, never a hard-coded
  // enum — the same rule `FilterFacet.options` follows when a caller leaves
  // them off (config.ts: "the distinct values are derived from the data").
  // This tab is a page-one SUMMARY (the file header), so that data is exactly
  // what a filter here can honestly promise to narrow.
  const statuses = Array.from(new Set(q.data.map((tk) => tk.status))).sort()
  const needle = query.trim().toLowerCase()
  const shown = q.data.filter(
    (tk) =>
      (status === "all" || tk.status === status) &&
      (needle === "" ||
        richTextPlain(tk.description).toLowerCase().includes(needle) ||
        (tk.helpType ?? "").toLowerCase().includes(needle))
  )
  return (
    <div className="flex flex-col gap-3">
      {(q.data.length > 1 || statuses.length > 1) && (
        <ToolbarRow
          search={
            <>
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search tickets…")}
                className="flex-1"
                aria-label={t("Search tickets")}
              />
              {statuses.length > 1 && (
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t("Filter by status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All")}</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          }
        />
      )}
      {shown.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
      )}
      <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {shown.map((ticket) => (
          <Row key={ticket.id} onClick={() => softNavigate(`${ticketsBase}/${ticket.id}`)}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{richTextPlain(ticket.description)}</p>
              <p className="text-muted-foreground truncate text-xs">
                {[ticket.helpType, ticket.status, formatDate(ticket.createdAt, lang)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <CaretRight className="text-muted-foreground size-4 shrink-0" />
          </Row>
        ))}
      </ul>
    </div>
  )
}

/** THE MEETINGS THIS PERSON WAS IN — the meetings list, narrowed to their record. Same
 * shape as the tickets above, and the same reason for page one only. */
export function ContactMeetingsPanel({
  accountId,
  basePath,
}: {
  accountId: string
  basePath: string
}) {
  const { t, lang } = useLanguage()
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<{ dir: "asc" | "desc" }>({ dir: "desc" })
  const q = useCached<Meeting[]>(sliceKey(MEETINGS_OF_ACCOUNT, accountId), () =>
    contentApi.meetings({ accountId }).then((r) => {
      primeCache(totalKey("meetings-account", accountId), r.total)
      return r.meetings
    })
  )
  if (q.error)
    return (
      <ShapeStateBody
        shape="recordChrome"
        state="error"
        copy={{ errorTitle: t("Couldn't load the meetings.") }}
        action={
          <Button variant="secondary" onClick={() => q.refresh()}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  if (q.data.length === 0)
    return (
      <CollectionEmptyState
        title={t("No meetings with them yet.")}
        description={t("Every meeting they're in will show here once one is arranged.")}
      />
    )
  const meetingsBase = basePath.replace(/\/accounts$/, "/meetings")
  const needle = query.trim().toLowerCase()
  const dirMul = sort.dir === "desc" ? -1 : 1
  const shown = q.data
    .filter(
      (m) =>
        needle === "" ||
        m.title.toLowerCase().includes(needle) ||
        (m.location ?? "").toLowerCase().includes(needle)
    )
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1) * dirMul)
  return (
    <div className="flex flex-col gap-3">
      {q.data.length > 1 && (
        <ToolbarRow
          search={
            <>
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search meetings…")}
                className="flex-1"
                aria-label={t("Search meetings")}
              />
              <SortControl
                options={[{ value: "startsAt", label: t("When") }]}
                value="startsAt"
                onValueChange={() => undefined}
                direction={sort.dir}
                onDirectionChange={(dir) => setSort({ dir })}
                label={t("Sort by")}
                hideLabel
              />
            </>
          }
        />
      )}
      {shown.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
      )}
      <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {shown.map((m) => (
          <Row key={m.id} onClick={() => softNavigate(`${meetingsBase}/${m.id}`)}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{m.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {/* The date is the first thing here and it is also the answer to
                    "has it happened?", which is why the status word that used to
                    sit third is gone rather than replaced. */}
                {[formatDate(m.startsAt, lang), m.location].filter(Boolean).join(" · ")}
              </p>
            </div>
            <CaretRight className="text-muted-foreground size-4 shrink-0" />
          </Row>
        ))}
      </ul>
    </div>
  )
}
