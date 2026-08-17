"use client"

// SPRINT DETAIL — one block of sold work at /sprints/<id>, as a tabbed record
// (Law R2): Overview / Stories / Activity.
//
// COMPLETING A SPRINT LIVES HERE, deliberately and nowhere else. It is not a
// status word: it is the moment that cuts a version of every process map beneath
// it, which is what every savings figure afterwards is subtracted from. A
// consequence that size gets a button on the record's own screen with a sentence
// beside it, never a control in a row's overflow menu.
//
// Host-composed: the Stories tab is a collection with its own create action, and
// no engine block draws it.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { CheckCheck, Pencil, RotateCcw } from "lucide-react"

import {
  SprintFormDialog,
  sprintTypeLabel,
  sprintTypeName,
  useSprintTypes,
} from "@/components/sprint-form-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { StoriesPanel, sliceKey } from "@/components/work-panels"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { listFetch, sprintsKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Sprint } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"

/** Whole cents → what a person would say. The FORMATTING is the shared seam
 * (shared/web/money.ts) now that the two rate cards render prices of their own;
 * what stays here is the only part that is about a sprint — that a sprint with
 * no price of its own was sold inside something else, which is a sentence rather
 * than a zero. */
function priceSold(cents: number, currency: string | null): string {
  if (!cents) return "Not sold separately"
  return moneyText(cents, currency)
}

