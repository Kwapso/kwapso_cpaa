"use client"

// APPS — the systems we have built. An app belongs to ONE account, always (the
// owner's ruling), and everything else in the work engine hangs off it: a sprint
// covers one app, and a story is on one app whether or not it is in a sprint.
//
// It had no screen at all before this: apps could be recorded from a dialog on
// the process-maps page and then never looked at again. So this is the inventory,
// and the record behind each row is where its sprints, its work and its maps meet.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { AppFormDialog, type AppFormValues } from "@/components/app-form-dialog"
import { tenancy } from "@/lib/api"
import { accountsKey, appsKey, listFetch, valueKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Account, AppRow } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

/** One app, as a row: whose it is, where it is up to, and its address. The
 * monthly tool cost is deliberately NOT here — it is what the system costs US,
 * and an internal number belongs on the record with the rest of the ledger. */
function shapeApps(apps: AppRow[], accountNames: Map<string, string>) {
  return {
    rows: apps.map((a) => {
      const account = a.accountId ? (accountNames.get(a.accountId) ?? "A client") : "Ours"
      return {
        id: a.id,
        // Archived apps stay visible (archive-never-delete), flagged like retired
        // roles and articles are.
        name: a.active ? a.name : `${a.name} (archived)`,
        detail: [account, a.stage, a.url].filter(Boolean).join(" · ") || "—",
        // Facet columns (read by the filter engine, not the renderer).
        account,
        stage: a.stage ?? "Not said",
        state: a.active ? "No" : "Yes",
      }
    }),
  }
}

/** Record an app through the door and re-read what changed. Shared with the maps
 * screen and the account record, both of which can add one. */
export async function createAppFrom(teamId: string, values: AppFormValues): Promise<void> {
  await tenancy.createApp({
    name: values.name,
    accountId: values.accountId || undefined,
    url: values.url || undefined,
    stage: values.stage || undefined,
    toolCostCentsPerMonth: values.toolCostCentsPerMonth,
  })
  invalidate(appsKey(teamId))
  invalidate(valueKey(teamId))
  toast.success("App recorded.")
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
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  // The accounts an app can belong to — page one is plenty for a picker, and it
  // is the SAME cache the accounts screen holds.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  const [addOpen, setAddOpen] = React.useState(false)

  if (appsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the apps.</p>
  if (appsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const names = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))
  const data = shapeApps(appsQ.data, names)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  return (
    <div className="flex flex-col gap-4">
      {/* R16: a sidebar page has no tab strip to badge, so the count lives in the
          heading — and it is the door's exact COUNT(*). */}
      <CollectionHeading sectionKey="apps" total={total} />

      <SectionWithCreate
        show={canCreate}
        label="Record an app"
        icon="plus"
        onCreate={() => setAddOpen(true)}
      >
        <ScreenRenderer
          recipe={listRecipe}
          data={data}
          rights={rights}
          onAction={onAction}
          onIntent={onIntent}
        />
      </SectionWithCreate>

      {/* R14: BOUNDED, not paged — an agency has tens of apps, not thousands.
          The collection that grows underneath is the process maps. */}

      <AppFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        draftKey={`app:add:${teamId}`}
        onSubmit={(v) => createAppFrom(teamId, v)}
      />
    </div>
  )
}
