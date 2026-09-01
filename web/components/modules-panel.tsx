"use client"

// THE SECTIONS OF AN APP (Aurora, 19 Aug 2026: "please implement MODULES under
// apps, so i can group all the tickets I am creating in an organized way").
//
// WHAT A MODULE IS, and it is not a process. An APP has modules — the parts the
// software is divided into, Settings, Documents, Tasks — and a ticket names the
// one it is about, which is what makes a pile of tickets a list somebody can
// read. An ACCOUNT has processes, which are ways of WORKING and carry the times
// every saving is subtracted from. Two trees, meeting only on the app, and the
// reason both exist is that "which screen is broken" and "how does this job get
// done" are different questions.
//
// ROWS AND NOT CARDS. A module has no picture (K9 allows a card grid only where
// a record carries one), and the list is read to FIND a name rather than to
// browse — a picker's index, printed on the app record.
//
// IT ASKS FOR EVERY MODULE, NOT THIS APP'S. One read, one cache key, filtered
// here: the ticket form needs whichever app was just chosen and re-fetching on
// every change of a dropdown is a spinner where a list should be. It is a
// bounded read either way (APP_MODULE_CAP), and holding it whole is what lets a
// rename reach this list, the ticket form and the ticket filter at once through
// the ordinary row-level live path (R15).
//
// THE DOOR GATES; THIS ONLY DECIDES WHAT TO DRAW. Add and edit sit behind
// `processes:create` / `:edit` and switching one off behind `:delete` — the same
// rights that let somebody record the app itself, because a section of a system
// is part of the record of that system.

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/components/alert-dialog/alert-dialog"
import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Input } from "@shared/ui/components/input/input"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Pencil, Power, Search } from "@shared/ui/foundations/icons"

import { AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"
import { InternalRecordDialog, moduleFields, type InternalRecordValues } from "@/components/internal-record-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { appModulesKey, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import type { AppModule } from "@shared/types"
import { useT } from "@shared/web/language"
import { primeCache, useCached } from "@shared/web/store"

export function ModulesPanel({ teamId, appId }: { teamId: string; appId: string }) {
  const t = useT()
  const q = useCached<AppModule[]>(appModulesKey(teamId), () =>
    tenancy.appModules().then((r) => r.modules)
  )

  const { can } = usePermissions(teamId)
  const canCreate = can("processes", "create")
  const canEdit = can("processes", "edit")
  const canSwitchOff = can("processes", "delete")

  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AppModule | null>(null)
  const [switching, setSwitching] = React.useState<AppModule | null>(null)
  const [query, setQuery] = React.useState("")
  // No status filter here — the door already excludes an archived module (the
  // comment above), so every row in `modules` is active and a filter that can
  // never show a second value would be a control with nothing to control.
  const [sort, setSort] = React.useState<{ by: "name" | "ticketCount"; dir: "asc" | "desc" }>({
    by: "name",
    dir: "asc",
  })

  // THIS APP'S, out of the team's. Archived ones are excluded by the door, so
  // what is here is what a ticket can still be filed against.
  const modules = React.useMemo(
    () => (q.data ?? []).filter((m) => m.appId === appId),
    [q.data, appId]
  )

  const shownModules = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const dirMul = sort.dir === "desc" ? -1 : 1
    return modules
      .filter(
        (m) =>
          needle === "" ||
          m.name.toLowerCase().includes(needle) ||
          (m.description ?? "").toLowerCase().includes(needle)
      )
      .sort((a, b) =>
        sort.by === "ticketCount"
          ? (a.ticketCount - b.ticketCount) * dirMul
          : a.name.localeCompare(b.name) * dirMul
      )
  }, [modules, query, sort])

  // THE TAB BADGE, primed from the read this panel already makes (R16). It is an
  // exact number rather than a page length, because the read is bounded and
  // whole: there is no page two to be missing from it.
  React.useEffect(() => {
    if (q.data) primeCache(totalKey("modules-app", appId), modules.length)
  }, [q.data, modules.length, appId])

  async function save(values: InternalRecordValues, id?: string): Promise<void> {
    const input = {
      name: String(values.name ?? "").trim(),
      mark: String(values.mark ?? "").trim(),
      nameDe: String(values.nameDe ?? "").trim(),
      description: String(values.description ?? "").trim(),
      benefit: String(values.benefit ?? "").trim(),
    }
    if (id) await tenancy.updateAppModule({ id, ...input })
    else await tenancy.createAppModule({ appId, ...input })
  }

  if (q.loading && !q.data)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-[var(--radius)]" />
        ))}
      </div>
    )

  return (
    <div className="space-y-3">
      <ToolbarRow
        search={
          modules.length > 0 && (
            <>
              <div className="relative w-full sm:w-56">
                <Search
                  className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search modules…")}
                  className="h-9 pl-8"
                  aria-label={t("Search modules")}
                />
              </div>
              <SortControl
                options={[
                  { value: "name", label: t("Name") },
                  { value: "ticketCount", label: t("Open tickets") },
                ]}
                value={sort.by}
                onValueChange={(by) => setSort({ by: by as typeof sort.by, dir: "asc" })}
                direction={sort.dir}
                onDirectionChange={(dir) => setSort((s) => ({ ...s, dir }))}
                label={t("Sort by")}
              />
            </>
          )
        }
        actions={canCreate && <AddButton onClick={() => setAddOpen(true)} label={t("Add module")} />}
      />

      {modules.length === 0 ? (
        // No `app_modules` import target — a module names a section of a
        // system somebody already knows, not a list somebody holds in a
        // spreadsheet.
        <CollectionEmptyState
          title={t("No modules yet.")}
          description={t("Add the sections this app is divided into, so tickets can say which one they are about.")}
          onCreate={canCreate ? () => setAddOpen(true) : undefined}
        />
      ) : shownModules.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
      ) : (
        <ul className="space-y-2">
          {shownModules.map((m) => (
            <li
              key={m.id}
              className="bg-surface-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] p-3"
            >
              {/* THE EMOJI IS THE RECORD'S FACE (R35) — one glyph, and a quiet
                  dot where nobody has chosen one, so the names still line up. */}
              <span aria-hidden className="w-6 shrink-0 text-center text-lg">
                {m.mark || "·"}
              </span>
              <div className="min-w-0 flex-1 basis-[12rem]">
                <p className="truncate text-sm font-medium">{m.name}</p>
                {m.description ? (
                  <p className="text-muted-foreground truncate text-xs">{m.description}</p>
                ) : null}
              </div>
              {m.ticketCount > 0 ? (
                <Badge variant="secondary">
                  {m.ticketCount} {m.ticketCount === 1 ? t("open ticket") : t("open tickets")}
                </Badge>
              ) : null}
              {/* ICON-ONLY, on every width now (client ruling, 2026-08-31: "edit,
                  only the pencil icon") — no more `sm:not-sr-only` reveal. */}
              {canEdit ? (
                <Button variant="ghost" size="icon" onClick={() => setEditing(m)} aria-label={t("Edit")}>
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
              {canSwitchOff ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSwitching(m)}
                  className="text-destructive gap-1"
                >
                  <Power className="size-3.5" aria-hidden />
                  <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <InternalRecordDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fields={moduleFields()}
        title={t("Add a module")}
        subtitle={t("A section of this app, like Settings or Documents. Tickets say which one they are about.")}
        draftKey={`module-new:${appId}`}
        onSubmit={async (values) => {
          await save(values)
          setAddOpen(false)
        }}
      />

      <InternalRecordDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        fields={moduleFields()}
        title={t("Edit this module")}
        subtitle={t("Renaming it updates every ticket filed against it.")}
        initial={
          editing
            ? {
                name: editing.name,
                mark: editing.mark ?? "",
                nameDe: editing.nameDe ?? "",
                description: editing.description ?? "",
                benefit: editing.benefit ?? "",
              }
            : undefined
        }
        draftKey={editing ? `module-edit:${editing.id}` : undefined}
        onSubmit={async (values) => {
          if (editing) await save(values, editing.id)
          setEditing(null)
        }}
      />

      {/* SWITCHING OFF IS NOT DELETING, and the sentence says so — the tickets
          already filed against it keep naming it and still read correctly; it
          simply stops being offered on the form. */}
      <AlertDialog open={switching !== null} onOpenChange={(open) => !open && setSwitching(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Switch off this module?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "It stops being offered when somebody files a ticket. Every ticket already filed against it keeps it, and nothing is deleted."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep it")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = switching
                setSwitching(null)
                if (!target) return
                try {
                  await tenancy.setAppModuleActive(target.id, false)
                } catch (err) {
                  toast.error(err instanceof ApiFailure ? err.message : t("Couldn't switch that module off."))
                }
              }}
            >
              {t("Switch it off")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
