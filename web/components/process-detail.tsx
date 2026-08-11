"use client"

// Process detail — one map at /processes/<id>, as a tabbed record (Law R2):
// Overview / Steps / Versions / Conversation / Activity. Host-composed, because
// the Steps tab draws an ARITHMETIC no engine block knows about — a baseline, a
// latest, and the subtraction between them — and Versions and the conversation
// are collections with their own actions.
//
// THE ONE RULE THIS SCREEN ENFORCES IN ITS UI, because the server enforces it in
// the statement: only the CURRENT version can be edited. A baseline you can edit
// after the fact is a saving anybody can dial up, and every number this build
// produces is a subtraction from that baseline. So older versions are readable
// and nothing more, and the screen says why rather than just greying a button.
//
// Every count is an exact server COUNT(*) through the ONE formatCount seam (R16)
// — never the length of a list the door capped. Nothing here deletes: a step
// that stops happening keeps its row and its frequency at zero seconds, which is
// what makes the saving for work we removed entirely come out right.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kwapso/ui/registry/primitives/alert-dialog/alert-dialog"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { Comments } from "@kwapso/ui/registry/collections/comments/comments"
import { GitBranch, Pencil, Plus, Power } from "lucide-react"

import type { ProcessComment, ProcessDetail, ProcessStep } from "@shared/types"
import { LoadMore } from "@/components/load-more"
import { ProcessFormDialog, type ProcessFormValues } from "@/components/process-form-dialog"
import { StepFormDialog, type StepFormValues } from "@/components/step-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import {
  processCommentsKey,
  processKey,
  processesKey,
  valueKey,
} from "@/lib/live-resources"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCached } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"

/** A step's time, said the way a person says it. */
function minutes(seconds: number): string {
  return `${Math.round(seconds / 60).toLocaleString()} min`
}

/** A confirm this screen asks before a red action. Nothing here deletes, so each
 * one says plainly what survives. */
type Confirm = { title: string; body: string; action: string; run: () => Promise<boolean> }

