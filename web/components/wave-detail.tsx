"use client"

// WAVE DETAIL — one package a client bought, at /waves/<id>, as a tabbed record
// (Law R2): Overview / Sprints / Activity.
//
// THE SPRINTS TAB IS THE WHOLE SCREEN, really. A wave IS its sprints: putting
// one in or taking one out is the only thing that changes what the package runs
// between, because the dates are DERIVED from the sprints and recalculated by
// the door on every one of those writes. That is why the date line on the header
// carries no edit affordance — there is nothing to type, and a field somebody
// could type would let a wave disagree with the work inside it.
//
// TWO SPRINTS THAT CROSS ARE A WARNING, NEVER A REFUSAL. Aurora ruled it: "warn,
// but we can save it (it can happen…)". So the write lands, the door hands back
// the clash, and this screen says it out loud in a band under the header — both
// after the click that caused it and every time the record is opened afterwards,
// because a warning that only appears once is one nobody sees.
//
// THERE IS NO MONEY ON THIS SCREEN. No price, no margin, no rate — the owner
// took the whole of it out of the first version, and the table has no column for
// it. A sprint's own price is the work engine's to show, on the sprint's screen.
//
// Host-composed: the Sprints tab is a collection with an action of its own, and
// no engine block draws it.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { TabsView } from "@shared/web/screen-engine/tabs-view"
import { useRemembered } from "@shared/web/remembered"
import { PencilSimple, Power, ArrowCounterClockwise, UserMinus } from "@shared/ui/foundations/icons"

