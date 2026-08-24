"use client"

// THE SYNC AFFORDANCE — one component, on every screen that shows material that
// came from Google.
//
// THE OWNER, ON THE MEETINGS BUTTON: "I like… bringing in the Meetings button on
// the meeting space to sync… we should have this button everywhere, wherever
// we're showing data coming from Google sources."
//
// Before this there were two, and they did two different things. Settings had
// "Bring it in", which sweeps a person's Google material into the knowledge
// base; Meetings had a calendar sync, which brings calendar events into Meetings.
// Every other screen showing Google material — the knowledge base's own sources,
// a client's meetings tab — had nothing at all, so the only way to know whether
// what you were reading was current was to go to another page and press
// something.
//
// ONE COMPONENT, NOT ONE PER SCREEN, and the reason is not tidiness: the STATE a
// person needs is the same everywhere ("when was this last brought in, and is
// anything wrong with it?"), and a second implementation is a second place for
// that sentence to be phrased differently or to go stale.
//
// WHAT IT SAYS, AND WHY EACH PART IS THERE:
//   • WHEN IT LAST RAN, in words. Without it the button is an act of faith —
//     a person presses it, sees "nothing new", and has no way to tell that from
//     "it has been failing since Tuesday".
//   • WHAT WENT WRONG, when something did. The kind's own sentence, not a
//     generic one: "connect it again in Settings" is actionable where "couldn't
//     read your Google material" is not (R12 records it on the row; the door
//     hands it back per kind).
//   • THE HONEST NOTHING. "Nothing new to bring in" is a real answer and the
//     most common one. A control that only ever reports success when it found
//     something teaches people to distrust it.
//
// THE PRESS ALWAYS ASKS GOOGLE. The automatic catch-up sends `onlyIfStale` and
// is politely refused inside the door's five-minute floor; a person pressing a
// button is a deliberate act with an expected result, so it does not
// (lib/knowledge-google.ts's `sweepGoogle` argues that at length). It then tells
// the automatic caller it has just run, so the two do not immediately repeat
// each other.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { RefreshCw } from "lucide-react"

import { ApiFailure, content } from "@/lib/api"
import { formatActivityWhen } from "@shared/web/format"
import { markGoogleSyncedNow } from "@/lib/use-google-catch-up"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** How many bounded ticks one press will run. Each files up to
 * INGEST_SOURCES_PER_TICK sources, so this is a first pass over a few hundred
 * items — and a ceiling, because a loop that keeps going until an external
 * system says stop is a loop whose length somebody else decides. What is left is
 * picked up by the next press, from the cursor. */
const MAX_SYNC_PASSES = 12

/** The cache key the "last brought in" line reads. One key for the whole app, so
 * pressing the button on Meetings updates the line on the knowledge base. */
export function googleSyncKey(teamId: string): string {
  return `google-sync:${teamId}`
}

type SyncRow = { kind: string; lastRunAt: string | null; lastOkAt: string | null; lastError: string | null }

/**
 * WHAT THIS SCREEN'S MATERIAL COMES FROM, and therefore what the button does.
 *
 *   • `knowledge` — the sweep that makes a person's Drive, mail, calendar and Chat
 *     answerable. Settings and the knowledge base.
 *   • `calendar` — the calendar sweep, which is a different act on different rows:
 *     it makes calendar entries into MEETING RECORDS and brings the ones that
 *     exist up to date.
 *   • `both` — a screen showing both, which presses both in order.
 *
 * Naming it rather than inferring it is deliberate. A screen knows what it is
 * showing; a component guessing from a route would be a guess that goes wrong
 * silently the first time somebody moves a panel.
 */
export type GoogleSyncScope = "knowledge" | "calendar" | "both"

