"use client"

// APP DETAIL — one system at /apps/<id>, as a tabbed record (Law R2): Overview /
// Sprints / Stories / Process maps / Activity.
//
// THIS SCREEN IS THE CROSS-LINK the owner named as mattering more than any single
// path: from an app to its account, from an app to its other stories. So the
// header says whose it is (a link, one tap to the account) and three of the tabs
// are the work hanging off it — each asked of the SERVER by `appId`, never
// narrowed in the browser, because the backlog is paged and "this app's work
// among the newest fifty" is an answer that looks like an answer.
//
// Host-composed, because those three tabs are collections with their own actions
// and no engine block draws them. Every count is an exact server COUNT(*) through
// the one formatCount seam (R16).

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Pencil, Power } from "lucide-react"

import { AppFormDialog, type AppFormValues } from "@/components/app-form-dialog"
import { SprintFormDialog } from "@/components/sprint-form-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createSprintFrom } from "@/components/sprints-screen"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { ProcessesPanel, SprintsPanel, StoriesPanel, sliceKey } from "@/components/work-panels"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import { accountsKey, appsKey, listFetch, totalKey, valueKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { Account, AppRow } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

export function AppDetailScreen({
  teamId,
  appId,
  basePath,
}: {
  teamId: string
  appId: string
  /** the apps list in the URL form we arrived through (/apps or /t/<team>/apps) */
  basePath: string
}) {
  const t = useT()
  // The apps set is bounded and read whole, so the record comes out of the same
  // cache the list holds — opening one costs no round-trip.
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  // The ONE web-side read of a record's history (R5) — rows, the door's exact
  // COUNT(*) for the tab badge, and the cursor the feed below spends.
  const activity = useRecordActivity("apps", appId)
  // The exact totals the three collection tabs badge (R16). Each is primed by
  // the panel's own fetch, over the same filter the panel's rows came from.
  const sprintsTotal = useCachedValue<number>(totalKey("sprints-app", appId))
  const storiesTotal = useCachedValue<number>(totalKey("stories-app", appId))
  const mapsTotal = useCachedValue<number>(totalKey("processes-app", appId))

  const { can } = usePermissions(teamId)
  const canEdit = can("processes", "edit")
  const canArchive = can("processes", "delete")
  const canWriteWork = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [sprintOpen, setSprintOpen] = React.useState(false)
  const [storyOpen, setStoryOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)

  // The URL PREFIX we are standing in — "" at the top level, "/t/<teamId>" inside
  // a team — so every cross-link off this record stays in the shape the person
  // arrived through. `basePath` ends in the section, which is one segment more.
  const host = { base: basePath.replace(/\/apps$/, "") }

  const refresh = React.useCallback(() => {
    invalidate(appsKey(teamId))
    invalidate(valueKey(teamId))
    invalidate(`activity:record:apps:${appId}`)
  }, [appId, teamId])

  async function save(values: AppFormValues) {
    await tenancy.updateApp({
      id: appId,
      name: values.name.trim(),
      url: values.url || null,
      stage: values.stage || null,
      toolCostCentsPerMonth: values.toolCostCentsPerMonth,
    })
    refresh()
    toast.success(t("App updated."))
  }

  async function setActive(active: boolean) {
    setBusy(true)
    try {
      await tenancy.setAppActive(appId, active)
      refresh()
      toast.success(active ? "App restored." : "App archived.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that app.")
    } finally {
      setBusy(false)
    }
  }

  if (appsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the app.")}</p>
  if (appsQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const app = appsQ.data.find((a) => a.id === appId) ?? null
  if (!app) return <p className="text-muted-foreground text-sm">{t("That app no longer exists.")}</p>

  const account = app.accountId ? (accountsQ.data ?? []).find((a) => a.id === app.accountId) : null
  const accountName = account?.name ?? (app.accountId ? "A client" : null)

  const overviewItems = [
    { label: t("Client"), value: accountName ?? "Ours — no client" },
    { label: t("Stage"), value: app.stage || "—" },
    { label: t("Address"), value: app.url || "—" },
    ...auditItems({
      createdByName: app.createdByName ?? null,
      createdAt: app.createdAt ?? null,
      editedByName: app.editedByName ?? null,
      updatedAt: app.updatedAt ?? null,
      status: app.active ? "Active" : "Archived",
    }),
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "sprints",
        label: t("Sprints"),
        icon: CONCEPT_ICON.sprints,
        badge: formatCount(sprintsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "stories",
        label: t("Stories"),
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "maps",
        label: t("Process maps"),
        icon: CONCEPT_ICON.processes,
        badge: formatCount(mapsTotal),
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
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{app.name}</span>
            {!app.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                {t("Archived")}
              </Badge>
            )}
          </h1>
          {/* THE CROSS-LINK UP THE TREE — an app belongs to one account, always,
              so its account is one tap away from every screen it appears on. */}
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {app.accountId ? (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/accounts/${app.accountId}`)}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t("Built for")} {accountName}
              </button>
            ) : (
              <span>{t("Ours — no client")}</span>
            )}
            {app.stage && <span>{app.stage}</span>}
          </p>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          {canArchive &&
            (app.active ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void setActive(false)}
                className="text-destructive hover:text-destructive gap-1.5"
              >
                {busy ? <Spinner /> : <Power className="size-3.5" />}
                {t("Archive")}
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void setActive(true)} className="gap-1.5">
                {busy ? <Spinner /> : <Power className="size-3.5" />}
                {t("Restore")}
              </Button>
            ))}
        </div>
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "sprints")
            return (
              <SprintsPanel
                ownerKind="app"
                ownerId={appId}
                filter={{ appId }}
                host={host}
                onNew={canWriteWork ? () => setSprintOpen(true) : undefined}
                emptyText="No work has been sold against this app yet."
              />
            )
          if (t.value === "stories")
            return (
              <StoriesPanel
                ownerKind="app"
                ownerId={appId}
                filter={{ appId }}
                host={host}
                onNew={canWriteWork ? () => setStoryOpen(true) : undefined}
                emptyText="Nothing has been done on this app yet."
              />
            )
          if (t.value === "maps") return <ProcessesPanel appId={appId} host={host} />
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      <AppFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        initial={{
          name: app.name,
          accountId: app.accountId ?? "",
          url: app.url ?? "",
          stage: app.stage ?? "",
          // A cost we have never been told is ZERO on the way into the form, not
          // absent: the field asks for an amount, and an amount nobody has given
          // is nothing rather than a blank the door would read as "leave it".
          toolCostCentsPerMonth: app.toolCostCentsPerMonth ?? 0,
        }}
        draftKey={`app:edit:${appId}`}
        onSubmit={save}
      />

      {/* Both forms open with THIS app already chosen — you are standing on it,
          so it is a fact rather than a question. */}
      <SprintFormDialog
        open={sprintOpen}
        onOpenChange={setSprintOpen}
        apps={options.apps}
        fixedApp={{ id: appId, name: app.name }}
        draftKey={`sprint:add:${appId}`}
        onSubmit={async (v) => {
          await createSprintFrom(teamId, v)
          invalidate(sliceKey("sprints-app", appId))
        }}
      />
      <StoryFormDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        fixedApp={{ id: appId, name: app.name }}
        tickets={options.tickets}
        members={options.members}
        draftKey={`story:add:app:${appId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, v)
          invalidate(sliceKey("stories-app", appId))
        }}
      />
    </div>
  )
}
