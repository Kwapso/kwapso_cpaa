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
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { CheckCheck, RotateCcw } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { StoriesPanel, sliceKey } from "@/components/work-panels"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import { listFetch, sprintsKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Sprint } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"

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
  // Sprints are bounded and read whole, so the record comes out of the same cache
  // the list holds — opening one costs no round-trip.
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  const activity = useRecordActivity("sprints", sprintId)
  const storiesTotal = useCachedValue<number>(totalKey("stories-sprint", sprintId))

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  const canCreate = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [storyOpen, setStoryOpen] = React.useState(false)
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

  if (sprintsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the sprint.</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const sprint = sprintsQ.data.find((s) => s.id === sprintId) ?? null
  if (!sprint) return <p className="text-muted-foreground text-sm">That sprint no longer exists.</p>

  const done = sprint.storyCount - sprint.openStoryCount
  const overviewItems = [
    { label: "Reference", value: sprint.ref || "—" },
    { label: "Kind", value: sprint.sprintType || "—" },
    { label: "Client", value: sprint.accountName || "Ours — no client" },
    { label: "App", value: sprint.appName || "—" },
    { label: "What it's for", value: sprint.goal || "—" },
    { label: "Runs", value: sprint.startsOn && sprint.endsOn ? `${sprint.startsOn} → ${sprint.endsOn}` : (sprint.startsOn ?? sprint.endsOn ?? "—") },
    { label: "Price sold", value: priceSold(sprint.soldPriceCents, sprint.currency) },
    {
      label: "Work inside it",
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
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "stories",
        label: "Stories",
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: "Activity",
        icon: CONCEPT_ICON.activity,
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
            <span className="truncate">{sprint.name}</span>
            {sprint.completedAt && (
              <Badge variant="secondary" className="text-[10px]">
                Complete
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
                On {sprint.appName}
              </button>
            )}
            {sprint.accountId && sprint.accountName && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/accounts/${sprint.accountId}`)}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                For {sprint.accountName}
              </button>
            )}
          </p>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
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
          Completing this sprint cuts a new version of every process map inside its app, so the
          savings can be measured from what changed.
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
            return (
              // R14: the badge above counts the WHOLE history, so the feed under
              // it must be able to reach all of it — page one, then Load more.
              <div className="flex flex-col gap-4">
                <ActivityFeed
                  config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                  items={activity.items}
                />
                <LoadMore listKey={activity.listKey} fetchPage={activity.fetchPage} label="Load more activity" />
              </div>
            )
          return (
            <DescriptionList
              config={{ ...defaultDescriptionListConfig, columns: 1 }}
              items={overviewItems}
            />
          )
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
        draftKey={`story:add:sprint:${sprintId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, { ...v, sprintId })
          invalidate(sliceKey("stories-sprint", sprintId))
        }}
      />
    </div>
  )
}
