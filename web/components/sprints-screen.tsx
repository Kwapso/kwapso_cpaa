"use client"

// SPRINTS — the blocks of delivery work sold, each covering one app for one
// account. Its own section now (the owner's ruling), where it used to be a strip
// under the backlog: completing a sprint is what cuts a version of every process
// map beneath it, and a consequence that size should not live in somebody's
// peripheral vision.
//
// Completing and reopening live on the SPRINT'S OWN SCREEN rather than as a
// button on every row here — one deliberate place for a deliberate act.

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
import { SprintFormDialog, type SprintFormValues } from "@/components/sprint-form-dialog"
import { sprintLine } from "@/components/work-panels"
import { content as contentApi } from "@/lib/api"
import { appsKey, listFetch, sprintsKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { AppRow, Sprint } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

/** One sprint, as a row. Everything a person would say about one out loud. */
function shapeSprints(sprints: Sprint[]) {
  return {
    rows: sprints.map((s) => ({
      id: s.id,
      name: s.ref ? `${s.ref} · ${s.name}` : s.name,
      detail: sprintLine(s),
      // Facet columns (read by the filter engine, not the renderer).
      account: s.accountName ?? "No client",
      app: s.appName ?? "No app",
      state: s.completedAt ? "Complete" : "Running",
    })),
  }
}

/** Start a sprint through the door and re-read what changed. Shared with the
 * app's own screen, which can start one for itself. */
export async function createSprintFrom(teamId: string, values: SprintFormValues): Promise<void> {
  await contentApi.createSprint({
    name: values.name,
    goal: values.goal || undefined,
    sprintType: values.sprintType || undefined,
    accountId: values.accountId || undefined,
    appId: values.appId || undefined,
    startsOn: values.startsOn || undefined,
    endsOn: values.endsOn || undefined,
    soldPriceCents: values.soldPriceCents,
    currency: values.currency || undefined,
  })
  invalidate(sprintsKey(teamId))
  toast.success("Sprint started.")
}

export function SprintsScreen({
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
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  // The apps a sprint can cover. Bounded and already held by three other screens,
  // so opening this one costs nothing extra.
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  const [addOpen, setAddOpen] = React.useState(false)

  if (sprintsQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the sprints.</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeSprints(sprintsQ.data)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)

  return (
    <div className="flex flex-col gap-4">
      {/* R16: a sidebar page has no tab strip to badge, so the count lives in the
          heading — and it is the door's exact COUNT(*). */}
      <CollectionHeading sectionKey="sprints" total={total} />

      <SectionWithCreate
        show={canCreate}
        label="Start a sprint"
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

      {/* R14: BOUNDED, not paged — a sprint is a contract, so this collection
          grows at the speed of signatures and the door's cap is an honest answer
          rather than an eventual refusal. No <LoadMore>, on purpose. */}

      <SprintFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        apps={(appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        draftKey={`sprint:add:${teamId}`}
        onSubmit={(v) => createSprintFrom(teamId, v)}
      />
    </div>
  )
}
