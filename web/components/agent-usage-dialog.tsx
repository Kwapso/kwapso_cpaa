"use client"

// The assistant's usage view (behind the quota badge): where the TEAM's credits
// went + why. Self-contained: lazily loads the team-scoped usage log each time it
// opens, so it always reflects the turns just run. Rendered through the library
// ActivityFeed — the same timeline every other history in the app uses, not a
// hand-rolled list. Visibility rides each row's `kind` (decided server-side):
// an ACTION row reads as what the assistant did (team-visible); a teammate's
// PROMPT row arrives with its summary redacted, and we say so plainly instead
// of showing a blank line with their name on it.

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
import { ScrollArea } from "@kwapso/ui/registry/primitives/scroll-area/scroll-area"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem as ActivityFeedItem,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"

import { dataOps, type UsageLogRow } from "@/lib/api"
import { formatActivityWhen } from "@shared/web/format"

/** A redacted row's stand-in line: the row is real (who + when + credits), only
 * the TEXT is theirs. Never a blank bubble with a teammate's name on it. */
function rowDescription(row: UsageLogRow): string {
  if (row.summary) return `${row.summary} · ${row.credits} ${row.credits === 1 ? "credit" : "credits"}`
  return `A question they asked (private) · ${row.credits} ${row.credits === 1 ? "credit" : "credits"}`
}

export function AgentUsageDialog({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the header line: free left today + purchased balance */
  summary: string
}) {
  const [rows, setRows] = React.useState<UsageLogRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(false)
    dataOps
      .agentUsageLog(50)
      .then((r) => alive && setRows(r.rows))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  const items: ActivityFeedItem[] = (rows ?? []).map((row) => ({
    id: row.id,
    description: rowDescription(row),
    actor: row.actorName ?? undefined,
    timestamp: formatActivityWhen(row.createdAt),
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assistant usage</DialogTitle>
          {summary && <DialogDescription>{summary}</DialogDescription>}
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&apos;t load usage. Try again.
          </p>
        ) : items.length > 0 ? (
          <ScrollArea className="max-h-80">
            <div className="pr-3">
              <ActivityFeed config={defaultActivityFeedConfig} items={items} />
            </div>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">No usage yet today.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
