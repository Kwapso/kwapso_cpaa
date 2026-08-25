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

import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { Pencil, Plus, Power, RotateCcw, UserMinus } from "@shared/ui/icons"

import { ActivityPanel } from "@/components/activity-panel"
import { OverviewList } from "@/components/overview-list"
import { RecordPicker } from "@/components/record-picker"
import { WaveFormDialog } from "@/components/wave-form-dialog"
import { waveDates } from "@/components/waves-screen"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
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
import { useT } from "@shared/web/language"
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
  const t = useT()
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

  const [tab, setTab] = React.useState("overview")
  const [planOpen, setPlanOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

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

  if (waveQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the wave.")}</p>
  if (waveQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const { wave, sprints, overlaps } = waveQ.data

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
    { label: t("Runs"), value: waveDates(wave, t) },
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
    ...defaultTabsConfig,
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
          icon: <Pencil className="size-3.5" />,
          disabled: busy,
          onSelect: () => setEditOpen(true),
        },
        {
          key: "active",
          label: wave.active ? t("Switch off") : t("Bring back"),
          icon: wave.active ? <Power className="size-3.5" /> : <RotateCcw className="size-3.5" />,
          disabled: busy,
          destructive: wave.active,
          onSelect: () => void setActive(!wave.active),
        },
      ]
    : []

  return (
    <RecordScreen
      leading={<RecordMark name={wave.name} />}
      eyebrow={t("Wave")}
      title={wave.name}
      status={[wave.accountName ?? undefined, waveDates(wave, t), wave.active ? undefined : t("Switched off")]
        .filter(Boolean)
        .join(" · ")}
      actions={canEdit ? <RecordActionsMenu actions={overflow} /> : undefined}
      headerExtra={
        wave.accountId && wave.accountName ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => softNavigate(`${basePath}/${waveId}/accounts/${wave.accountId}`)}
              className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              {t("For")} {wave.accountName}
            </button>
          </p>
        ) : undefined
      }
    >
      {/* TWO SPRINTS THAT CROSS — a warning band under the header, where this
          book already says a warning band goes. It is not a refusal and it never
          blocks anything: the sprints are in the package, and this says what
          somebody would otherwise have to work out from two date ranges. */}
      {overlaps.length > 0 && (
        <div className="bg-warning/10 flex flex-col gap-1 rounded-xl p-3 text-sm">
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
              <div className="flex flex-col gap-4">
                {/* TWO VERBS, AND THEY ARE DIFFERENT ONES. "Plan a sprint" writes
                    a NEW block of work and drops it straight into this package —
                    which is the order the work actually happens in, because a
                    wave is sold first and the sprints inside it are planned
                    afterwards. "Put a sprint in this wave" moves one that
                    already exists. A screen offering only the second makes
                    somebody leave, create a sprint somewhere else, and come
                    back to find it. */}
                {canCreate ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-fit gap-1"
                    disabled={busy}
                    onClick={() => setPlanOpen(true)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {t("Plan a sprint")}
                  </Button>
                ) : null}

                {canEdit && addable.length > 0 ? (
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
                ) : null}

                {sprints.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-sm">
                    {t("No sprints in this wave yet. The wave is sold first; the sprints inside it are planned afterwards.")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {sprints.map((s) => (
                      <li key={s.id} className="bg-card flex items-center gap-3 rounded-xl border p-3">
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
                            {waveDates(s, t)}
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
          if (panel.value === "activity") return <ActivityPanel activity={activity} />
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

      <RecordFooter
        audit={{
          createdByName: wave.createdByName,
          createdAt: wave.createdAt,
          editedByName: wave.editedByName,
          updatedAt: wave.updatedAt,
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
