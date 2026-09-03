"use client"

// THE ACTIVITY PANEL (R2 · R14) — the Activity tab every record detail carries.
//
// R2 says every record detail exposes Overview + Activity. R14 says the feed
// under a badge that counts the WHOLE history must be able to REACH all of it —
// page one, then Load more — because a record with 143 events truthfully badging
// 143 over its newest 50, forever, is the exact bug that clause was written for.
//
// Both sentences used to be spelled out in ten detail components, comment and
// all. Ten copies of "the badge counts more than the feed can reach" is ten
// chances for the eleventh detail to ship with a feed and no way to page it, and
// the check could only ever catch that by looking for the same two strings in
// every file. It now looks for THIS component in the details, and for the feed
// and the pager in here — same guarantee, one place to get it right.
//
// THE COMPOSER (2026-08-31). The client, reviewing CH27.8's add-a-note field on
// the kit's ink footer: "same on activity tab, i want to be able to write
// (replicate what's in footer)". `onAddNote` is the SAME function each caller
// already built for `RecordScreen`'s footer (`activity.addNote`, gated behind
// that module's own `can(module, "create")`) — passed here a second time, never
// recomputed, so the two composers can never disagree about who may write. The
// field itself is the kit's own `Input`, styled and wired exactly as
// record-detail.tsx draws it in the footer's Latest-activity column (Enter
// submits, the field clears, the placeholder doubles as the accessible name):
// same element, same behaviour, a second place it is drawn. A caller that omits
// `onAddNote` gets no field at all, the same rule `RecordScreen` already applies
// — never a disabled one, which would show an affordance a viewer cannot use.

import * as React from "react"

import { ActivityFeed } from "@shared/ui/components/activity-feed/activity-feed"
import { Input } from "@shared/ui/components/input/input"

import { LoadMore } from "@/components/load-more"
import type { ActivityFeedRow } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"

/** Structurally typed rather than importing the hook's return: the panel needs
 * three fields and no knowledge of how they were fetched. */
export function ActivityPanel({
  activity,
  onAddNote,
  notePlaceholder,
}: {
  activity: {
    items: ActivityFeedRow[]
    listKey: string
    fetchPage: (cursor: string) => Promise<{ rows: unknown[]; nextCursor: string | null }>
  }
  /** The same `activity.addNote` a caller already passes to `RecordScreen`'s
   * `onAddNote` for the footer — pass it again, gated the same way. Omitted
   * entirely (never a no-op) for a viewer who lacks that module's create
   * right, or for a record type the footer itself never offers notes on. */
  onAddNote?: (value: string) => void
  /** The field's placeholder — the same string the footer's field uses. */
  notePlaceholder?: string
}) {
  const t = useT()
  const [note, setNote] = React.useState("")
  return (
    <div className="flex flex-col gap-4">
      <ActivityFeed
        emptyLabel={t("No activity yet.")}
        items={activity.items.map((a) => ({
          id: a.id,
          description: a.description,
          actor: a.actor,
          initials: a.initials,
          time: a.timestamp,
          dateTime: a.dateTime,
        }))}
      />
      {onAddNote === undefined ? null : (
        <Input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            const written = note.trim()
            if (written === "") return
            event.preventDefault()
            onAddNote(written)
            setNote("")
          }}
          placeholder={notePlaceholder}
          aria-label={notePlaceholder}
          className="h-[var(--control-height-field)] text-caption"
        />
      )}
      <LoadMore listKey={activity.listKey} fetchPage={activity.fetchPage} label={t("Load more activity")} />
    </div>
  )
}
