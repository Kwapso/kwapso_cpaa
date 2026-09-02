"use client"

// THE CLIENT'S OWN ORGANISATION, on the client's own record — who does the work
// there, what an hour of them costs, and what they run on.
//
// WHY IT SITS ON THE ACCOUNT and not on a screen of its own: a department, a
// role and a tool are only ever read as facts ABOUT one company. A collection of
// every client's roles, side by side, is a list nobody has a question for — and
// it would put one company's wage structure next to another's on one screen,
// which is the shape the portal fence exists to prevent.
//
// THREE LISTS, ONE READ EACH. The doors are bounded (R14) and a company has a
// handful of each, so the panel holds the team's whole set and narrows here —
// the same shape `ModulesPanel` uses, and for the same reason: one cache key
// that a live ping can drop, rather than a key per client that nothing can name.
//
// WHAT IS NOT IN A DIALOG, and why:
//   • a role's DEPARTMENTS are chips on the row, because a role can be in
//     several and the form has no multi-select — and seeing "Operations,
//     Finance" beside the name is the answer to the question anyway;
//   • WHO HOLDS a role is chips too, drawn from the contacts this account
//     already has. There is no separate person record on purpose;
//   • a tool's PRICE has a form of its own, with a DAY on it. Putting it on the
//     tool form would make it a field somebody overwrites, and overwriting it is
//     exactly what stops a map set to March reading March's price.
//
// THE DOORS GATE; THIS ONLY DECIDES WHAT TO DRAW. Everything here sits behind
// `processes:create` / `:edit` / `:delete` — the same rights that let somebody
// map the process, because a role exists to carry the cost that turns that map's
// minutes into money.

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
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Pencil, Power } from "@shared/ui/foundations/icons"

import { AddButton, ToolbarRow } from "@/components/deep-link/screen-bits"
import { CollectionEmptyState } from "@shared/web/screen-engine/collection-frame"

/** THREE BOUNDED LISTS (see the file header), each read whole and narrowed here
 * — the same toolbar shape `selectable-screen.tsx` draws for the team's own
 * dropdown values. "All" is the default status so nothing already on screen
 * disappears the moment the filter exists; a row that is switched off already
 * says so with its own badge rather than by hiding. */
type ActiveFilter = "all" | "active" | "inactive"
function matchesActive(filter: ActiveFilter, active: boolean): boolean {
  return filter === "all" || (filter === "active" ? active : !active)
}

/** A plain search + status toolbar, the search slot of a `<ToolbarRow>`. One
 * function for the three lists below rather than three copies of the same
 * three controls. */
