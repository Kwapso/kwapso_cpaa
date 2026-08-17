"use client"

// PROCESS MAPS — the sidebar page: what the work saved, and every map it came
// from.
//
// The VALUE comes first on purpose. The list of maps is how the team maintains
// the numbers; the number is why anybody maintains them. Putting the drill-down
// above the list means the first thing a person sees when they open this page is
// the sentence they will say to a client, with the App → Process → Step trail
// under it that answers the next question.
//
// The screen owns its own create dialog rather than routing through the host's
// ?panel machinery, the way the dropdown-values screen does: a map needs the
// list of apps to be created at all, and that is this screen's data.

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
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { AppFormDialog, useTeamMembers, type AppFormValues } from "@/components/app-form-dialog"
import { ProcessFormDialog, type ProcessFormValues } from "@/components/process-form-dialog"
import { ValuePanel } from "@/components/value-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import { accountsKey, appsKey, listFetch, processesKey, valueKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Account, AppRow, ProcessSummary } from "@shared/types"
import type { SavingsView } from "@shared/workers/savings"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** One map, as a row. The summary line is what you'd read out loud: which app it
 * belongs to, how many steps it has now, and how many versions it has been
 * through. */
function shapeProcessesList(processes: ProcessSummary[]) {
  return {
    rows: processes.map((p) => ({
      id: p.id,
      // Archived maps stay visible (archive-never-delete), flagged like retired
      // roles and articles are.
      name: p.active ? p.name : `${p.name} (archived)`,
      detail:
        [
          p.appName,
          `${p.stepCount} step${p.stepCount === 1 ? "" : "s"}`,
          p.versionCount > 1 ? `version ${p.versionCount}` : "baseline only",
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      // Facet columns (read by the filter engine, not the renderer).
      app: p.appName,
      archived: p.active ? "No" : "Yes",
    })),
  }
}

export function ProcessesScreen({
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
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  // Who can be put on an app (8.10), for the record-an-app dialog below.
  const members = useTeamMembers(teamId)
  // Page one, and its next cursor parked in the sidecar <LoadMore> reads (R14).
  // The same fetcher primes the exact `total:` sidecar the heading badges (R16).
  const processesQ = useCached<ProcessSummary[]>(processesKey(teamId), () =>
    listFetch.processes(teamId)
  )
  const valueQ = useCached<SavingsView>(valueKey(teamId), () => tenancy.value())
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => tenancy.apps().then((r) => r.apps))

  // The accounts an app can belong to. Page one is plenty for a picker, and it
  // is the SAME cache the accounts screen holds — opening this page adds no
  // round-trip for a team that has already been there.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))

  const [addOpen, setAddOpen] = React.useState(false)
  const [appOpen, setAppOpen] = React.useState(false)

  async function create(values: ProcessFormValues) {
    try {
      await tenancy.createProcess({
        appId: values.appId,
        name: values.name,
        description: values.description || undefined,
        baselineLabel: values.baselineLabel || undefined,
      })
      invalidate(processesKey(teamId))
      invalidate(valueKey(teamId))
      toast.success(t("Process mapped."))
    } catch (err) {
      throw err instanceof ApiFailure ? err : new Error("Couldn't map that process.")
    }
  }

  async function createApp(values: AppFormValues) {
    await tenancy.createApp({
      name: values.name,
      accountId: values.accountId || undefined,
      url: values.url || undefined,
      stage: values.stage || undefined,
      toolCostCentsPerMonth: values.toolCostCentsPerMonth,
    })
    invalidate(appsKey(teamId))
    invalidate(valueKey(teamId))
    toast.success(t("App recorded."))
  }

  if (processesQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load the processes.")}</p>
  if (processesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const loaded = processesQ.data
  const apps = (appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))

  return (
    <div className="flex flex-col gap-4">
      {/* R16: the count lives in the heading (a sidebar page has no tab strip to
          badge), and it is the door's exact COUNT(*) — never the loaded page's
          length, which on a paged list is just "50" forever. */}
      <CollectionHeading sectionKey="processes" total={total} />

      <ValuePanel view={valueQ.data} />

      {/* R14's other half: maps are kept rather than replaced, and the oldest is
          the one a client asks about — so the search box is answered by the door
          rather than by filtering the page the browser happens to hold. */}
      <PagedFind<ProcessSummary>
        listKey={processesKey(teamId)}
        placeholder={t("Search processes…")}
        noun="maps"
        fetchPage={(query, cursor) =>
          tenancy
            .processes({ ...query, cursor })
            .then((r) => ({ rows: r.processes, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          const rows = found.active ? found.rows : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          const data = shapeProcessesList(rows)
          const listRecipe = withDataDrivenCollection(recipe, data.rows, found.emptyText)
          return (
            <>
              {/* A map lives inside an app, so a team with no apps yet has to be able to
                  record one from here — otherwise this screen is a dead end with a
                  create button that cannot be pressed. */}
              <SectionWithCreate
                show={canCreate && apps.length > 0}
                label={t("Map a process")}
                icon="plus"
                secondary={{ show: canCreate, label: t("Record an app"), onClick: () => setAppOpen(true) }}
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

              {/* R14: every app of every client grows maps, and none is ever deleted —
                  the list pages. */}
              <LoadMore
                listKey={found.listKey ?? processesKey(teamId)}
                label={t("Load more processes")}
                fetchPage={found.fetchPage}
              />
            </>
          )
        }}
      </PagedFind>

      <AppFormDialog
        members={members}
        open={appOpen}
        onOpenChange={setAppOpen}
        teamId={teamId}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        draftKey={`app:add:${teamId}`}
        onSubmit={createApp}
      />

      <ProcessFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        apps={apps}
        draftKey={`process:add:${teamId}`}
        onSubmit={create}
      />
    </div>
  )
}
