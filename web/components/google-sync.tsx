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

import { Button } from "@shared/ui/components/button/button"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { RefreshCw } from "@shared/ui/foundations/icons"

import { ApiFailure, content } from "@/lib/api"
import { formatActivityWhen } from "@shared/web/format"
import { markGoogleSyncedNow } from "@/lib/use-google-catch-up"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCached } from "@shared/web/store"
import { runExclusive, useRunning } from "@shared/web/running-jobs"
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

/** THE TWO ACTS THIS BUTTON CAN START, named so that two different screens
 * offering the same one collide instead of both running it.
 *
 * Keyed by the ACT and the team, never by the screen: the Meetings page's own
 * calendar button and this component's calendar half are the same act, and a
 * person who presses one then walks to the other must find it already running
 * rather than be offered a second copy (shared/web/running-jobs says why). */
export const knowledgeJobKey = (teamId: string): string => `google-knowledge:${teamId}`
export const calendarJobKey = (teamId: string): string => `google-calendar:${teamId}`

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
  /** THE CALENDAR SWEEP'S OWN ANSWER, for the one screen that needs more of it
   * than "something changed": Meetings shows how far back the walk has got and
   * which entries are still beyond the horizon, and both ride this response.
   * Before this, that screen kept a SECOND calendar button of its own to get at
   * them — two controls, two labels and three lines of prose for one act. */
  onCalendarResult,
  /** Whether to print the line saying what gets brought in. On by default,
   * because the owner could not tell what the button covered (26 Aug 2026).
   * OFF where the surrounding card already says it — a control that repeats its
   * frame's own sentence is the clutter, not the cure. */
  describe = true,
  className,
}: {
  teamId: string | null
  scope: GoogleSyncScope
  onSynced?: () => void
  onCalendarResult?: (r: Awaited<ReturnType<typeof content.syncCalendar>>) => void
  describe?: boolean
  className?: string
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  // WHETHER IT IS RUNNING IS NOT THIS COMPONENT'S TO REMEMBER. It used to be
  // React state here, so walking to another page unmounted the answer and the
  // button came back offering a run that was already going — the owner's
  // "high possibility that people would launch two simultaneous syncs", 26 Aug
  // 2026. Both halves are watched separately so a button that does only one of
  // them is not disabled by the other.
  const knowledgeRunning = useRunning(teamId ? knowledgeJobKey(teamId) : null)
  const calendarRunning = useRunning(teamId ? calendarJobKey(teamId) : null)

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

  const syncing = (doesKnowledge && knowledgeRunning) || (doesCalendar && calendarRunning)

  if (!doesKnowledge && !doesCalendar) return null

  async function sync() {
    if (syncing || !teamId) return
    let brought = 0
    let changed = false
    // Starts true so the calendar-only case never claims "not connected" on
    // knowledge's behalf; the knowledge sweep overwrites it with the truth.
    let anythingConnected = true
    // ANOTHER DEVICE, NOT ANOTHER TAB. `runExclusive` already stops this tab
    // pressing twice; this is the door's own lease saying somebody else's
    // press is in flight right now (the owner's "persist across the same
    // user's multiple sessions on different devices", 26 Aug 2026). It is not
    // an error — it is the honest reason "brought" stayed at 0.
    let busyElsewhere = false
    try {
      if (doesCalendar) {
        // `runExclusive` starts it, or JOINS the one already going — which is
        // how the Meetings page's own button and this one stay one act.
        const r = await runExclusive(calendarJobKey(teamId), () => content.syncCalendar())
        onCalendarResult?.(r)
        if (r.busy) {
          busyElsewhere = true
        } else {
          brought += r.created + r.updated + r.cancelled
          changed = changed || r.created + r.updated + r.cancelled > 0
        }
      }
      if (doesKnowledge) {
        // The WHOLE walk is one act, not one act per pass: a person who leaves
        // the page between pass three and pass four must find the button still
        // busy, and a second presser must join this loop rather than start a
        // second one beside it.
        const swept = await runExclusive(knowledgeJobKey(teamId), async () => {
          let indexed = 0
          let connected = true
          for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
            const r = await content.syncGoogleKnowledge()
            // Another device's press is holding the lease. Stop here rather
            // than spin through the remaining passes hitting the same refusal.
            if (r.busy) return { indexed, connected, error: null as string | null, busy: true }
            connected = r.connectedServices.length > 0
            indexed += r.results.reduce((n, k) => n + k.indexed, 0)
            // A KIND THAT FAILED CARRIES ITS OWN SENTENCE (R12 records it on the
            // row; the door hands it back per kind), and that sentence is the one
            // worth showing — "connect it again in Settings" is actionable where a
            // generic "couldn't read your Google material" is not.
            const failed = r.results.find((k) => k.error)
            if (failed?.error) return { indexed, connected, error: failed.error, busy: false }
            if (r.caughtUp) break
          }
          return { indexed, connected, error: null as string | null, busy: false }
        })
        if (swept.busy) busyElsewhere = true
        anythingConnected = swept.connected
        brought += swept.indexed
        changed = changed || swept.indexed > 0
        if (swept.error) {
          toast.error(swept.error)
          return
        }
      }
      // The automatic caller has just been given what it would have asked for.
      markGoogleSyncedNow()
      if (teamId) invalidate(googleSyncKey(teamId))
      if (changed) onSynced?.()
      // "Nothing new" is only an honest answer when there was somewhere to
      // look. With zero connections the sweep did not ask Google anything, and
      // saying "nothing new" would dress that up as a completed check — which
      // is exactly how the owner read it (25 Aug 2026).
      if (busyElsewhere && brought === 0) {
        toast.info(t("Already syncing on another device. Try again in a moment."))
      } else if (brought === 0 && !anythingConnected) {
        toast.error(t("No Google services are connected. Connect them in Settings first."))
      } else {
        toast.success(
          brought > 0
            ? `Brought in ${brought} ${brought === 1 ? "thing" : "things"}.`
            : t("Nothing new to bring in.")
        )
      }
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't read your Google material just now."))
    }
    // No `finally` that clears a flag: the flag is the promise in the registry,
    // and it clears itself when the work settles — including for the screens
    // that only JOINED this run and are not in this function at all.
  }

  // WHAT, EXACTLY, GETS BROUGHT IN — said on the screen rather than known by the
  // person who built it.
  //
  // THE OWNER, 26 Aug 2026: "When they click the 'Bring in' button everywhere,
  // Settings, and all other pages, it is a bit unclear to me what exactly we are
  // syncing. Are we bringing in everything, or are we bringing in a particular
  // Google service?"
  //
  // A button that says "Bring it in" answers neither question, and the answer is
  // genuinely different per scope: the knowledge sweep reads four Google services
  // and files them for the assistant to answer from, while the calendar sweep
  // makes meeting RECORDS. One caption per scope, always visible — not a tooltip,
  // because the doubt is at the moment of pressing and a tooltip is for after you
  // have already decided.
  const covers =
    doesKnowledge && doesCalendar
      ? t("Your Google Calendar entries as meetings, and your Drive, Gmail, Calendar and Chat for the knowledge base.")
      : doesCalendar
        ? t("Your Google Calendar entries, brought in as meetings.")
        : t("Your Google Drive, Gmail, Calendar and Chat, so the knowledge base can answer from them.")

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="secondary" size="sm" disabled={syncing} onClick={sync} className="gap-1">
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
      {describe && <span className="text-muted-foreground text-xs">{covers}</span>}
    </div>
  )
}
