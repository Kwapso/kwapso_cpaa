"use client"

// WAVES — the sidebar page: every package a client bought.
//
// A WAVE IS WHAT A CLIENT BOUGHT: a package of sprints. The owner's example is
// the whole definition — "Alex sells Hogo a package — he maps their processes,
// builds two automations, they test it, he trains them. Three weeks later he
// sells a second, identical package." Two waves, told apart by their name and
// their dates.
//
// WHAT A ROW SAYS, AND WHAT IT DELIBERATELY DOES NOT. Whose it is, what it is
// called, when it runs and how many sprints are in it. No price: the owner ruled
// the money out of the first version, and there is no price column on the table
// for a row to read. No kind either — "a wave is a wave".
//
// THE DATES ARE THE SPRINTS' ANSWER. They are stored on the row and recalculated
// by the door whenever a sprint is added, moved or removed, so this screen reads
// them like any other column rather than working them out — which is what keeps
// a list of forty waves one round trip instead of eighty.
//
// Host-composed rather than a recipe, for the same reason the client's own
// organisation panel is: a row here pairs a date range with a count and an
// inline switch-off, and no engine block draws that.

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/controls/alert-dialog/alert-dialog"
import { Badge } from "@shared/ui/controls/badge/badge"
import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Pencil, Power, RotateCcw } from "@shared/ui/icons"

