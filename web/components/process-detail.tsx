"use client"
import { Ban, GitBranch, ListOrdered, Plus } from "@shared/ui/icons"
import { ApiFailure } from "@/lib/api"

// Process detail — one map at /processes/<id>, as a tabbed record (Law R2):
// Overview / Steps / Versions / Conversation / Activity. Host-composed, because
// the Steps tab draws an ARITHMETIC no engine block knows about — a baseline, a
// latest, and the subtraction between them — and Versions and the conversation
// are collections with their own actions.
//
// WHAT A TESTER COULD NOT DO HERE, 17 Aug 2026, and what changed:
//
//   "Order is unclear."  The steps were a list of names with times under them
//   and nothing saying what followed what — and every step added from the app
//   went in at position 0, so a person building a map watched it grow BACKWARDS.
//   They are now NUMBERED, in one explicit order, with each step's time beside
//   its number and the total underneath. A sequence a reader cannot follow is
//   not a process map; it is a set.
//
//   "I am missing to see the detail of the old version."  The Versions tab
//   listed that versions existed. It could not open one — the door only ever
//   returned the latest version's steps. A version is now SELECTED (the picker
//   on the Steps tab, or Open on a version row) and read in full: its steps, its
//   times, its order, its total, as they were agreed the day it was cut.
//
// WHY THAT MATTERS MORE THAN THE SCREEN'S SIZE SUGGESTS: these step times are
// what the savings figure on the CLIENT'S OWN PORTAL is computed from (R25). The
// subtraction is first version minus latest, so a reader who cannot inspect both
// sides of it cannot check the number a client is being shown — including the
// steps we REMOVED between the two, which is the largest saving there is and the
// easiest to leave out of a screen.
//
// THE FIGURE IS NOT COMPUTED HERE. It arrives from the door, through the one
// savings seam the value screen and the portal read, so the number on a map and
// the number a client is looking at cannot drift apart. R25's caption ships with
// it, word for word, from the same file as the arithmetic.
//
// THE ONE RULE THIS SCREEN ENFORCES IN ITS UI, because the server enforces it in
// the statement: only the CURRENT version can be edited. A baseline you can edit
// after the fact is a saving anybody can dial up, and every number this build
// produces is a subtraction from that baseline. So older versions are readable
// and nothing more, and the screen says why rather than just greying a button.
//
// Every count is an exact server COUNT(*) through the ONE formatCount seam (R16)
// — never the length of a list the door capped, and the Steps badge counts the
// version being SHOWN, not always today's. Nothing here deletes: a step that
// stops happening keeps its row and its frequency at zero seconds, which is what
// makes the saving for work we removed entirely come out right.

import * as React from "react"

import { Badge } from "@shared/ui/controls/badge/badge"
import { Button } from "@shared/ui/controls/button/button"
import { InAppLink } from "@/components/in-app-link"
import { AuditDateDialog, ConnectProcessDialog } from "@/components/process/process-dialogs"
import { StepsPanel, stepSecondsPerMonth, versionLabel } from "@/components/process/steps-panel"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
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
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { Comments } from "@shared/ui/structures/comments/comments"
import { Pencil, Power } from "@shared/ui/icons"

import type {
  ClientRole,
  ClientTool,
  ProcessComment,
  ProcessDetail,
  ProcessStep,
  Meeting,
  ProcessSummary,
} from "@shared/types"
// The number and the words for it come from the file that computes it — never
// spelled again here. `SAVINGS_CAPTION` is R25's sentence, rendered word for word
// wherever a saving appears.
import { ProcessFormDialog, type ProcessFormValues } from "@/components/process-form-dialog"
import { StepFormDialog, type StepFormValues } from "@/components/step-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import {
  PROCESS_VERSION_SLICES,
  clientRolesKey,
  listFetch,
  meetingsKey,
  clientToolsKey,
  processCommentsKey,
  processKey,
  processVersionKey,
  processesKey,
  impactKey,
} from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, invalidatePrefix, useCached } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"