function ListToolbar({
  query,
  onQuery,
  status,
  onStatus,
  placeholder,
  sortOptions,
  sort,
  onSort,
}: {
  query: string
  onQuery: (v: string) => void
  status: ActiveFilter
  onStatus: (v: ActiveFilter) => void
  placeholder: string
  sortOptions: { value: string; label: string }[]
  sort: { by: string; dir: "asc" | "desc" }
  onSort: (next: { by: string; dir: "asc" | "desc" }) => void
}) {
  const t = useT()
  return (
    <>
      <SearchInput
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
        aria-label={placeholder}
      />
      <Select value={status} onValueChange={(v) => onStatus(v as ActiveFilter)}>
        <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t("Filter by status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("All")}</SelectItem>
          <SelectItem value="active">{t("Active")}</SelectItem>
          <SelectItem value="inactive">{t("Switched off")}</SelectItem>
        </SelectContent>
      </Select>
      <SortControl
        options={sortOptions}
        value={sort.by}
        onValueChange={(by) => onSort({ by, dir: "asc" })}
        direction={sort.dir}
        onDirectionChange={(dir) => onSort({ ...sort, dir })}
        label={t("Sort by")}
        hideLabel
      />
    </>
  )
}
import {
  InternalRecordDialog,
  clientDepartmentFields,
  clientRoleFields,
  clientToolFields,
  clientToolPriceFields,
  type InternalRecordValues,
} from "@/components/internal-record-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { clientDepartmentsKey, clientRolesKey, clientToolsKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import type { AccountLink, ClientDepartment, ClientRole, ClientTool } from "@shared/types"
import { useT } from "@shared/web/language"
import { useCached } from "@shared/web/store"

/** Cents → what a person reads. Kept here rather than reaching for a money
 * helper because these are the CLIENT's own numbers in their own currency, and
 * the app's money seam is about what WE charge. */
function money(cents: number | null): string | null {
  if (cents == null) return null
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function failed(e: unknown, fallback: string): string {
  return e instanceof ApiFailure ? e.message : fallback
}

export function ClientOrgPanel({
  teamId,
  accountId,
  contacts,
}: {
  teamId: string
  accountId: string
  /** The people already on this account — the pool a role's holder comes from,
   * handed down rather than re-fetched because the record screen has them. */
  contacts: AccountLink[]
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const canCreate = can("processes", "create")
  const canEdit = can("processes", "edit")
  const canSwitchOff = can("processes", "delete")

  const deptQ = useCached<ClientDepartment[]>(clientDepartmentsKey(teamId), () =>
    tenancy.clientDepartments().then((r) => r.departments)
  )
  const rolesQ = useCached<ClientRole[]>(clientRolesKey(teamId), () =>
    tenancy.clientRoles().then((r) => r.roles)
  )
  const toolsQ = useCached<ClientTool[]>(clientToolsKey(teamId), () =>
    tenancy.clientTools().then((r) => r.tools)
  )

  const departments = React.useMemo(
    () => (deptQ.data ?? []).filter((d) => d.accountId === accountId),
    [deptQ.data, accountId]
  )
  const roles = React.useMemo(
    () => (rolesQ.data ?? []).filter((r) => r.accountId === accountId),
    [rolesQ.data, accountId]
  )
  const tools = React.useMemo(
    () => (toolsQ.data ?? []).filter((x) => x.accountId === accountId),
    [toolsQ.data, accountId]
  )

  const deptName = React.useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  )
  const personName = React.useMemo(
    () => new Map(contacts.map((c) => [c.personAccountId, c.personName])),
    [contacts]
  )

  const [addingDept, setAddingDept] = React.useState(false)
  const [editingDept, setEditingDept] = React.useState<ClientDepartment | null>(null)
  const [addingRole, setAddingRole] = React.useState(false)
  const [editingRole, setEditingRole] = React.useState<ClientRole | null>(null)
  const [addingTool, setAddingTool] = React.useState(false)
  const [editingTool, setEditingTool] = React.useState<ClientTool | null>(null)
  const [pricing, setPricing] = React.useState<ClientTool | null>(null)
  const [switchingOff, setSwitchingOff] =
    React.useState<{ kind: "department" | "role" | "tool"; id: string; name: string } | null>(null)

  // ── THE THREE TOOLBARS — search, status, sort, one set of state per list.
  const [deptQuery, setDeptQuery] = React.useState("")
  const [deptStatus, setDeptStatus] = React.useState<ActiveFilter>("all")
  const [deptSort, setDeptSort] = React.useState<{ by: string; dir: "asc" | "desc" }>({
    by: "name",
    dir: "asc",
  })
  const [roleQuery, setRoleQuery] = React.useState("")
  const [roleStatus, setRoleStatus] = React.useState<ActiveFilter>("all")
  const [roleSort, setRoleSort] = React.useState<{ by: string; dir: "asc" | "desc" }>({
    by: "name",
    dir: "asc",
  })
  const [toolQuery, setToolQuery] = React.useState("")
  const [toolStatus, setToolStatus] = React.useState<ActiveFilter>("all")
  const [toolSort, setToolSort] = React.useState<{ by: string; dir: "asc" | "desc" }>({
    by: "name",
    dir: "asc",
  })

  const shownDepartments = React.useMemo(() => {
    const q = deptQuery.trim().toLowerCase()
    const dirMul = deptSort.dir === "desc" ? -1 : 1
    return departments
      .filter((d) => matchesActive(deptStatus, d.active) && (q === "" || d.name.toLowerCase().includes(q)))
      .sort((a, b) =>
        deptSort.by === "roleCount" ? (a.roleCount - b.roleCount) * dirMul : a.name.localeCompare(b.name) * dirMul
      )
  }, [departments, deptQuery, deptStatus, deptSort])

  const shownRoles = React.useMemo(() => {
    const q = roleQuery.trim().toLowerCase()
    const dirMul = roleSort.dir === "desc" ? -1 : 1
    return roles
      .filter((r) => matchesActive(roleStatus, r.active) && (q === "" || r.name.toLowerCase().includes(q)))
      .sort((a, b) =>
        roleSort.by === "cost"
          ? ((a.centsPerHour ?? -1) - (b.centsPerHour ?? -1)) * dirMul
          : a.name.localeCompare(b.name) * dirMul
      )
  }, [roles, roleQuery, roleStatus, roleSort])

  const shownTools = React.useMemo(() => {
    const q = toolQuery.trim().toLowerCase()
    const dirMul = toolSort.dir === "desc" ? -1 : 1
    return tools
      .filter((x) => matchesActive(toolStatus, x.active) && (q === "" || x.name.toLowerCase().includes(q)))
      .sort((a, b) =>
        toolSort.by === "price" ? ((a.cents ?? -1) - (b.cents ?? -1)) * dirMul : a.name.localeCompare(b.name) * dirMul
      )
  }, [tools, toolQuery, toolStatus, toolSort])

  /** Every write re-reads the list it changed. Cheap (bounded, and one round
   * trip), and it keeps this panel out of the business of guessing what the
   * server did — which is the same reason the live layer patches rather than
   * predicts. */
  const refreshAll = () => {
    deptQ.refresh()
    rolesQ.refresh()
    toolsQ.refresh()
  }

  async function run(work: () => Promise<unknown>, whenItFails: string): Promise<boolean> {
    try {
      await work()
      refreshAll()
      return true
    } catch (e) {
      toast.error(failed(e, whenItFails))
      return false
    }
  }

  /** A role's departments, toggled one chip at a time. The door takes the WHOLE
   * set, so this sends the set it would be after the click — never an add or a
   * remove, because two clicks racing on "add" and "remove" would otherwise
   * leave whichever landed second holding a stale idea of the rest. */
  async function toggleDepartment(role: ClientRole, departmentId: string): Promise<void> {
    const next = role.departmentIds.includes(departmentId)
      ? role.departmentIds.filter((d) => d !== departmentId)
      : [...role.departmentIds, departmentId]
    await run(
      () =>
        tenancy.updateClientRole({
          id: role.id,
          name: role.name,
          centsPerHour: role.centsPerHour,
          departmentIds: next,
        }),
      t("That didn't save. Try again, and tell us if it keeps happening.")
    )
  }

  async function togglePerson(role: ClientRole, personAccountId: string): Promise<void> {
    await run(
      () =>
        tenancy.setClientRolePerson({
          id: role.id,
          personAccountId,
          attached: !role.peopleIds.includes(personAccountId),
        }),
      t("That didn't save. Try again, and tell us if it keeps happening.")
    )
  }

  const loading = (deptQ.loading && !deptQ.data) || (rolesQ.loading && !rolesQ.data)
  const failedToLoad = deptQ.error || rolesQ.error || toolsQ.error

  // A FAILED READ SAYS SO. A skeleton that never resolves is indistinguishable
  // from a screen that is merely slow, and the person waits for something that
  // is never coming.
  if (failedToLoad)
    return (
      <p className="text-destructive text-sm">
        {t("That didn't load. Refresh the page, and tell us if it keeps happening.")}
      </p>
    )
  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-[var(--radius)]" />
        ))}
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      {/* ── departments ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("Departments")}</h3>
        <ToolbarRow
          search={
            departments.length > 0 && (
              <ListToolbar
                query={deptQuery}
                onQuery={setDeptQuery}
                status={deptStatus}
                onStatus={setDeptStatus}
                placeholder={t("Search departments…")}
                sortOptions={[
                  { value: "name", label: t("Name") },
                  { value: "roleCount", label: t("Roles") },
                ]}
                sort={deptSort}
                onSort={setDeptSort}
              />
            )
          }
          actions={canCreate && <AddButton onClick={() => setAddingDept(true)} label={t("Add department")} />}
        />
        {departments.length === 0 ? (
          // No import target — a department is a fact about the client's own
          // org chart, added one at a time as it comes up.
          <CollectionEmptyState
            title={t("No departments yet.")}
            description={t("Add the parts of their company, so a role can say where it sits.")}
            onCreate={canCreate ? () => setAddingDept(true) : undefined}
          />
        ) : shownDepartments.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shownDepartments.map((d) => (
              <li key={d.id} className="bg-surface-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] p-3">
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {d.roleCount === 1 ? t("1 role") : `${d.roleCount} ${t("roles")}`}
                  </p>
                </div>
                {d.active ? null : <Badge variant="secondary">{t("Switched off")}</Badge>}
                {/* ICON-ONLY, on every width now (client ruling, 2026-08-31:
                    "edit, only the pencil icon") — no more `sm:not-sr-only`
                    reveal. */}
                {canEdit ? (
                  <Button variant="ghost" size="icon" onClick={() => setEditingDept(d)} aria-label={t("Edit")}>
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
                {canSwitchOff && d.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    onClick={() => setSwitchingOff({ kind: "department", id: d.id, name: d.name })}
                  >
                    <Power className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── roles ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("Roles")}</h3>
        <ToolbarRow
          search={
            roles.length > 0 && (
              <ListToolbar
                query={roleQuery}
                onQuery={setRoleQuery}
                status={roleStatus}
                onStatus={setRoleStatus}
                placeholder={t("Search roles…")}
                sortOptions={[
                  { value: "name", label: t("Name") },
                  { value: "cost", label: t("Cost an hour") },
                ]}
                sort={roleSort}
                onSort={setRoleSort}
              />
            )
          }
          actions={canCreate && <AddButton onClick={() => setAddingRole(true)} label={t("Add role")} />}
        />
        {roles.length === 0 ? (
          // No import target — a role's cost is set by hand, deliberately
          // (the file's own header: overwriting it from a sheet is exactly
          // what would break an older map's saving).
          <CollectionEmptyState
            title={t("No roles yet.")}
            description={t(
              "A role carries what an hour of it costs them, which is what turns a process map's minutes into money."
            )}
            onCreate={canCreate ? () => setAddingRole(true) : undefined}
          />
        ) : shownRoles.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shownRoles.map((r) => (
              <li key={r.id} className="bg-surface-panel flex flex-col gap-2 rounded-[var(--radius)] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 basis-[12rem]">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {/* WHAT AN UNKNOWN COST LOOKS LIKE, and it is not a zero.
                          The saving reads as incomplete until somebody fills it
                          in, which is the honest state and the one the owner
                          asked for. */}
                      {r.centsPerHour == null
                        ? t("Cost an hour not set yet")
                        : `${money(r.centsPerHour)} ${t("an hour")}`}
                    </p>
                  </div>
                  {r.active ? null : <Badge variant="secondary">{t("Switched off")}</Badge>}
                  {/* ICON-ONLY, on every width now (client ruling, 2026-08-31:
                      "edit, only the pencil icon") — no more `sm:not-sr-only`
                      reveal. */}
                  {canEdit ? (
                    <Button variant="ghost" size="icon" onClick={() => setEditingRole(r)} aria-label={t("Edit")}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : null}
                  {canSwitchOff && r.active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive gap-1"
                      onClick={() => setSwitchingOff({ kind: "role", id: r.id, name: r.name })}
                    >
                      <Power className="size-3.5" aria-hidden />
                      <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                    </Button>
                  ) : null}
                </div>

                {/* THE DEPARTMENTS IT SITS IN — several, on purpose. Clicking a
                    chip toggles it, because a checklist inside a dialog would
                    hide the one thing worth seeing at a glance. */}
                {departments.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {departments.map((d) => {
                      const on = r.departmentIds.includes(d.id)
                      return (
                        <Button
                          key={d.id}
                          type="button"
                          size="sm"
                          variant={on ? "secondary" : "ghost"}
                          disabled={!canEdit}
                          className="h-7 rounded-pill px-3 text-xs"
                          onClick={() => void toggleDepartment(r, d.id)}
                        >
                          {d.name}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}

                {/* WHO HOLDS IT — the contacts this company already has. One
                    person can hold several roles and one role several people. */}
                {contacts.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground mr-1 text-xs">{t("Held by")}</span>
                    {contacts.map((c) => {
                      const on = r.peopleIds.includes(c.personAccountId)
                      return (
                        <Button
                          key={c.personAccountId}
                          type="button"
                          size="sm"
                          variant={on ? "secondary" : "ghost"}
                          disabled={!canEdit}
                          className="h-7 rounded-pill px-3 text-xs"
                          onClick={() => void togglePerson(r, c.personAccountId)}
                        >
                          {c.personName}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}

                {/* A role can name a department that has since been switched off
                    — the chips above only draw the live ones, so this says the
                    rest rather than silently dropping them. */}
                {r.departmentIds.some((d) => !deptName.has(d)) ? (
                  <p className="text-muted-foreground text-xs">
                    {t("Also in a department that has been switched off.")}
                  </p>
                ) : null}
                {r.peopleIds.some((p) => !personName.has(p)) ? (
                  <p className="text-muted-foreground text-xs">
                    {t("Also held by somebody who is no longer a contact here.")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── tools ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("Tools")}</h3>
        <ToolbarRow
          search={
            tools.length > 0 && (
              <ListToolbar
                query={toolQuery}
                onQuery={setToolQuery}
                status={toolStatus}
                onStatus={setToolStatus}
                placeholder={t("Search tools…")}
                sortOptions={[
                  { value: "name", label: t("Name") },
                  { value: "price", label: t("Price") },
                ]}
                sort={toolSort}
                onSort={setToolSort}
              />
            )
          }
          actions={canCreate && <AddButton onClick={() => setAddingTool(true)} label={t("Add tool")} />}
        />
        {tools.length === 0 ? (
          // No import target — a tool's price is set from its own dated form
          // (the file's own header explains why), never bulk-loaded.
          <CollectionEmptyState
            title={t("No tools yet.")}
            description={t("Add what they run on, so a step that replaces one can subtract what it costs.")}
            onCreate={canCreate ? () => setAddingTool(true) : undefined}
          />
        ) : shownTools.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("Nothing here matches that.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shownTools.map((x) => (
              <li key={x.id} className="bg-surface-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] p-3">
                <span aria-hidden className="w-6 shrink-0 text-center text-lg">
                  {x.mark || "·"}
                </span>
                <div className="min-w-0 flex-1 basis-[12rem]">
                  <p className="truncate text-sm font-medium">{x.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {x.cents == null
                      ? t("No price set yet")
                      : `${money(x.cents)} ${x.billingPeriod === "year" ? t("a year") : t("a month")}`}
                  </p>
                </div>
                {x.active ? null : <Badge variant="secondary">{t("Switched off")}</Badge>}
                {canEdit ? (
                  <Button variant="ghost" size="sm" onClick={() => setPricing(x)} className="gap-1">
                    <span>{t("Price")}</span>
                  </Button>
                ) : null}
                {/* ICON-ONLY, on every width now (client ruling, 2026-08-31:
                    "edit, only the pencil icon") — no more `sm:not-sr-only`
                    reveal. */}
                {canEdit ? (
                  <Button variant="ghost" size="icon" onClick={() => setEditingTool(x)} aria-label={t("Edit")}>
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
                {canSwitchOff && x.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    onClick={() => setSwitchingOff({ kind: "tool", id: x.id, name: x.name })}
                  >
                    <Power className="size-3.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">{t("Switch off")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the forms ────────────────────────────────────────────────────── */}

      <InternalRecordDialog
        open={addingDept}
        onOpenChange={setAddingDept}
        fields={clientDepartmentFields()}
        title={t("Add a department")}
        subtitle={t("A part of their company, like Operations or Finance.")}
        draftKey={`client-department-new:${accountId}`}
        onSubmit={async (values: InternalRecordValues) => {
          const ok = await run(
            () =>
              tenancy.createClientDepartment({
                accountId,
                name: String(values.name ?? "").trim(),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setAddingDept(false)
        }}
      />

      <InternalRecordDialog
        open={editingDept !== null}
        onOpenChange={(open) => !open && setEditingDept(null)}
        fields={clientDepartmentFields()}
        title={t("Edit a department")}
        subtitle={t("What this part of their company is called.")}
        draftKey={`client-department:${editingDept?.id ?? ""}`}
        initial={editingDept ? { name: editingDept.name } : undefined}
        onSubmit={async (values: InternalRecordValues) => {
          if (!editingDept) return
          const ok = await run(
            () =>
              tenancy.updateClientDepartment({
                id: editingDept.id,
                name: String(values.name ?? "").trim(),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setEditingDept(null)
        }}
      />

      <InternalRecordDialog
        open={addingRole}
        onOpenChange={setAddingRole}
        fields={clientRoleFields()}
        title={t("Add a role")}
        subtitle={t("A job in their company. Leave the cost empty if nobody knows it yet.")}
        draftKey={`client-role-new:${accountId}`}
        onSubmit={async (values: InternalRecordValues) => {
          const ok = await run(
            () =>
              tenancy.createClientRole({
                accountId,
                name: String(values.name ?? "").trim(),
                centsPerHour: costToCents(values.costPerHour),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setAddingRole(false)
        }}
      />

      <InternalRecordDialog
        open={editingRole !== null}
        onOpenChange={(open) => !open && setEditingRole(null)}
        fields={clientRoleFields()}
        title={t("Edit a role")}
        subtitle={t("The job, and what an hour of it costs them. Leave the cost empty if nobody knows it yet.")}
        draftKey={`client-role:${editingRole?.id ?? ""}`}
        initial={
          editingRole
            ? {
                name: editingRole.name,
                costPerHour:
                  editingRole.centsPerHour == null ? "" : String(editingRole.centsPerHour / 100),
              }
            : undefined
        }
        onSubmit={async (values: InternalRecordValues) => {
          if (!editingRole) return
          const ok = await run(
            () =>
              tenancy.updateClientRole({
                id: editingRole.id,
                name: String(values.name ?? "").trim(),
                centsPerHour: costToCents(values.costPerHour),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setEditingRole(null)
        }}
      />

      <InternalRecordDialog
        open={addingTool}
        onOpenChange={setAddingTool}
        fields={clientToolFields()}
        title={t("Add a tool")}
        subtitle={t("Anything a step uses. Set what it costs afterwards, from the day that price started.")}
        draftKey={`client-tool-new:${accountId}`}
        onSubmit={async (values: InternalRecordValues) => {
          const ok = await run(
            () =>
              tenancy.createClientTool({
                accountId,
                name: String(values.name ?? "").trim(),
                mark: String(values.mark ?? "").trim(),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setAddingTool(false)
        }}
      />

      <InternalRecordDialog
        open={editingTool !== null}
        onOpenChange={(open) => !open && setEditingTool(null)}
        fields={clientToolFields()}
        title={t("Edit a tool")}
        subtitle={t("What they call it. Its price is set separately, from the day that price started.")}
        draftKey={`client-tool:${editingTool?.id ?? ""}`}
        initial={editingTool ? { name: editingTool.name, mark: editingTool.mark ?? "" } : undefined}
        onSubmit={async (values: InternalRecordValues) => {
          if (!editingTool) return
          const ok = await run(
            () =>
              tenancy.updateClientTool({
                id: editingTool.id,
                name: String(values.name ?? "").trim(),
                mark: String(values.mark ?? "").trim(),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setEditingTool(null)
        }}
      />

      {/* A PRICE HAS A DAY ON IT, and that is the whole point of this being its
          own form: setting one for a day that already has a price corrects it,
          and any other day starts a new one — so a map set to March keeps
          reading March's number. */}
      <InternalRecordDialog
        open={pricing !== null}
        onOpenChange={(open) => !open && setPricing(null)}
        fields={clientToolPriceFields()}
        title={t("What this tool costs")}
        subtitle={t("From the day this price started. An older map keeps reading the price that applied then.")}
        draftKey={`client-tool-price:${pricing?.id ?? ""}`}
        initial={
          pricing
            ? {
                amount: pricing.cents == null ? "" : String(pricing.cents / 100),
                billingPeriod: pricing.billingPeriod ?? "month",
                effectiveOn: pricing.effectiveOn ?? new Date().toISOString().slice(0, 10),
              }
            : undefined
        }
        onSubmit={async (values: InternalRecordValues) => {
          if (!pricing) return
          const cents = costToCents(values.amount)
          if (cents == null) {
            toast.error(t("A price needs a number."))
            return
          }
          const ok = await run(
            () =>
              tenancy.setClientToolPrice({
                toolId: pricing.id,
                cents,
                billingPeriod: values.billingPeriod === "year" ? "year" : "month",
                effectiveOn: String(values.effectiveOn ?? "").trim(),
              }),
            t("That didn't save. Try again, and tell us if it keeps happening.")
          )
          if (ok) setPricing(null)
        }}
      />

      <AlertDialog
        open={switchingOff !== null}
        onOpenChange={(open) => !open && setSwitchingOff(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Switch this off?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {/* NOTHING IS DELETED, and saying so is the point: a retired role
                  is still the role a two-year-old map was drawn against. */}
              {t("It stops being offered, and nothing that already refers to it changes. You can bring it back.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep it")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = switchingOff
                if (!target) return
                await run(
                  () =>
                    target.kind === "department"
                      ? tenancy.setClientDepartmentActive(target.id, false)
                      : target.kind === "role"
                        ? tenancy.setClientRoleActive(target.id, false)
                        : tenancy.setClientToolActive(target.id, false),
                  t("That didn't save. Try again, and tell us if it keeps happening.")
                )
                setSwitchingOff(null)
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

/** What somebody typed into a money field, as cents — or null for "they left it
 * empty", which is a real answer here and is not zero. */
function costToCents(raw: string | undefined): number | null {
  const text = String(raw ?? "").trim()
  if (!text) return null
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