export function ProcessDetailScreen({
  teamId,
  processId,
}: {
  teamId: string
  processId: string
}) {
  const detailQ = useCached<ProcessDetail>(processKey(processId), () =>
    tenancy.processDetail(processId)
  )
  const commentsQ = useCached<{ comments: ProcessComment[]; total: number }>(
    processCommentsKey(processId),
    () => tenancy.processComments(processId)
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
    invalidate(valueKey(teamId))
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
    })
    refresh()
    toast.success("Process updated.")
  }

  async function saveStep(values: StepFormValues) {
    if (editingStep)
      await tenancy.updateStep({
        id: editingStep.id,
        name: values.name,
        description: values.description || null,
        secondsPerRun: values.secondsPerRun,
        runsPerMonth: values.runsPerMonth,
      })
    else
      await tenancy.addStep({
        processId,
        name: values.name,
        description: values.description || null,
        secondsPerRun: values.secondsPerRun,
        runsPerMonth: values.runsPerMonth,
      })
    refresh()
    toast.success(editingStep ? "Step updated." : "Step added.")
  }

  if (detailQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the process.</p>
  if (detailQ.data === undefined) return <Skeleton variant="list" lines={5} />

  const { process, versions, steps, commentsTotal } = detailQ.data
  const current = versions[0] ?? null
  const currentLabel = current
    ? `version ${current.versionNo}${current.label ? ` — ${current.label}` : ""}`
    : "the current version"

  const overviewItems = [
    { label: "App", value: process.appName },
    { label: "What it is", value: process.description || "—" },
    { label: "Current version", value: current ? `Version ${current.versionNo}` : "—" },
    {
      label: "Baseline",
      value: versions.find((v) => v.isBaseline)?.label || "Version 1",
    },
    ...auditItems({
      createdByName: null,
      createdAt: process.createdAt,
      editedByName: null,
      updatedAt: null,
      status: process.active ? "Active" : "Archived",
    }),
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "steps",
        label: "Steps",
        icon: CONCEPT_ICON.steps,
        badge: formatCount(process.stepCount),
        badgeVariant: "" as const,
      },
      {
        value: "versions",
        label: "Versions",
        icon: CONCEPT_ICON.versions,
        badge: formatCount(process.versionCount),
        badgeVariant: "" as const,
      },
      {
        value: "conversation",
        label: "Conversation",
        icon: CONCEPT_ICON.comments,
        badge: formatCount(commentsQ.data?.total ?? commentsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: "Activity",
        icon: CONCEPT_ICON.activity,
        // R8: a tab that reveals a collection carries its count, and R16 says the
        // number is the server total through the one seam — never the loaded page.
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{process.name}</span>
            {!process.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Archived
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {process.appName}
            {current ? ` · version ${current.versionNo}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: "Cut a new version?",
                  body: "Today's steps are copied into a new version, and this one is kept exactly as it was agreed. Edits from now on describe the new way of working.",
                  action: "Cut version",
                  run: () =>
                    run(
                      () => tenancy.cutVersion(processId),
                      "New version cut.",
                      "Couldn't cut a new version."
                    ),
                })
              }
              className="gap-1.5"
            >
              <GitBranch className="size-3.5" />
              Cut version
            </Button>
          )}
          {canArchive &&
            (process.active ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
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
                  })
                }
                className="text-destructive hover:text-destructive gap-1.5"
              >
                <Power className="size-3.5" />
                Archive
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => tenancy.setProcessActive(processId, true),
                    "Process restored.",
                    "Couldn't restore the process."
                  )
                }
                className="gap-1.5"
              >
                {busy ? <Spinner /> : <Power className="size-3.5" />}
                Restore
              </Button>
            ))}
        </div>
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )

          if (t.value === "steps")
            return (
              <div className="flex flex-col gap-3">
                {canCreate && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingStep(null)
                        setStepOpen(true)
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="size-3.5" />
                      Add step
                    </Button>
                  </div>
                )}
                {steps.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No steps yet. Add the first one and say how long it takes and how often it
                    happens — that is what a saving is measured from.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex flex-col gap-2 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {step.name}
                            {step.removed && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                no longer done
                              </Badge>
                            )}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {minutes(step.secondsPerRun)} · {step.runsPerMonth.toLocaleString()}× a
                            month
                            {step.description ? ` · ${step.description}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {canEdit && !step.removed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                setEditingStep(step)
                                setStepOpen(true)
                              }}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                          )}
                          {canArchive && !step.removed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              className="text-destructive hover:text-destructive gap-1.5"
                              onClick={() =>
                                setConfirm({
                                  title: `Does "${step.name}" still happen?`,
                                  body: "Recording that it stopped is how its whole time becomes a saving. The step keeps its place in this version and in every older one — nothing is deleted.",
                                  action: "It no longer happens",
                                  run: () =>
                                    run(
                                      () => tenancy.removeStep(step.id),
                                      "Step recorded as no longer done.",
                                      "Couldn't record that."
                                    ),
                                })
                              }
                            >
                              <Power className="size-3.5" />
                              Stopped
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )

          if (t.value === "versions")
            return (
              <div className="rounded-lg border">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-baseline justify-between gap-3 border-b p-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        Version {v.versionNo}
                        {v.label ? ` — ${v.label}` : ""}
                        {v.isBaseline && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            baseline
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(v.createdAt).toLocaleDateString()}
                        {v.cutFromSprintId ? " · cut when a sprint completed" : ""}
                        {v.createdByName ? ` · ${v.createdByName}` : ""}
                      </p>
                    </div>
                    {v.versionNo === current?.versionNo && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        current
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )

          if (t.value === "conversation")
            return (
              <Comments
                items={(commentsQ.data?.comments ?? []).map((c) => ({
                  id: c.id,
                  author: c.createdByName ?? (c.fromStaff ? "Your team" : "A colleague"),
                  body: c.explainsStepKey ? `Why a step takes longer — ${c.body}` : c.body,
                  time: new Date(c.createdAt).toLocaleDateString(),
                }))}
                onAdd={
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

          return (
            // R14: the badge above counts the WHOLE history, so the feed under it
            // must be able to reach all of it — page one, then Load more.
            <div className="flex flex-col gap-4">
              <ActivityFeed
                config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                items={activity.items}
              />
              <LoadMore
                listKey={activity.listKey}
                fetchPage={activity.fetchPage}
                label="Load more activity"
              />
            </div>
          )
        }}
      />

      <ProcessFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        apps={[]}
        initial={{ name: process.name, description: process.description ?? "" }}
        draftKey={`process:edit:${processId}`}
        onSubmit={saveProcess}
      />

      <StepFormDialog
        open={stepOpen}
        onOpenChange={setStepOpen}
        versionLabel={currentLabel}
        initial={
          editingStep
            ? {
                name: editingStep.name,
                description: editingStep.description ?? "",
                secondsPerRun: editingStep.secondsPerRun,
                runsPerMonth: editingStep.runsPerMonth,
              }
            : undefined
        }
        draftKey={editingStep ? `step:edit:${editingStep.id}` : `step:add:${processId}`}
        onSubmit={saveStep}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !busy && !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
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
              {busy ? "Working…" : confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