/** A confirm this screen asks before a red action. Nothing here deletes, so each
 * one says plainly what survives. */
/** A yes/no the screen is holding. Exported because the Steps panel raises two
 * of them and the host is the one that shows them — one shape, one owner. */
export type Confirm = { title: string; body: string; action: string; run: () => Promise<boolean> }

export function ProcessDetailScreen({
  teamId,
  processId,
}: {
  teamId: string
  processId: string
}) {
  const t = useT()
  // WHICH VERSION IS BEING READ. `null` is "the current one", which is what the
  // record cache holds and what every live ping is about — so the default costs
  // no extra read and stays row-level live. Choosing an older one reads a slice
  // of its own (see processVersionKey): an old version must not take the record
  // cache's place, or the next screen to read `process:<id>` gets last year's
  // steps under today's heading.
  const [versionId, setVersionId] = React.useState<string | null>(null)
  // WHICH DAY. Null is today's live map, which is one fewer read and the only
  // position that stays correct as the day passes.
  const [asOf, setAsOf] = React.useState<string | null>(null)

  // The record's own facts — its versions, its saving, its comment total — always
  // come from THIS read, whichever version is on screen. Only the steps and their
  // badge move with the picker.
  const detailQ = useCached<ProcessDetail>(processKey(processId), () =>
    tenancy.processDetail(processId)
  )
  const olderQ = useCached<ProcessDetail>(
    versionId ? processVersionKey(processId, versionId) : null,
    () => tenancy.processDetail(processId, versionId ?? undefined)
  )
  // THE MAP ON AN OLDER DAY — its own cache key, for exactly the reason an older
  // VERSION has one: a day in the past must not take the record cache's place,
  // or the next screen to read `process:<id>` gets March's steps under today's
  // heading. Null key = never fires, so parking the slider on "today" costs
  // nothing at all.
  const asOfQ = useCached<ProcessDetail>(
    asOf ? `${processKey(processId)}:as-of:${asOf}` : null,
    () => tenancy.processDetail(processId, undefined, asOf ?? undefined)
  )
  const shown = asOf ? asOfQ : versionId ? olderQ : detailQ

  // THE PICTURE OR THE LIST, and the version to compare the picture against.
  //
  // The list stays the default and stays exactly as it was: it is the thing you
  // edit, and the map writes nothing. The switch is a view over the same steps,
  // which is why nothing under it moves when you flip.
  // THREE VIEWS OF ONE READ, and each answers a different question. LIST is
  // "what are the steps"; FLOW is "what shape is this process" (the branches and
  // the loops, which a list cannot show); COMPARE is "what changed between two
  // versions". None of them is a second source — flipping between them cannot
  // show you something the others disagree with.
  const [againstId, setAgainstId] = React.useState<string | null>(null)
  const againstQ = useCached<ProcessDetail>(
    againstId ? processVersionKey(processId, againstId) : null,
    () => tenancy.processDetail(processId, againstId ?? undefined)
  )

  const commentsQ = useCached<{ comments: ProcessComment[]; total: number }>(
    processCommentsKey(processId),
    () => tenancy.processComments(processId)
  )
  // THE OTHER MAPS THIS ONE COULD CONNECT TO — the same bounded, cached read the
  // processes screen makes, so opening this after browsing them costs nothing.
  const peerProcessesQ = useCached<ProcessSummary[]>(processesKey(teamId), () =>
    listFetch.processes(teamId)
  )
  // THE MEETINGS "READ A CALL" CAN READ. The same bounded, cached list the
  // Meetings section fills, narrowed to this map's client on screen — a call
  // about somebody else has nothing to say about this process.
  const meetingsQ = useCached<Meeting[]>(meetingsKey(teamId), () => listFetch.meetings(teamId))
  // WHO DOES THE WORK AND WHAT IN — the CLIENT's own organisation, read on the
  // same two cache keys the account's Organisation tab fills, so opening a map
  // after looking at the client costs nothing and a rename reaches both through
  // the ordinary live path. Both are bounded lists of a client's own roles and
  // tools; the step form narrows them to this map's client below.
  const clientRolesQ = useCached<ClientRole[]>(clientRolesKey(teamId), () =>
    tenancy.clientRoles().then((r) => r.roles)
  )
  const clientToolsQ = useCached<ClientTool[]>(clientToolsKey(teamId), () =>
    tenancy.clientTools().then((r) => r.tools)
  )
  // The ONE web-side read of a record's history (R5) — rows, the door's exact
  // COUNT(*) for the tab badge, and the cursor the feed below spends.
  const activity = useRecordActivity("processes", processId)

  const { can } = usePermissions(teamId)
  const canEdit = can("processes", "edit")
  const canCreate = can("processes", "create")
  const canArchive = can("processes", "delete")

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [stepOpen, setStepOpen] = React.useState(false)
  const [editingStep, setEditingStep] = React.useState<ProcessStep | null>(null)
  const [auditOpen, setAuditOpen] = React.useState(false)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [busy, setBusy] = React.useState(false)

  /** Re-read what this screen shows after our own write. (Everyone else's screen
   * catches up from the live ping — see the processes entries in live-resources.) */
  const refresh = React.useCallback(() => {
    invalidate(processKey(processId))
    invalidate(processCommentsKey(processId))
    invalidate(`activity:record:processes:${processId}`)
    invalidate(processesKey(teamId))
    // A duration changing is exactly when a value figure stops being true.
    invalidate(impactKey(teamId))
    // …and every older version we have loaded. Cutting a version is the write
    // that turns today's steps into an old version's, so the slices have to go
    // with it — the same family drop the live listener does for everyone else.
    invalidatePrefix(PROCESS_VERSION_SLICES)
  }, [processId, teamId])

  const run = React.useCallback(
    async (what: () => Promise<unknown>, done: string, fallback: string) => {
      setBusy(true)
      try {
        await what()
        refresh()
        toast.success(done)
        return true
      } catch (err) {
        toast.error(err instanceof ApiFailure ? err.message : fallback)
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  async function saveProcess(values: ProcessFormValues) {
    await tenancy.updateProcess({
      id: processId,
      name: values.name,
      description: values.description || null,
      roleName: values.roleName || null,
    })
    refresh()
    toast.success(t("Process updated."))
  }

  /** Take a connection away. A link is a signpost, not a record of work, so
   * this really deletes — there is no history to keep, and a "removed
   * connection" row on a screen would be noise. */
  async function unlink(id: string) {
    try {
      await tenancy.unlinkProcesses({ id, processId })
      refresh()
      toast.success(t("Disconnected."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't disconnect those."))
    }
  }

  async function saveStep(values: StepFormValues) {
    // Roles and tools are PICKED here and MANAGED on the client's record — the
    // form's own link goes there. The create path this function carried for one
    // day (24–25 Aug 2026) is gone by the owner's ruling: a dropdown offers
    // what a section manages, it does not mint records of its own.
    const roleId = values.roleId
    const toolId = values.toolId
    if (editingStep)
      await tenancy.updateStep({
        id: editingStep.id,
        name: values.name,
        description: values.description || null,
        secondsPerRun: values.secondsPerRun,
        runsPerPeriod: values.runsPerPeriod,
        frequencyPeriod: values.frequencyPeriod,
        roleId,
        toolId,
        // WHERE IT GOES. Undefined = after everything else, which is what the
        // door does with no position at all; a number another step already
        // holds is a FORK. R20: the door type-checks it before it reaches SQL.
        position: values.position,
        branchLabel: values.branchLabel,
        // WHICH ARM, when this step continues one side of a split rather than
        // joining the two back up (the owner's ask, 26 Aug 2026).
        branchOf: values.branchOf,
        loopsBackTo: values.loopsBackTo,
      })
    else
      await tenancy.addStep({
        processId,
        name: values.name,
        description: values.description || null,
        secondsPerRun: values.secondsPerRun,
        runsPerPeriod: values.runsPerPeriod,
        frequencyPeriod: values.frequencyPeriod,
        roleId,
        toolId,
        // WHERE IT GOES. Undefined = after everything else, which is what the
        // door does with no position at all; a number another step already
        // holds is a FORK. R20: the door type-checks it before it reaches SQL.
        position: values.position,
        branchLabel: values.branchLabel,
        // WHICH ARM, when this step continues one side of a split rather than
        // joining the two back up (the owner's ask, 26 Aug 2026).
        branchOf: values.branchOf,
        loopsBackTo: values.loopsBackTo,
      })
    refresh()
    toast.success(editingStep ? t("Step updated.") : t("Step added."))
  }

  if (detailQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the process.")}</p>
  if (detailQ.data === undefined) return <Skeleton variant="list" lines={5} />

  const { process, versions, commentsTotal, saving, savingsCaption, auditDate, revisionDates, links } =
    detailQ.data
  // THIS MAP'S CLIENT'S roles and tools, and only the live ones. A retired role
  // stays readable on the steps that already name it (deactivate, never delete)
  // and is not offered for a new one — the same rule every picker in the app
  // follows. A map with no client gets neither list, and the form leaves both
  // fields out rather than showing an empty picker.
  const stepRoles = (clientRolesQ.data ?? [])
    .filter((r) => r.active && r.accountId === process.accountId)
    .map((r) => ({ id: r.id, name: r.name, centsPerHour: r.centsPerHour }))
  const stepTools = (clientToolsQ.data ?? [])
    .filter((x) => x.active && x.accountId === process.accountId)
    .map((x) => ({ id: x.id, name: x.name }))
  // Versions come back newest-first, so [0] is today's and the last is version 1.
  const current = versions[0] ?? null
  const baseline = versions.find((v) => v.isBaseline) ?? null
  const currentLabel = current
    ? `version ${current.versionNo}${current.label ? `, ${current.label}` : ""}`
    : "the current version"

  // The steps on screen, and the version they belong to. While an older version
  // is still loading, `shown.data` is undefined — the Steps tab paints a skeleton
  // rather than the current version's steps under the old version's heading,
  // which would be the wrong times beside the right title.
  const shownSteps = shown.data?.steps
  const shownVersion =
    versions.find((v) => v.id === (versionId ?? shown.data?.shownVersionId)) ?? current
  const isCurrent = !versionId || shownVersion?.id === current?.id
  const shownStepCount = shown.data?.shownStepCount ?? process.stepCount
  // The total under the numbered list: every step's time × how often it happens.
  // A plain sum of what is on the screen above it, so a reader can check it.
  const shownTotalSeconds = (shownSteps ?? []).reduce((n, s) => n + stepSecondsPerMonth(s), 0)

  const overviewItems = [
    { label: t("App"), value: process.appName },
    { label: t("Current version"), value: current ? versionLabel(current) : "—" },
    { label: t("Baseline"), value: baseline ? versionLabel(baseline) : "Version 1" },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "steps",
        label: t("Steps"),
        icon: CONCEPT_ICON.steps,
        // R16: the exact server count of the version being SHOWN — it moves with
        // the picker, because a badge counting today's steps over version 1's
        // list is the quietly-wrong number the law was written for.
        badge: formatCount(shownStepCount),
        badgeVariant: "" as const,
      },
      {
        value: "versions",
        label: t("Versions"),
        icon: CONCEPT_ICON.versions,
        badge: formatCount(process.versionCount),
        badgeVariant: "" as const,
      },
      {
        value: "conversation",
        label: t("Conversation"),
        icon: CONCEPT_ICON.comments,
        badge: formatCount(commentsQ.data?.total ?? commentsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        // R8: a tab that reveals a collection carries its count, and R16 says the
        // number is the server total through the one seam — never the loaded page.
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  /* B1 / CHECKLIST 11.2 — Edit is the everyday act and stays visible; cutting a
   * version and archiving move into the menu, each keeping its own confirm. */
  const overflow: RecordAction[] = [
    ...(canCreate
      ? [
          {
            key: "cut",
            label: t("Cut version"),
            icon: <GitBranch className="size-3.5" />,
            disabled: busy,
            onSelect: () =>
              setConfirm({
                title: t("Cut a new version?"),
                body: "Today's steps are copied into a new version, and this one is kept exactly as it was agreed. Edits from now on describe the new way of working.",
                action: "Cut version",
                run: () =>
                  run(() => tenancy.cutVersion(processId), "New version cut.", "Couldn't cut a new version."),
              }),
          },
        ]
      : []),
    ...(canArchive
      ? [
          process.active
            ? {
                key: "archive",
                label: t("Archive"),
                icon: <Power className="size-3.5" />,
                disabled: busy,
                destructive: true,
                onSelect: () =>
                  setConfirm({
                    title: `Archive ${process.name}?`,
                    body: "It stops showing in the everyday lists and drops out of the value figures. Every version, every step and the whole conversation stay exactly where they are, and you can bring it back any time.",
                    action: "Archive",
                    run: () =>
                      run(
                        () => tenancy.setProcessActive(processId, false),
                        "Process archived.",
                        "Couldn't archive the process."
                      ),
                  }),
              }
            : {
                key: "restore",
                label: t("Restore"),
                icon: <Power className="size-3.5" />,
                disabled: busy,
                onSelect: () =>
                  void run(
                    () => tenancy.setProcessActive(processId, true),
                    "Process restored.",
                    "Couldn't restore the process."
                  ),
              },
        ]
      : []),
  ]

  return (
    <RecordScreen
      // A DELIBERATE MARK, NEVER AN EMPTY SLOT. This record has no picture and
      // its type carries no glyph, so the square holds the record's own initial —
      // the same box, the same size, the same slot every other record uses
      // (shared/web/record-mark.tsx). Before this, four of the eleven record
      // screens opened with a bare title while the other seven led with a mark,
      // which is the drift a reader feels and never reports.
      leading={<RecordMark name={process.name} size="band" />}
      eyebrow={t("Process")}
      title={process.name}
      status={[
        process.appName,
        current ? `${t("version")} ${current.versionNo}` : undefined,
        process.active ? undefined : t("Archived"),
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
    >

      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "overview")
            return (
              <div className="flex flex-col gap-4">
                {/* WHAT THIS MAP SAYS ABOUT ITSELF, in full and at the top. The
                    description is where the caveat lives on every map seeded
                    from the apps' own words — that the times are a first pass,
                    not measured, and must be agreed before the saving is quoted.
                    It used to be a value in a definition list, one line among
                    eight; a caveat a reader has to go looking for is a caveat
                    that is not doing its job, and a client is reading the number
                    it qualifies. `whitespace-pre-line` keeps the blank line the
                    caveat is written after. */}
                {process.description && (
                  <div className="bg-muted/40 rounded-xl border p-4">
                    <RichText html={process.description} />
                  </div>
                )}
                <OverviewList items={overviewItems} />

                {/* THE DAY EVERY FIGURE IS MEASURED FROM, and the button that
                    moves it. It is on the Overview rather than buried in the
                    edit dialog because it is a FACT about the map that a reader
                    needs in order to read the saving — "given back since when?"
                    is the first question anybody asks of a number like that.
                    Moving it WARNS first (Aurora's ruling): it changes every
                    figure on every screen at once, including the one on the
                    client's own portal. */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                  <div>
                    <p className="text-muted-foreground text-xs">{t("Measured from")}</p>
                    <p className="text-sm font-medium">{auditDate}</p>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setAuditOpen(true)}
                    >
                      <Pencil className="size-3.5" />
                      {t("Change the date")}
                    </Button>
                  )}
                </div>

                {/* THE MAPS THIS ONE CONNECTS TO. The owner: "many times the
                    last step of a process is the first step — or connected to —
                    another process." LOOSE, by his ruling: naming a connection
                    changes no duration, no frequency and no saving on either
                    side. It is a signpost, and a signpost that altered the road
                    would be worse than none — so this panel shows and removes,
                    and never computes. */}
                <div className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{t("Connected processes")}</p>
                    {canEdit && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setLinkOpen(true)}>
                        <Plus className="size-3.5" />
                        {t("Connect a process")}
                      </Button>
                    )}
                  </div>
                  {links.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("Nothing connected. A process that hands its work to another can say so here.")}
                    </p>
                  ) : (
                    <div className="flex flex-col">
                      {links.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between gap-2 border-b py-2 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <InAppLink
                              href={`/processes/${l.processId}`}
                              className="block truncate text-sm font-medium"
                            >
                              {l.name}
                            </InAppLink>
                            <p className="text-muted-foreground text-xs">
                              {l.direction === "to" ? t("hands its work to") : t("hands its work here")}
                              {l.note ? ` · ${l.note}` : ""}
                            </p>
                          </div>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void unlink(l.id)}
                            >
                              <Ban className="size-3.5" />
                              <span className="sr-only sm:not-sr-only">{t("Disconnect")}</span>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )

          if (panel.value === "steps")
            return (
              <StepsPanel
                processId={processId}
                shown={shown}
                onShowVersion={setVersionId}
                view={{
                  process, versions, current, shownVersion, shownSteps, shownTotalSeconds,
                  isCurrent, auditDate, revisionDates, saving, savingsCaption, againstQ, meetingsQ,
                  asOf, againstId, busy,
                }}
                rights={{ canCreate, canEdit, canArchive }}
                actions={{
                  onAsOf: setAsOf,
                  onAgainst: setAgainstId,
                  onAddStep: () => setStepOpen(true),
                  onEditStep: setEditingStep,
                  onConfirm: setConfirm,
                }}
                run={run}
                refresh={refresh}
              />
            )
          if (panel.value === "versions")
            return (
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">
                  {t("Every version this way of working has been through. Open one to read its steps and the times they were agreed at, version 1 is how the work was done before us, and every saving is measured from it.")}
                </p>
                {/* THE ROW IS THE DOOR (tester L4). The list said a version
                    existed and nothing opened it; then it grew an Open button,
                    which made the band seven units — label, baseline, date, cut
                    from, who cut it, current, Open. A row whose ONLY action is
                    "open this" does not need a button saying so: the whole row
                    is the button, which is what every other collection in this
                    app does and what removes the last unit from the band. It is
                    a real <button>, so it is reachable by keyboard and announced
                    as a control, and the two states stay badges. H 7 → 4. */}
                <div className="rounded-xl border">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVersionId(v.id === current?.id ? null : v.id)
                        setTab("steps")
                      }}
                      className="hover:bg-muted/50 motion-hover flex flex-wrap w-full items-center justify-between gap-2 border-b p-3 text-left last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <span className="truncate">
                            {t("Version")} {v.versionNo}
                            {v.label ? `, ${v.label}` : ""}
                          </span>
                          {v.isBaseline && (
                            <Badge variant="secondary" className="shrink-0 text-badge">
                              {t("baseline")}
                            </Badge>
                          )}
                          {v.id === current?.id && (
                            <Badge variant="secondary" className="shrink-0 text-badge">
                              {t("current")}
                            </Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {new Date(v.createdAt).toLocaleDateString()}
                          {v.createdByName ? ` · ${v.createdByName}` : ""}
                        </span>
                      </span>
                      <ListOrdered className="text-muted-foreground size-4 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )

          if (panel.value === "conversation")
            return (
              <Comments
                items={(commentsQ.data?.comments ?? []).map((c) => ({
                  id: c.id,
                  author: c.createdByName ?? (c.fromStaff ? "Your team" : "A colleague"),
                  body: c.explainsStepKey ? `Why a step takes longer, ${c.body}` : c.body,
                  timestamp: new Date(c.createdAt).toLocaleDateString(),
                }))}
                composer="inline"
                onSend={
                  canCreate
                    ? (body) =>
                        void run(
                          () => tenancy.addProcessComment({ processId, body }),
                          "Comment added.",
                          "Couldn't add that comment."
                        )
                    : undefined
                }
              />
            )

          return <ActivityPanel activity={activity} />
        }}
      />

      <ProcessFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        apps={[]}
        initial={{
          name: process.name,
          description: process.description ?? "",
          roleName: process.roleName ?? "",
        }}
        draftKey={`process:edit:${processId}`}
        onSubmit={saveProcess}
      />

      <StepFormDialog
        open={stepOpen}
        onOpenChange={setStepOpen}
        versionLabel={currentLabel}
        roles={stepRoles}
        tools={stepTools}
        hasClient={!!process.accountId}
        peers={(shownSteps ?? [])
          .filter((x) => x.stepKey !== editingStep?.stepKey)
          /* The position rides along so "beside this one" can resolve to the
             number the door wants — two steps at one position are a fork. */
          .map((x) => ({ stepKey: x.stepKey, name: x.name, position: x.position }))}
        manageHref={
          process.accountId && teamId
            ? `/t/${teamId}/accounts/${process.accountId}?tab=organisation`
            : null
        }
        initial={
          editingStep
            ? {
                name: editingStep.name,
                description: editingStep.description ?? "",
                secondsPerRun: editingStep.secondsPerRun,
                runsPerPeriod: editingStep.runsPerPeriod,
                frequencyPeriod: editingStep.frequencyPeriod,
                roleId: editingStep.roleId,
                toolId: editingStep.toolId,
                branchLabel: editingStep.branchLabel,
                branchOf: editingStep.branchOf,
                loopsBackTo: editingStep.loopsBackTo,
                position: editingStep.position,
              }
            : undefined
        }
        draftKey={editingStep ? `step:edit:${editingStep.id}` : `step:add:${processId}`}
        onSubmit={saveStep}
      />

      {/* MOVING THE AUDIT DATE. It warns before it saves, which is Aurora's
          ruling and the honest shape: this is the only control in the module
          that changes a number the client is already looking at, without
          changing a single minute on the map. */}
      <AuditDateDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        current={auditDate}
        stops={revisionDates}
        onSubmit={async (day) => {
          await tenancy.setAuditDate({ processId, auditDate: day })
          refresh()
          toast.success(t("Audit date moved."))
        }}
      />

      <ConnectProcessDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        options={(peerProcessesQ.data ?? [])
          .filter((x) => x.id !== processId && !links.some((l) => l.processId === x.id))
          .map((x) => ({ value: x.id, label: x.name }))}
        onSubmit={async (toProcessId, note) => {
          await tenancy.linkProcesses({ fromProcessId: processId, toProcessId, note })
          refresh()
          toast.success(t("Connected."))
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !busy && !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                const c = confirm
                if (!c) return
                void c.run().then((ok) => ok && setConfirm(null))
              }}
            >
              {busy ? <Spinner /> : null}
              {busy ? t("Working…") : confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <RecordFooter
        audit={{
          // The summary row carries the creation date and no names, so the
          // footer says the one fact it has rather than four dashes.
          createdAt: process.createdAt,
        }}
      />
    </RecordScreen>
  )
}
