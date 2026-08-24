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

import { ActivityFeed } from "@shared/ui/structures/activity-feed/activity-feed"

import { LoadMore } from "@/components/load-more"
import type { ActivityFeedRow } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"

/** Structurally typed rather than importing the hook's return: the panel needs
 * three fields and no knowledge of how they were fetched. */
export function ActivityPanel({
  activity,
}: {
  activity: {
    items: ActivityFeedRow[]
    listKey: string
    fetchPage: (cursor: string) => Promise<{ rows: unknown[]; nextCursor: string | null }>
  }
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <ActivityFeed
        emptyLabel={t("No activity yet.")}
        items={activity.items.map((a) => ({
          id: a.id,
          description: a.description,
          actor: a.actor,
          time: a.timestamp,
        }))}
      />
      <LoadMore listKey={activity.listKey} fetchPage={activity.fetchPage} label={t("Load more activity")} />
    </div>
  )
}