export function SprintDetailScreen({
  teamId,
  sprintId,
  basePath,
}: {
  teamId: string
  sprintId: string
  /** the sprints list in the URL form we arrived through */
  basePath: string
}) {
  const { t, lang } = useLanguage()
  // Sprints are bounded and read whole, so the record comes out of the same cache
  // the list holds — opening one costs no round-trip.
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  const activity = useRecordActivity("sprints", sprintId)
  const storiesTotal = useCachedValue<number>(totalKey("stories-sprint", sprintId))
  // The team's own sprint-type vocabulary, for the mark and the standard length
  // the Kind row shows. Cache-first: the form beside it reads the same key.
  const sprintTypes = useSprintTypes(teamId)

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  const canCreate = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [storyOpen, setStoryOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)
  const host = { base: basePath.replace(/\/sprints$/, "") }

  async function setComplete(complete: boolean) {
    setBusy(true)
    try {
      await contentApi.setSprintComplete(sprintId, complete)
      invalidate(sprintsKey(teamId))
      invalidate(`activity:record:sprints:${sprintId}`)
      toast.success(complete ? "Sprint completed." : "Sprint reopened.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that sprint.")
    } finally {
      setBusy(false)
    }
  }

  if (sprintsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the sprint.")}</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const sprint = sprintsQ.data.find((s) => s.id === sprintId) ?? null
  if (!sprint) return <p className="text-muted-foreground text-sm">{t("That sprint no longer exists.")}</p>

  const kindOption = sprintTypes.find((o) => o.value === sprint.sprintType)
  const kindLine = !sprint.sprintType
    ? "—"
    : kindOption
      ? `${sprintTypeLabel(kindOption, lang)}${kindOption.standardDays === null ? "" : `, normally ${kindOption.standardDays} days`}`
      : sprint.sprintType
  // THE KIND, SAID TWICE AND ON PURPOSE — as a mark in the leading slot beside
  // the title, and as the WORD on the eyebrow directly above it. That pairing is
  // what makes a mark legal rather than decoration (UI-CONVENTIONS §5): it sits
  // where an icon sits, it is `aria-hidden`, and the word is never further away
  // than the line above. A sprint nobody typed a kind on still gets an eyebrow —
  // "Sprint" is what it is — and simply carries no mark.
  const kindWord = kindOption ? sprintTypeName(kindOption, lang) : sprint.sprintType || t("Sprint")
  const kindMark = kindOption?.mark ?? null

  const done = sprint.storyCount - sprint.openStoryCount
  const overviewItems = [
    { label: t("Reference"), value: sprint.ref || "—" },
    // THE KIND, AND WHAT THE KIND CARRIES. A sprint type used to be a bare word;
    // since team-schema 0025 it also holds the mark somebody recognises it by,
    // the label a German client reads, and how long a block of this kind
    // normally runs — the delivery catalogue's fields, on the thing they were
    // always describing. The DATES are still the ones somebody agreed; this
    // number is what to expect, said beside them.
    { label: t("Kind"), value: kindLine },
    { label: t("Client"), value: sprint.accountName || "Ours — no client" },
    { label: t("App"), value: sprint.appName || "—" },
    { label: t("What it's for"), value: sprint.goal || "—" },
    {
      label: t("Runs"),
      value:
        sprint.startsOn && sprint.endsOn
          ? `${formatDate(sprint.startsOn)} → ${formatDate(sprint.endsOn)}`
          : (formatDate(sprint.startsOn) || formatDate(sprint.endsOn) || "—"),
    },
    { label: t("Price sold"), value: priceSold(sprint.soldPriceCents, sprint.currency) },
    {
      label: t("Work inside it"),
      value: sprint.storyCount > 0 ? `${done} of ${sprint.storyCount} done` : "Nothing in it yet",
    },
    ...auditItems({
      createdByName: sprint.createdByName,
      createdAt: sprint.createdAt,
      editedByName: null,
      updatedAt: null,
      status: sprint.completedAt ? "Complete" : "Running",
    }),
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "stories",
        label: t("Stories"),
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {kindMark && (
            <span
              aria-hidden
              className="bg-muted grid size-11 shrink-0 place-items-center rounded-xl text-2xl leading-none"
            >
              {kindMark}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.5px] uppercase">
              {kindWord}
            </p>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              <span className="truncate">{sprint.name}</span>
              {sprint.completedAt && (
                <Badge variant="secondary" className="text-[10px]">
                  {t("Complete")}
                </Badge>
              )}
            </h1>
            {/* THE CROSS-LINKS UP THE TREE — the app it covers and the client who
                bought it, both one tap away. */}
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {sprint.ref && <span>{sprint.ref}</span>}
              {sprint.appId && sprint.appName && (
                <button
                  type="button"
                  onClick={() => softNavigate(`${host.base}/apps/${sprint.appId}`)}
                  className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {t("On")} {sprint.appName}
                </button>
              )}
              {sprint.accountId && sprint.accountName && (
                <button
                  type="button"
                  onClick={() => softNavigate(`${host.base}/accounts/${sprint.accountId}`)}
                  className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {t("For")} {sprint.accountName}
                </button>
              )}
            </p>
          </div>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          {/* EDIT — first, because it is the everyday one. Completing a sprint is
              an event with consequences and sits to its right; neither is
              destructive, so neither asks first (UI-CONVENTIONS §4). */}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void setComplete(!sprint.completedAt)}
              className="gap-1.5"
            >
              {busy ? (
                <Spinner />
              ) : sprint.completedAt ? (
                <RotateCcw className="size-3.5" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              {sprint.completedAt ? "Reopen" : "Complete"}
            </Button>
          )}
        </div>
      </div>

      {canEdit && !sprint.completedAt && (
        <p className="text-muted-foreground text-sm">
          {t("Completing this sprint cuts a new version of every process map inside its app, so the savings can be measured from what changed.")}
        </p>
      )}

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "stories")
            return (
              <StoriesPanel
                ownerKind="sprint"
                ownerId={sprintId}
                filter={{ sprintId }}
                host={host}
                onNew={canCreate ? () => setStoryOpen(true) : undefined}
                emptyText="No work in this sprint yet."
              />
            )
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      <StoryFormDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        {...(sprint.appId && sprint.appName
          ? { fixedApp: { id: sprint.appId, name: sprint.appName } }
          : {})}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        draftKey={`story:add:sprint:${sprintId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, { ...v, sprintId })
          invalidate(sliceKey("stories-sprint", sprintId))
        }}
      />

      {/* The edit form. The response is the whole (bounded) sprint list, which is
          the same cache this screen reads its record out of — so priming it is
          what makes the new price appear here and on the list behind it at once.
          Everyone else gets the row-level live ping. */}
      <SprintFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        apps={options.apps}
        draftKey={`sprint:edit:${sprintId}`}
        initial={{
          name: sprint.name,
          goal: sprint.goal,
          sprintType: sprint.sprintType,
          accountName: sprint.accountName,
          appName: sprint.appName,
          startsOn: sprint.startsOn,
          endsOn: sprint.endsOn,
          soldPriceCents: sprint.soldPriceCents,
          currency: sprint.currency,
        }}
        onSubmit={async (v) => {
          const { sprints } = await contentApi.updateSprint({
            id: sprintId,
            name: v.name,
            goal: v.goal || undefined,
            sprintType: v.sprintType || undefined,
            startsOn: v.startsOn || undefined,
            endsOn: v.endsOn || undefined,
            soldPriceCents: v.soldPriceCents,
            currency: v.currency || undefined,
          })
          primeCache(sprintsKey(teamId), sprints)
          invalidate(`activity:record:sprints:${sprintId}`)
          toast.success(t("Sprint updated."))
        }}
      />
    </div>
  )
}