import { ActivityPanel } from "@/components/activity-panel"
import { AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"
import { OverviewList } from "@/components/overview-list"
import { RecordPicker } from "@/components/record-picker"
import { WaveFormDialog } from "@/components/wave-form-dialog"
import { waveDates } from "@/components/waves-screen"
import {
  RecordActionsMenu,
  RecordChipLink,
  RecordScreen,
  STICKY_TABS,
  RECORD_TABS_CONFIG,
  type RecordAction,
} from "@/components/record-chrome"
import { ApiFailure } from "@/lib/api"
import { waves as wavesApi, waveOneKey, wavesKey } from "@/lib/api/waves"
import { SprintFormDialog } from "@/components/sprint-form-dialog"
import { content as contentApi } from "@/lib/api/content"
import { sliceKey } from "@/components/work-panels"
import { appsKey, listFetch, sprintsKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Sprint } from "@shared/types"
import type { Wave, WaveOverlap, WaveSprint } from "@shared/waves"
import { formatCount } from "@shared/web/format-count"
import { RecordMark } from "@shared/web/record-mark"
import { invalidate, useCached } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"

export function WaveDetailScreen({
  teamId,
  waveId,
  basePath,
}: {
  teamId: string
  waveId: string
  /** the waves list in the URL form we arrived through */
  basePath: string
}) {
  const { t, lang } = useLanguage()
  // ITS OWN READ, not a row out of the list. The record needs three things the
  // list row does not carry — the sprints, the clashes, and the goal — and its
  // dates move when a SPRINT moves, which is a change the list row alone could
  // not answer.
  const waveQ = useCached<{ wave: Wave; sprints: WaveSprint[]; overlaps: WaveOverlap[] }>(
    waveOneKey(waveId),
    () => wavesApi.one(waveId)
  )
  const activity = useRecordActivity("waves", waveId)
  // The team's sprints, from the same bounded cache the sprints screen holds —
  // opening this record costs no extra round trip for anybody who has been there.
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  // The client's own systems, for the sprint form's app picker. Same cache the
  // apps screen holds, so opening this tab adds no round trip on a warm app.
  const appsQ = useCached<{ id: string; name: string; accountId: string | null; active: boolean }[]>(
    appsKey(teamId),
    () => listFetch.apps(teamId) as Promise<{ id: string; name: string; accountId: string | null; active: boolean }[]>
  )

  const { can } = usePermissions(teamId)
  const canCreate = can("work", "create")
  const canEdit = can("work", "edit")

  // The open tab is remembered per record for as long as this document
  // lives (web/lib/nav-memory.ts) — leaving to another section and coming
  // back lands on the tab she was reading, and a miss lands on "overview".
  const [tab, setTab] = useRemembered("tab", "overview")
  const [planOpen, setPlanOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // THE SPRINTS LIST ITSELF, narrowed here — bounded (a wave holds a handful of
  // sprints, never a growing page of them) and already read whole above, so
  // this is the same in-browser search/sort the other nested panels use. The
  // ATTACH PICKER (`RecordPicker`, below) is untouched: it searches the pool of
  // sprints NOT yet in this wave, a different question over a different list.
  const [sprintQuery, setSprintQuery] = React.useState("")
  const [sprintSort, setSprintSort] = React.useState<{ by: "name" | "startsOn"; dir: "asc" | "desc" }>({
    by: "startsOn",
    dir: "asc",
  })

  /** Every write re-reads the record it changed, plus the list behind it and the
   * record's own history. Cheap (bounded, one round trip each) and it keeps this
   * screen out of the business of guessing what the door did — the same reason
   * the live layer patches rather than predicts. */
  const refresh = () => {
    invalidate(waveOneKey(waveId))
    invalidate(wavesKey(teamId))
    invalidate(sprintsKey(teamId))
    invalidate(`activity:record:waves:${waveId}`)
  }

  async function moveSprint(sprintId: string, into: string | null): Promise<void> {
    setBusy(true)
    try {
      const { overlaps } = await wavesApi.setSprint({ sprintId, waveId: into })
      refresh()
      // THE WARNING, SAID AT THE MOMENT IT IS EARNED. It is not a refusal — the
      // sprint is already in the package — so this is a note rather than an
      // error, and the band under the header keeps saying it afterwards.
      if (overlaps.length > 0)
        toast.warning(t("Saved. Two sprints in this wave run over each other."))
    } catch (e) {
      toast.error(
        e instanceof ApiFailure
          ? e.message
          : t("That didn't save. Try again, and tell us if it keeps happening.")
      )
    } finally {
      setBusy(false)
    }
  }

  async function setActive(active: boolean): Promise<void> {
    setBusy(true)
    try {
      await wavesApi.setActive(waveId, active)
      refresh()
      toast.success(active ? t("Wave brought back.") : t("Wave switched off."))
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : t("Couldn't change that wave."))
    } finally {
      setBusy(false)
    }
  }

  // THE CHROME STAYS, ONLY THE PANEL SPINS (RecordChrome's law 4) — part of
  // the rollout from help-detail (73414c58). No empty branch: this door never
  // returns a null record, only data or an error.
  if (waveQ.error)
    return (
      <RecordScreen
        title={<Skeleton className="h-7 w-48" />}
        state="error"
        copy={{ errorTitle: t("Couldn't load the wave.") }}
        errorAction={
          <Button variant="secondary" onClick={() => invalidate(waveOneKey(waveId))}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (waveQ.data === undefined)
    return <RecordScreen title={<Skeleton className="h-7 w-48" />} state="loading" />
  const { wave, sprints, overlaps } = waveQ.data

  const sprintNeedle = sprintQuery.trim().toLowerCase()
  const sprintDirMul = sprintSort.dir === "desc" ? -1 : 1
  const shownSprints = sprints
    .filter((s) => sprintNeedle === "" || s.name.toLowerCase().includes(sprintNeedle))
    .sort((a, b) =>
      sprintSort.by === "startsOn"
        ? ((a.startsOn ?? "") < (b.startsOn ?? "") ? -1 : 1) * sprintDirMul
        : a.name.localeCompare(b.name) * sprintDirMul
    )

  // The sprints this client has that are not already in this package. A sprint
  // already filed under ANOTHER wave is deliberately still offered: picking it
  // MOVES it, which is a real thing to want and the one act that changes two
  // waves' dates at once. A sprint of a different client is not offered at all,
  // and the door refuses it besides.
  const inThisWave = new Set(sprints.map((s) => s.id))
  const addable = (sprintsQ.data ?? []).filter(
    (s) => s.active && s.accountId === wave.accountId && !inThisWave.has(s.id)
  )

  const overviewItems = [
    { label: t("Client"), value: wave.accountName || "—" },
    {
      label: t("What the package is for"),
      value: wave.goal ? <RichText html={wave.goal} /> : "—",
    },
    // DERIVED FROM THE SPRINTS, said as one line so it reads the way somebody
    // would say it. Never typed — see the header.
    { label: t("Runs"), value: waveDates(wave, t, lang) },
    {
      label: t("Sprints inside it"),
      value:
        wave.sprintCount === 1
          ? t("1 sprint")
          : wave.sprintCount === 0
            ? t("No sprints planned yet")
            : `${wave.sprintCount} ${t("sprints")}`,
    },
    // The audit rows live in the record footer (D7 / CHECKLIST 11.3).
  ]

  const tabsConfig = {
    ...RECORD_TABS_CONFIG,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "sprints",
        label: t("Sprints"),
        icon: CONCEPT_ICON.sprints,
        badge: formatCount(wave.sprintCount),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  const overflow: RecordAction[] = canEdit
    ? [
        {
          key: "edit",
          label: t("Edit"),
          icon: <PencilSimple className="size-3.5" />,
          disabled: busy,
          onSelect: () => setEditOpen(true),
        },
        {
          key: "active",
          label: wave.active ? t("Switch off") : t("Bring back"),
          icon: wave.active ? <Power className="size-3.5" /> : <ArrowCounterClockwise className="size-3.5" />,
          disabled: busy,
          destructive: wave.active,
          onSelect: () => void setActive(!wave.active),
        },
      ]
    : []

  return (
    <RecordScreen
      leading={<RecordMark name={wave.name} />}
      // NO EYEBROW — client ruling, 2026-09-03, verbatim: "I want you to remove
      // the eyebrow on the title on main screens. Remove that eyebrow, kill it."
      // The prop this line used to pass is deleted from `RecordScreen` itself
      // (record-chrome.tsx says why it had outlived the 2026-09-01 ruling that
      // took the eyebrow out of the full header); the breadcrumb above this
      // header is what names the record type now.
      // D4: THE NUMBER A PERSON QUOTES, in the black chip below the title. A
      // wave gained one the same day this rule split off the account-code
      // prefix (shared/workers/refs.ts) — `Wave.ref` didn't exist before that.
      recordNumber={wave.ref || undefined}
      // NO `collectionLabel` — client correction, 2026-08-31, verbatim:
      // "now it also show 'meeting' as a tag! thats not a tg but the eyebrow
      // remember. not only for meetings, but everywhere." This used to repeat
      // `t("Wave")` a second time as a chip, directly under the eyebrow that
      // already says it.
      // THE SECOND PILL, WITH A COLOUR (client ruling, 2026-08-31: "the status
      // scheme is not only for tickets … map colors"). A wave's only two
      // states are running and switched off (same shape as an account's),
      // so this is the one unambiguous colour, exactly the account/process
      // pattern: `archived` while switched off, wordless while running.
      //
      // THE THIRD PILL, "the most relevant container parent" (client ruling,
      // 2026-08-31). The glossary's own words settle it: "wave: a package of
      // sprints sold to ONE ACCOUNT" — the account it was sold to.
      chips={
        <>
          {!wave.active && (
            <Badge variant="status" dot="archived">
              {t("Switched off")}
            </Badge>
          )}
          {wave.accountId && wave.accountName ? (
            <RecordChipLink href={`${basePath}/${waveId}/accounts/${wave.accountId}`}>
              {wave.accountName}
            </RecordChipLink>
          ) : null}
        </>
      }
      title={wave.name}
      // THE DATE RANGE MOVES TO `subtitle` — CLIENT RULING, 2026-08-31,
      // VERBATIM: "what is this 3rd component in the title under the chips?
      // kill everywhere. chips is the last component of headers!" It used to
      // be this screen's `status` prop, which maps to `RecordChrome`'s
      // `meta` and is drawn directly under the chips row
      // (`data-record-region="header"`) — exactly what the ruling forbids.
      // `subtitle` sits ABOVE the chips (record-chrome.tsx's own doc comment:
      // "directly under the title, above chips/status" — the same slot the
      // client named for a meeting's date/time), and this screen doesn't use
      // it for anything else, so the dates move up rather than dropping out
      // of the header. Duplicated in the Overview tab's own "Runs" row, the
      // same way meeting-detail.tsx's subtitle duplicates its own "When" row
      // — the client's own ruling on that screen says the duplication
      // doesn't matter when the fact belongs in this exact position.
      subtitle={waveDates(wave, t, lang)}
      actions={canEdit ? <RecordActionsMenu actions={overflow} /> : undefined}
      // D7 / CHECKLIST 11.3 — who made it and when, now the kit's own ink
      // footer's Record column.
      audit={{
        createdByName: wave.createdByName,
        createdAt: wave.createdAt,
        editedByName: wave.editedByName,
        updatedAt: wave.updatedAt,
      }}
      activity={activity}
      onAddNote={can("work", "create") ? activity.addNote : undefined}
      notePlaceholder={t("Add a note")}
    >
      {/* TWO SPRINTS THAT CROSS — a warning band under the header, where this
          book already says a warning band goes. It is not a refusal and it never
          blocks anything: the sprints are in the package, and this says what
          somebody would otherwise have to work out from two date ranges. */}
      {overlaps.length > 0 && (
        <div className="bg-warning/10 flex flex-col gap-1 rounded-[var(--radius)] p-3 text-sm">
          <p className="font-medium text-warning">{t("Two sprints in this wave run over each other.")}</p>
          {overlaps.map((o) => (
            <p key={`${o.firstId}-${o.secondId}`} className="text-muted-foreground">
              {o.firstName} · {o.secondName}
            </p>
          ))}
          <p className="text-muted-foreground">
            {t("That can be right — it is saved either way. Change a sprint's dates if it is not.")}
          </p>
        </div>
      )}

      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "sprints")
            return (
              <div className="flex flex-col">
                {/* TWO VERBS, AND THEY ARE DIFFERENT ONES. "Plan a sprint" writes
                    a NEW block of work and drops it straight into this package —
                    which is the order the work actually happens in, because a
                    wave is sold first and the sprints inside it are planned
                    afterwards. "Put a sprint in this wave" moves one that
                    already exists. A screen offering only the second makes
                    somebody leave, create a sprint somewhere else, and come
                    back to find it. */}
                {/* TWO ACTIONS, ONE TOOLBAR ROW, pinned right — "Plan a sprint"
                    (ICON-ONLY, client ruling 2026-08-31) beside "Put a sprint
                    in this wave" (a search-to-attach control, the same kind of
                    second act `ContactsPanel`'s "Add contact" is). */}
                  <ToolbarRow
                    // R50 — never toolbar (create/attach included) on an empty
                    // wave: a wave with no sprints in it yet named "Plan a
                    // sprint" through this row regardless of `sprints.length`,
                    // which is the exact lone-"+"-pill shape the client's Time
                    // screenshot named, just with a picker riding along beside
                    // it too. `CollectionEmptyState` below carries "Add the
                    // first" alone once this row is gone.
                    empty={sprints.length === 0}
                    // THE LIST'S OWN SEARCH + SORT — over the sprints ALREADY in
                    // this wave, never the attach picker's pool. Shown once
                    // there is more than one row to narrow; a wave with one
                    // sprint has nothing for either control to do.
                    search={
                      sprints.length > 1 && (
                        <>
                          <SearchInput
                            value={sprintQuery}
                            onChange={(e) => setSprintQuery(e.target.value)}
                            placeholder={t("Search sprints in this wave…")}
                            className="flex-1"
                            aria-label={t("Search sprints in this wave")}
                          />
                          <SortControl
                            options={[
                              { value: "startsOn", label: t("Starts") },
                              { value: "name", label: t("Name") },
                            ]}
                            value={sprintSort.by}
                            onValueChange={(by) => setSprintSort({ by: by as typeof sprintSort.by, dir: "asc" })}
                            direction={sprintSort.dir}
                            onDirectionChange={(dir) => setSprintSort((s) => ({ ...s, dir }))}
                            label={t("Sort by")}
                            hideLabel
                          />
                        </>
                      )
                    }
                    actions={
                      <>
                        {canCreate && (
                          <AddButton label={t("Plan a sprint")} onClick={() => setPlanOpen(true)} disabled={busy} />
                        )}
                        {canEdit && addable.length > 0 && (
                          <RecordPicker
                            id="wave-add-sprint"
                            value=""
                            onChange={(sprintId) => void moveSprint(sprintId, waveId)}
                            options={addable.map((s) => ({ value: s.id, label: s.name, picture: null }))}
                            placeholder={t("Put a sprint in this wave")}
                            searchPlaceholder={t("Search sprints…")}
                            emptyText={t("No sprint matched.")}
                            disabled={busy}
                          />
                        )}
                      </>
                    }
                  />

                {sprints.length === 0 ? (
                  // No `sprints` import target at all — a wave's sprints are
                  // planned or moved in, never bulk-loaded.
                  <CollectionEmptyState
                    title={t("No sprints in this wave yet.")}
                    description={t("The wave is sold first; the sprints inside it are planned afterwards.")}
                    onCreate={canCreate ? () => setPlanOpen(true) : undefined}
                  />
                ) : shownSprints.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {shownSprints.map((s) => (
                      <li key={s.id} className="bg-surface-panel flex items-center gap-3 rounded-[var(--radius)] p-3">
                        {/* R35 — a record row carries its face. */}
                        <RecordMark name={s.name} />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => softNavigate(`${basePath}/${waveId}/sprints/${s.id}`)}
                            className="hover:text-foreground block max-w-full truncate text-left text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {s.name}
                          </button>
                          <p className="text-muted-foreground truncate text-xs">
                            {waveDates(s, t, lang)}
                          </p>
                        </div>
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            className="gap-1"
                            onClick={() => void moveSprint(s.id, null)}
                          >
                            <UserMinus className="size-3.5" aria-hidden />
                            <span className="sr-only sm:not-sr-only">{t("Take out")}</span>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          if (panel.value === "activity")
            return (
              <ActivityPanel
                activity={activity}
                onAddNote={can("work", "create") ? activity.addNote : undefined}
                notePlaceholder={t("Add a note")}
              />
            )
          return <OverviewList items={overviewItems} />
        }}
      />

      {/* PLANNING A SPRINT FROM INSIDE A PACKAGE. The client is a fact about
          where you are standing rather than a question — a sprint is sold TO
          somebody and cannot be moved afterwards — so it is fixed, exactly as
          it is when the form is opened from the client's own record. The wave
          is not a field on the sprint form: the sprint is created, then put in
          this wave through the same door the picker above uses, so there is one
          way a sprint joins a package rather than two. */}
      <SprintFormDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        apps={(appsQ.data ?? [])
          .filter((a) => a.active && a.accountId === wave.accountId)
          .map((a) => ({ id: a.id, name: a.name }))}
        fixedAccount={wave.accountId ? { id: wave.accountId, name: wave.accountName ?? "" } : undefined}
        draftKey={`sprint:add:wave:${waveId}`}
        onSubmit={async (v) => {
          // The create door answers with the whole LIST rather than the new row,
          // so the new sprint is the one that was not there a moment ago. Read
          // that way rather than off the top: "newest first" is an ordering, and
          // an ordering is not an identity.
          const before = new Set((sprintsQ.data ?? []).map((x) => x.id))
          const after = await contentApi.createSprint({
            name: v.name,
            goal: v.goal || undefined,
            sprintType: v.sprintType || undefined,
            accountId: wave.accountId ?? undefined,
            appId: v.appId || undefined,
            startsOn: v.startsOn || undefined,
            endsOn: v.endsOn || undefined,
            soldPriceCents: v.soldPriceCents,
            currency: v.currency || undefined,
          })
          const created = after.sprints.find((x) => !before.has(x.id))
          if (created) await moveSprint(created.id, waveId)
          invalidate(sprintsKey(teamId))
          if (wave.accountId) invalidate(sliceKey("sprints-account", wave.accountId))
          toast.success(t("Sprint planned, and it is in this wave."))
        }}
      />

      <WaveFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clients={[]}
        draftKey={`wave:edit:${waveId}`}
        initial={{ name: wave.name, goal: wave.goal ?? "" }}
        onSubmit={async (v) => {
          await wavesApi.update({ id: waveId, name: v.name, goal: v.goal || undefined })
          refresh()
          toast.success(t("Wave updated."))
        }}
      />
    </RecordScreen>
  )
}
