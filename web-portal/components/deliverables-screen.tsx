"use client"

// WHAT WE HANDED OVER — the client's own shelf.
//
// The owner, 18 August 2026, asked whether a client should see deliverables:
// "yes of course.. the deliverables are for them! but only once we mark it as
// visible yeah?" So this screen exists, and every row on it is one somebody at
// the agency deliberately shared. Neither fence is drawn here: the door answers
// with the caller's own company's SHARED rows and nothing else, so this file has
// no filter to get right and no id to pass. It renders what it was given.
//
// GROUPED BY THE SYSTEM IT BELONGS TO, because that is how a person looks for
// it. Nobody thinks "where is that PDF"; they think "what came with the
// dispatch app". A client with one system sees one heading and loses nothing.
//
// NO STAFF NAMES, ANYWHERE — and not because this file declines to draw them.
// `ClientDeliverable` has no `creatorName` and no `editorName` to draw (SCOPE
// ch.06: the portal shows the work, never which staff member is doing it), so
// the restraint is in the shape rather than in the discipline of whoever edits
// this next.
//
// ONE THING IT REFUSES TO DO IS LIE ABOUT A FILE. Some deliverables point at a
// link anybody can open (a Loom recording, a Google Doc, an API reference) and
// some point at bytes we host. Today the hosted ones live in a bucket only the
// AGENCY's hostname serves, so their address does not resolve here. Rather than
// print a link that 404s, the card says the file has to come from us. See the
// note on `reachableHere` below — this is a real gap, honestly drawn, not a
// design.

import * as React from "react"

import { Skeleton } from "@shared/ui/components/skeleton/skeleton"

import { formatDate } from "@shared/web/format"
import { useT } from "@shared/web/language"
import { safeHref } from "@shared/web/rich-text"
import { RecordMark } from "@shared/web/record-mark"
import { useCached, useCachedValue, primeCache } from "@shared/web/store"
import type { ClientDeliverable } from "@shared/types"

import { CollectionHeading } from "@/components/collection-heading"
import { handover } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

/** CAN THIS ADDRESS BE OPENED FROM *THIS* HOSTNAME?
 *
 * The agency's front door serves two buckets — `/media/` (shared: logos, photos,
 * the files on a ticket) and `/media/internal/` (the agency's own: brand
 * material, knowledge-base documents, staff records). The client's front door
 * binds only the first, which is right: `/media/internal/` is a capability URL
 * onto a bucket full of things no client may read, and opening it here to reach
 * one module's files would publish all of it.
 *
 * The consequence is narrow and real: a deliverable whose material was UPLOADED
 * rather than linked has an address this app cannot resolve. So we do not print
 * it. The honest fix is for handover material — which is FOR the client by
 * definition — to be stored in the shared bucket like a ticket attachment
 * already is, and that is a change to the agency's upload door, not to this
 * screen. Until then the card is complete and truthful about what it can offer.
 *
 * A relative path is the only shape that can be ours; an absolute link belongs to
 * somebody else's host and is theirs to serve. */
function reachableHere(url: string | null): boolean {
  return !!url && !url.startsWith("/media/internal/")
}

/** One app's worth, in the order the door sent them (most recently shared first).
 * A deliverable whose app has been deleted from under it still has a home: the
 * fallback heading is a sentence, never a blank line. */
function byApp(rows: ClientDeliverable[]): { app: string | null; rows: ClientDeliverable[] }[] {
  const groups = new Map<string, { app: string | null; rows: ClientDeliverable[] }>()
  for (const d of rows) {
    const key = d.appId
    const group = groups.get(key) ?? { app: d.appName, rows: [] }
    group.rows.push(d)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function DeliverablesScreen() {
  const t = useT()
  const { data, loading } = useCached<ClientDeliverable[]>(cacheKeys.deliverables, () =>
    handover.deliverables().then((r) => {
      // R16: the badge is the DOOR's exact count, parked in its own key beside
      // the rows so the live listener can refresh both together. Never
      // `rows.length` — that would be the length of a capped read describing a
      // collection it may have stopped short of.
      primeCache(cacheKeys.deliverablesTotal, r.total)
      return r.deliverables
    })
  )
  const total = useCachedValue<number>(cacheKeys.deliverablesTotal)

  if (loading && !data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )

  const rows = data ?? []

  return (
    <div className="flex flex-col gap-8">
      <section>
        <CollectionHeading label={t("What we handed over")} total={total} />
        {rows.length === 0 ? (
          <div className="text-muted-foreground rounded-[var(--radius)] border border-dashed p-8 text-center">
            <p>{t("Nothing here yet.")}</p>
            <p className="mt-1 text-sm">
              {t("When we hand something over and share it with you, it turns up here.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {byApp(rows).map((group) => (
              <section key={group.rows[0].appId} className="flex flex-col gap-3">
                <h3 className="text-muted-foreground text-sm font-medium">
                  {group.app ?? t("Everything else")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.rows.map((d) => {
                    const href = safeHref(reachableHere(d.url) ? d.url : undefined) ?? null
                    return (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border p-4"
                      >
                        {/* An eighteenth hand-rolled answer to "what to draw
                            when there is no picture" — the square, the radius,
                            the initial and the `safeSrc` were all RecordMark's,
                            written out again. It also had RecordMark's whole
                            reason for existing missing: `safeSrc` proves the
                            ADDRESS is well formed, never that the bytes are
                            still there, and a handover still is one un-reclaimed
                            object away from the browser's torn-paper glyph — on
                            the client's own front door. `reachableHere` stays at
                            the call site because it is this hostname's fence,
                            not a property of a mark. */}
                        <RecordMark
                          picture={reachableHere(d.imageUrl) ? d.imageUrl : null}
                          name={d.kind || d.title}
                          size="tile"
                          fit="cover"
                        />
                        <div className="min-w-0 flex-1">
                          {d.kind && (
                            <p className="text-muted-foreground text-micro uppercase">
                              {d.kind}
                            </p>
                          )}
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-medium underline-offset-2 hover:underline"
                            >
                              {d.title}
                            </a>
                          ) : (
                            <p className="font-medium">{d.title}</p>
                          )}
                          <p className="text-muted-foreground text-sm">
                            {formatDate(d.datedOn) || formatDate(d.sharedOn)}
                          </p>
                          {/* Said once, plainly, and only where it is true. A
                              person who cannot open something needs to know what
                              to do next, not why our buckets are arranged the
                              way they are. */}
                          {d.url && !href && (
                            <p className="text-muted-foreground mt-1 text-sm">
                              {t("Ask us for this one and we'll send it over.")}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