export function GoogleSyncButton({
  teamId,
  scope,
  /** what to drop from the cache once something has actually changed — the keys
   * of the collection this screen is showing. */
  onSynced,
  className,
}: {
  teamId: string | null
  scope: GoogleSyncScope
  onSynced?: () => void
  className?: string
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const [syncing, setSyncing] = React.useState(false)

  // THE RIGHTS EACH HALF NEEDS, checked here only to decide whether the control
  // is worth offering — the doors demand them anyway. A button that always
  // refuses is worse than no button.
  const maySweep = can("google", "read") && can("knowledge", "create")
  const mayCalendar = can("google", "read") && can("meetings", "create")
  const doesKnowledge = scope !== "calendar" && maySweep
  const doesCalendar = scope !== "knowledge" && mayCalendar

  // WHEN IT LAST RAN. Read on one key for the whole app, so the line is the same
  // sentence wherever it appears — and read at all only when there is something
  // here to report on.
  const stateQ = useCached<SyncRow[]>(
    teamId && doesKnowledge ? googleSyncKey(teamId) : null,
    () => content.knowledgeStatus().then((r) => r.ingest)
  )
  // The Google kinds are the ones this button is about. The ticket and account
  // kinds in the same table are the cron's, and saying "last brought in two
  // minutes ago" about those would be answering a question nobody asked.
  const googleRows = (stateQ.data ?? []).filter((r) => r.kind.includes(":"))
  const lastRun = googleRows
    .map((r) => r.lastRunAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)
  const failing = googleRows.find((r) => r.lastError)?.lastError ?? null

  if (!doesKnowledge && !doesCalendar) return null

  async function sync() {
    if (syncing) return
    setSyncing(true)
    let brought = 0
    let changed = false
    try {
      if (doesCalendar) {
        const r = await content.syncCalendar()
        brought += r.created + r.updated + r.cancelled
        changed = changed || r.created + r.updated + r.cancelled > 0
      }
      if (doesKnowledge) {
        for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
          const r = await content.syncGoogleKnowledge()
          brought += r.results.reduce((n, k) => n + k.indexed, 0)
          changed = changed || r.results.some((k) => k.indexed > 0)
          // A KIND THAT FAILED CARRIES ITS OWN SENTENCE (R12 records it on the
          // row; the door hands it back per kind), and that sentence is the one
          // worth showing — "connect it again in Settings" is actionable where a
          // generic "couldn't read your Google material" is not.
          const failed = r.results.find((k) => k.error)
          if (failed?.error) {
            toast.error(failed.error)
            return
          }
          if (r.caughtUp) break
        }
      }
      // The automatic caller has just been given what it would have asked for.
      markGoogleSyncedNow()
      if (teamId) invalidate(googleSyncKey(teamId))
      if (changed) onSynced?.()
      toast.success(
        brought > 0
          ? `Brought in ${brought} ${brought === 1 ? "thing" : "things"}.`
          : t("Nothing new to bring in.")
      )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't read your Google material just now."))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className ?? ""}`}>
      <Button variant="outline" size="sm" disabled={syncing} onClick={sync} className="gap-1">
        {syncing ? <Spinner /> : <RefreshCw className="size-3.5" aria-hidden />}
        {syncing ? t("Bringing it in…") : t("Bring it in")}
      </Button>
      {/* A GRANT SOMEBODY REMOVED IN THEIR GOOGLE ACCOUNT IS SILENT BY NATURE —
          the app just starts finding nothing. This is the line that turns it
          into something a person can act on, and it takes the place of the
          "last brought in" line rather than sitting beside it: a stamp from
          Tuesday under a red sentence is two facts fighting for one glance. */}
      {/* NOT WHILE IT IS RUNNING. `failing` is a STORED error from the last
          time a connection was used, so it survives until something succeeds —
          which means it sat in red beside the spinner while the sync was
          working perfectly, and the owner read the pair as "still broken".
          A sentence about the past must not be shown next to a live attempt to
          disprove it; the moment the press finishes, the row is re-read and
          this either comes back or it does not. */}
      {syncing ? (
        <span className="text-muted-foreground text-xs">{t("This can take a few minutes.")}</span>
      ) : failing ? (
        <span className="text-destructive text-xs">{failing}</span>
      ) : lastRun ? (
        <span className="text-muted-foreground text-xs">
          {t("Last brought in")} {formatActivityWhen(lastRun)}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">{t("Not brought in yet")}</span>
      )}
    </div>
  )
}
