"use client"

// THE DIARY — every conversation we have had or are about to have, newest first.
//
// ONE COLLECTION, PAGED (R14). A meeting is an event: the rows accumulate with
// ordinary use and none is ever curated away, because a cancelled call in March
// is still the answer to "didn't we speak in March?". So the door hands back a
// page and a cursor, and Load more appends — the same shape Tickets and the
// knowledge base have.
//
// The heading carries the exact server COUNT(*) (R16) because a sidebar page has
// no tab strip to badge; the arbitration context makes sure only one of the two
// ever renders it.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { shapeMeetingsList } from "@/components/deep-link/shape"
import { content as contentApi, tenancy } from "@/lib/api"
import { listFetch, meetingsKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Account, Meeting, MeetingPurpose } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

export function MeetingsScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const meetingsQ = useCached<Meeting[]>(meetingsKey(teamId), () => listFetch.meetings(teamId))
  // The two pickers the form needs. Both are read only when the dialog can be
  // opened at all — a person who cannot create a meeting has no use for either.
  const accountsQ = useCached<Account[]>(canCreate ? `accounts:${teamId}` : null, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  const purposesQ = useCached<MeetingPurpose[]>(canCreate ? `purposes:${teamId}` : null, () =>
    listFetch.purposes(teamId)
  )
  const [open, setOpen] = React.useState(false)

  async function add(values: MeetingFormValues) {
    await contentApi.createMeeting({
      title: values.title,
      startsAt: values.startsAt,
      endsAt: values.endsAt || undefined,
      accountId: values.accountId || undefined,
      purposeId: values.purposeId || undefined,
      location: values.location || undefined,
      agenda: values.agenda || undefined,
      notes: values.notes || undefined,
    })
    invalidate(meetingsKey(teamId))
    toast.success("It's in the diary.")
  }

  if (meetingsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the meetings.</p>
  if (meetingsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  const loaded = meetingsQ.data

  return (
    <div className="flex flex-col gap-4">
      {/* R16: a sidebar page has no tab strip to badge, so the count lives in the
          heading — and it is the door's exact COUNT(*). */}
      <CollectionHeading sectionKey="meetings" total={total} />

      {/* R14's other half: the diary pages, and the meeting somebody digs for is
          the OLD one — so the search box is answered by the door, over the whole
          diary rather than the page in the browser. */}
      <PagedFind<Meeting>
        listKey={meetingsKey(teamId)}
        placeholder="Search meetings…"
        noun="meetings"
        fetchPage={(query, cursor) =>
          contentApi
            .meetings(cursor, "all", query.q)
            .then((r) => ({ rows: r.meetings, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          const rows = found.active ? found.rows : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          const data = shapeMeetingsList(rows)
          const listRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
          return (
            <>
              <SectionWithCreate show={canCreate} label="New meeting" icon="plus" onCreate={() => setOpen(true)}>
                <ScreenRenderer
                  recipe={listRecipe}
                  data={data}
                  rights={rights}
                  onAction={onAction}
                  onIntent={onIntent}
                />
              </SectionWithCreate>

              {/* R14: the heading counts the WHOLE diary, so the list under it has to be
                  able to reach all of it — page one, then Load more. */}
              <LoadMore
                listKey={found.listKey ?? meetingsKey(teamId)}
                fetchPage={found.fetchPage}
                label="Load more meetings"
              />
            </>
          )
        }}
      </PagedFind>

      <MeetingFormDialog
        open={open}
        onOpenChange={setOpen}
        draftKey={`meeting:add:${teamId}`}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        purposeOptions={(purposesQ.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        onSubmit={add}
      />
    </div>
  )
}
