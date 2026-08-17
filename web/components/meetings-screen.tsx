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
//
// AND IT IS WHERE MEETING PURPOSES ARE REACHED FROM. The taxonomy of why we meet
// used to sit under the Delivery method page; that page went on 17 Aug 2026 with
// its programmes folded onto the sprint type, and a purpose belongs beside the
// diary rather than on a rail of its own — it is the vocabulary behind this
// screen, not a second destination.

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
import { appsKey, listFetch, meetingsKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Account, AppRow, Meeting, MeetingPurpose } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"
import { formatCount } from "@shared/web/format-count"
import { useT } from "@shared/web/language"

export function MeetingsScreen({
  teamId,
  recipe,
  rights,
  total,
  purposeCount,
  canCreate,
  canReadPurposes,
  onPurposes,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  /** the exact server total of the MEETING PURPOSES, for the link below */
  purposeCount: number | undefined
  canCreate: boolean
  /** `delivery:read` — the right the purposes screen itself gates on. */
  canReadPurposes: boolean
  onPurposes: () => void
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const meetingsQ = useCached<Meeting[]>(meetingsKey(teamId), () => listFetch.meetings(teamId))
  // The two pickers the form needs. Both are read only when the dialog can be
  // opened at all — a person who cannot create a meeting has no use for either.
  const accountsQ = useCached<Account[]>(canCreate ? `accounts:${teamId}` : null, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  // WHICH SYSTEM A MEETING WAS ABOUT. Same condition as the accounts above, and
  // out of the SAME bounded cache the apps page holds — an agency has tens of
  // apps, so the picker costs nothing anybody has not already paid.
  const appsQ = useCached<AppRow[]>(canCreate ? appsKey(teamId) : null, () => listFetch.apps(teamId))
  // The purposes are read whenever this screen can offer them at all — the form
  // picker needs them, and so does the count on the link below.
  const purposesQ = useCached<MeetingPurpose[]>(canCreate || canReadPurposes ? `purposes:${teamId}` : null, () =>
    listFetch.purposes(teamId)
  )
  const [open, setOpen] = React.useState(false)

  async function add(values: MeetingFormValues) {
    await contentApi.createMeeting({
      title: values.title,
      startsAt: values.startsAt,
      endsAt: values.endsAt || undefined,
      accountId: values.accountId || undefined,
      appId: values.appId || undefined,
      purposeId: values.purposeId || undefined,
      location: values.location || undefined,
      agenda: values.agenda || undefined,
      notes: values.notes || undefined,
    })
    invalidate(meetingsKey(teamId))
    toast.success(t("It's in the diary."))
  }

  if (meetingsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the meetings.")}</p>
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
        placeholder={t("Search meetings…")}
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
              <SectionWithCreate show={canCreate} label={t("New meeting")} icon="plus" onCreate={() => setOpen(true)}>
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
                label={t("Load more meetings")}
              />
            </>
          )
        }}
      </PagedFind>

      {/* WHY WE MEET, one level down. A link rather than a nav line: the purposes
          are the vocabulary this screen picks from, and a rail that lists both a
          page and the words behind it reads as two ideas. R16: the number is the
          door's exact total through the ONE seam, and an unloaded total renders
          nothing rather than a "0" that reads as "there are none". */}
      {canReadPurposes ? (
        <button
          type="button"
          onClick={onPurposes}
          className="text-muted-foreground hover:text-foreground w-fit text-sm underline-offset-4 hover:underline"
        >
          {t("Meeting purposes")}
          {formatCount(purposeCount) ? ` (${formatCount(purposeCount)})` : ""}
        </button>
      ) : null}

      <MeetingFormDialog
        open={open}
        onOpenChange={setOpen}
        draftKey={`meeting:add:${teamId}`}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        appOptions={(appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        purposeOptions={(purposesQ.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        onSubmit={add}
      />
    </div>
  )
}