import { CollectionHeading } from "@/components/collection-heading"
import {
  EMPTY_WAVE_QUERY,
  WaveFinder,
  selectWaves,
  waveQueryIsActive,
  type WaveQuery,
} from "@/components/wave-finder"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { InAppLink } from "@/components/in-app-link"
import { WaveFormDialog } from "@/components/wave-form-dialog"
import { ApiFailure } from "@/lib/api"
import { waves as wavesApi, wavesKey } from "@/lib/api/waves"
import { accountsKey, listFetch, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import type { Account } from "@shared/types"
import type { Wave } from "@shared/waves"
import { formatDate } from "@shared/web/format"
import { RecordMark } from "@shared/web/record-mark"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** WHEN A PACKAGE RUNS, from the two dates the door derived — or the sentence
 * that says nobody has planned it yet, which is an ordinary state and not a gap:
 * "Alex sells the wave, sprints get planned afterwards." */
export function waveDates(wave: { startsOn: string | null; endsOn: string | null }, t: (s: string) => string): string {
  if (wave.startsOn && wave.endsOn) return `${formatDate(wave.startsOn)} → ${formatDate(wave.endsOn)}`
  return formatDate(wave.startsOn) || formatDate(wave.endsOn) || t("No sprints planned yet")
}

/** Page one of the team's waves, priming the exact server total the heading
 * badges (R16). One fetcher, so the badge and the rows always came from the same
 * round trip. */
export function fetchWaves(teamId: string): Promise<Wave[]> {
  return wavesApi.list().then((r) => {
    primeCache(totalKey("waves", teamId), r.total)
    return r.waves
  })
}

/**
 * THE WAVES COLLECTION, wherever it is drawn.
 *
 * The sidebar page and the client's own record show the SAME list with the same
 * search, the same sort and the same actions; the only difference is whether the
 * client is already decided. So it is one component with one optional argument,
 * rather than two lists that agree until somebody edits one of them.
 */
export function WaveCollection({
  teamId,
  basePath,
  accountId,
}: {
  teamId: string
  /** the waves list in the URL form we arrived through (/waves or /t/<team>/waves) */
  basePath: string
  /** set on a client's own record: the list is that client's, and the client
   * filter is not offered because it has already been answered */
  accountId?: string
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  // A wave is a package of SPRINTS, so it is the work engine's module — the same
  // right that lets somebody start a sprint. The doors gate; this only decides
  // what to draw, so a control we hide is never the defence.
  const canCreate = can("work", "create")
  const canEdit = can("work", "edit")

  const wavesQ = useCached<Wave[]>(wavesKey(teamId), () => fetchWaves(teamId))
  // The exact server total (R16) — never the loaded page's length.
  const total = useCachedValue<number>(totalKey("waves", teamId))
  // The clients a wave can be sold to. The SAME cache the accounts screen holds,
  // so opening this page adds no round trip for a team that has been there.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))

  const [query, setQuery] = React.useState<WaveQuery>(EMPTY_WAVE_QUERY)
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Wave | null>(null)
  const [switchingOff, setSwitchingOff] = React.useState<Wave | null>(null)

  async function run(work: () => Promise<unknown>, whenItFails: string): Promise<void> {
    try {
      await work()
      invalidate(wavesKey(teamId))
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : whenItFails)
    }
  }

  // A FAILED READ SAYS SO. A skeleton that never resolves is indistinguishable
  // from a screen that is merely slow, and the person waits for something that
  // is never coming.
  if (wavesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the waves.")}</p>
  if (wavesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  // ON A CLIENT'S RECORD the list is narrowed before anything else is asked, so
  // the count under the search box and the empty state both speak about that
  // client rather than about the team.
  const all = accountId ? wavesQ.data.filter((w) => w.accountId === accountId) : wavesQ.data
  const rows = selectWaves(all, query)
  const clients = (accountsQ.data ?? []).filter((a) => a.active)
  const asking = waveQueryIsActive(query)

  return (
    <div className="flex flex-col gap-6">
      {/* R16: the count lives in the heading ONLY on the sidebar page, which has
          no tab strip to badge, and it is the door's exact COUNT(*). On a
          client's record the tab badge is the count and it counts that CLIENT's
          waves — so the team-wide total must not be drawn beside it, which is
          the same figure saying two different things. */}
      {accountId ? null : <CollectionHeading sectionKey="waves" total={total} />}

      <SectionWithCreate
        show={canCreate && clients.length > 0}
        label={t("Sell a wave")}
        icon="plus"
        onCreate={() => setAddOpen(true)}
        aboveCard={
          /* Only once there is something to look through. A search box over an
             empty collection is a control that cannot do anything. */
          all.length > 0 ? (
            <WaveFinder
              query={query}
              onChange={setQuery}
              clients={clients}
              showClientFilter={!accountId}
              resultCount={rows.length}
            />
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {asking
              ? t("No waves match that.")
              : t("No waves yet. A wave is a package of sprints a client bought — sell it first, plan the sprints inside it afterwards.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((w) => (
              <li key={w.id} className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3">
                {/* R35 — a record never appears without its face. A wave has no
                    picture of its own, so this is its initial. */}
                <RecordMark name={w.name} />
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <InAppLink href={`${basePath}/${w.id}`} className="truncate text-sm font-medium">
                    {w.name}
                  </InAppLink>
                  <p className="text-muted-foreground truncate text-xs">
                    {[
                      w.accountName,
                      waveDates(w, t),
                      w.sprintCount === 1 ? t("1 sprint") : `${w.sprintCount} ${t("sprints")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {w.active ? null : <Badge variant="secondary">{t("Switched off")}</Badge>}
                {canEdit ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(w)} className="gap-1">
                    <Pencil className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Edit")}</span>
                  </Button>
                ) : null}
                {canEdit && w.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    onClick={() => setSwitchingOff(w)}
                  >
                    <Power className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                  </Button>
                ) : null}
                {canEdit && !w.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      void run(
                        () => wavesApi.setActive(w.id, true),
                        t("That didn't save. Try again, and tell us if it keeps happening.")
                      )
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Bring back")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionWithCreate>

      <WaveFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients}
        draftKey={`wave:add:${teamId}`}
        onSubmit={async (v) => {
          await wavesApi.create({ accountId: v.accountId, name: v.name, goal: v.goal || undefined })
          invalidate(wavesKey(teamId))
          toast.success(t("Wave sold."))
        }}
      />

      <WaveFormDialog
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        clients={clients}
        draftKey={editing ? `wave:edit:${editing.id}` : undefined}
        initial={editing ? { name: editing.name, goal: editing.goal ?? "" } : undefined}
        onSubmit={async (v) => {
          if (!editing) return
          await wavesApi.update({ id: editing.id, name: v.name, goal: v.goal || undefined })
          invalidate(wavesKey(teamId))
          invalidate(`activity:record:waves:${editing.id}`)
          toast.success(t("Wave updated."))
        }}
      />

      {/* SWITCHING A WAVE OFF ASKS FIRST — it is the destructive-coloured action
          on this screen, and the record stays (deactivate, never delete), which
          is the sentence the dialog says rather than implies. */}
      <AlertDialog open={switchingOff !== null} onOpenChange={(open) => (open ? null : setSwitchingOff(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Switch this wave off?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("It stops being offered when a sprint is filed, and stays on the record with everything already in it. You can bring it back.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep it")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const wave = switchingOff
                setSwitchingOff(null)
                if (wave)
                  void run(
                    () => wavesApi.setActive(wave.id, false),
                    t("That didn't save. Try again, and tell us if it keeps happening.")
                  )
              }}
            >
              {t("Switch it off")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** THE SIDEBAR PAGE. The heading with the door's exact COUNT(*) (R16 — a sidebar
 * page has no tab strip to badge), and the collection under it. */
export function WavesScreen({
  teamId,
  basePath,
}: {
  teamId: string
  basePath: string
}) {
  return <WaveCollection teamId={teamId} basePath={basePath} />
}
