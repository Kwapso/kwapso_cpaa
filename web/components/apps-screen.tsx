"use client"

// APPS — the systems we have built. An app belongs to ONE account, always (the
// owner's ruling), and everything else in the work engine hangs off it: a sprint
// covers one app, and a story is on one app whether or not it is in a sprint.
//
// IT IS A WALL OF TILES, NOT A LIST OF ROWS (CHECKLIST 8.1, 17 Aug 2026). An app
// is the one record in this app that a person recognises by SIGHT — it has a
// mark, a client and a stage, and the previous screen spent all three on a
// dot-separated subtitle nobody read. UI-RULEBOOK K9 permits a card grid exactly
// where the record carries an image, and G3 says the mark sits in a rounded
// square where a logo would; both are true here.
//
// TWO TABS, EACH GROUPED BY STAGE (8.2). Active is everything still being worked
// on; Inactive is Completed and Archived, which is the only pair of stages that
// means "done with". Under each tab the tiles group under a plain stage heading
// (UI-RULEBOOK K6), in the order the agency reads them. The count on each tab is
// the exact number of rows behind it, arbitrated through CountedTabs (R16) so
// the heading above stands down rather than saying the number twice.
//
// AN ARCHIVED APP (deactivated_at set) is a different fact from the Archived
// STAGE, and both land in Inactive on purpose: from the reader's side "put away"
// is one idea, and a tile that says "archived" under the heading "Archived" is
// the app agreeing with itself.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import type { ScreenActionContext, ScreenIntent } from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { AppFormDialog, type AppFormValues } from "@/components/app-form-dialog"
import { useAssignableMembers } from "@/lib/members"
import { AppTiles } from "@/components/app-tiles"
import { tenancy } from "@/lib/api"
import { accountsKey, appsKey, listFetch, valueKey } from "@/lib/live-resources"
import { formatCount } from "@shared/web/format-count"
import { NO_STAGE, appStageIsActive, appStageOrder } from "@shared/app-stages"
import type { Account, AppRow } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** Record an app through the door and re-read what changed. Shared with the maps
 * screen and the account record, both of which can add one. */
export async function createAppFrom(teamId: string, values: AppFormValues): Promise<void> {
  await tenancy.createApp({
    name: values.name,
    accountId: values.accountId || undefined,
    url: values.url || undefined,
    stage: values.stage || undefined,
    logoUrl: values.logoUrl || undefined,
    toolCostCentsPerMonth: values.toolCostCentsPerMonth,
    about: values.about || undefined,
    clientContext: values.clientContext || undefined,
    solution: values.solution || undefined,
    keyActors: values.keyActors || undefined,
    // Who is on it, from the same submit (8.10 + 8.5). Sent even when empty, so
    // recording an app with nobody on it is a deliberate answer rather than a
    // field the door never heard about.
    staffUserIds: values.staffUserIds,
    leadUserId: values.leadUserId || undefined,
    stakeholderContactIds: values.stakeholderContactIds,
    mainStakeholderContactId: values.mainStakeholderContactId || undefined,
  })
  invalidate(appsKey(teamId))
  invalidate(valueKey(teamId))
  toast.success("App recorded.")
}

/** Split by stage, in the agency's own reading order, with the apps that carry no
 * stage last under one honest heading. The grouping is a pure function of the
 * rows so the two tabs and the app record can never disagree about which stage a
 * system is in. */
export function groupByStage(apps: AppRow[]): { stage: string; apps: AppRow[] }[] {
  const groups = new Map<string, AppRow[]>()
  for (const app of apps) {
    const key = app.stage?.trim() || NO_STAGE
    const list = groups.get(key)
    if (list) list.push(app)
    else groups.set(key, [app])
  }
  return [...groups.entries()]
    .map(([stage, rows]) => ({ stage, apps: rows }))
    .sort((a, b) => {
      if (a.stage === NO_STAGE) return 1
      if (b.stage === NO_STAGE) return -1
      const byOrder = appStageOrder(a.stage) - appStageOrder(b.stage)
      return byOrder !== 0 ? byOrder : a.stage.localeCompare(b.stage)
    })
}

/** Is this app still being worked on? An ARCHIVED row is inactive whatever its
 * stage says, and a stage the code has never met counts as active — the harm of
 * the wrong guess is asymmetric, and an app nobody can find is the worse half. */
export function appIsActive(app: AppRow): boolean {
  return app.active && appStageIsActive(app.stage)
}

export function AppsScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded list's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  // The accounts an app can belong to — page one is plenty for a picker, and it
  // is the SAME cache the accounts screen holds.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  // Who can be put on an app (8.10) — the team, from the cache four other
  // screens already fill.
  const members = useAssignableMembers(teamId)
  const [addOpen, setAddOpen] = React.useState(false)
  const [tab, setTab] = React.useState("active")
  // The engine recipe and its rights are still the contract this screen is
  // handed; the tiles below draw the rows themselves, and the row ACTIONS stay
  // the engine's so a permission change reaches them without a second edit.
  void recipe
  void rights
  void onAction
  void onIntent

  if (appsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the apps.")}</p>
  if (appsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const names = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))
  const active = appsQ.data.filter(appIsActive)
  const inactive = appsQ.data.filter((a) => !appIsActive(a))
  const shown = tab === "inactive" ? inactive : active

  const activeBadge = formatCount(active.length)
  const inactiveBadge = formatCount(inactive.length)
  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "active", label: t("Active"), icon: "app-window", badge: activeBadge, badgeVariant: "" as const },
      { value: "inactive", label: t("Inactive"), icon: "archive", badge: inactiveBadge, badgeVariant: "" as const },
    ],
  }

  return (
    // R16 ARBITRATION: the two tabs carry the split, so the heading stands down
    // rather than saying a third number two lines above them. Same shape as the
    // tasks screen's six views, and for the same reason.
    <CountedAbove active={activeBadge !== "" || inactiveBadge !== ""}>
    <div className="flex flex-col gap-6">
      <CollectionHeading sectionKey="apps" total={total} />

      <SectionWithCreate
        show={canCreate}
        label={t("Record an app")}
        icon="plus"
        onCreate={() => setAddOpen(true)}
        aboveCard={<TabsView config={tabsConfig} value={tab} onValueChange={setTab} />}
      >
        {shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {tab === "inactive" ? t("Nothing is finished or put away yet.") : t("No apps yet.")}
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {groupByStage(shown).map((group) => (
              <section key={group.stage} className="flex flex-col gap-4">
                <h2 className="text-lg font-medium">{t(group.stage)}</h2>
                <AppTiles apps={group.apps} accountNames={names} />
              </section>
            ))}
          </div>
        )}
      </SectionWithCreate>

      {/* R14: BOUNDED, not paged — an agency has tens of apps, not thousands.
          The collection that grows underneath is the process maps. */}

      <AppFormDialog
        members={members}
        open={addOpen}
        onOpenChange={setAddOpen}
        teamId={teamId}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        draftKey={`app:add:${teamId}`}
        onSubmit={(v) => createAppFrom(teamId, v)}
      />
    </div>
    </CountedAbove>
  )
}
