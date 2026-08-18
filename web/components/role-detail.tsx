"use client"

// Role detail — one role at /t/<teamId>/roles/<id>, with the standard record
// tabs (Law R2): Permissions (the matrix — the main tab), Overview (the audit
// block), Activity (the generic record feed). The matrix has no screen-engine
// block (it's bespoke), so the host composes it from the library
// PermissionMatrix while the roles LIST is engine-driven. Self-contained: it
// fetches the role + its permissions cache-first, owns the draft + Save (with
// the reconciliation guard that survives live pings), Edit details, and
// Deactivate / Activate. Admin = locked (view-only); a read-only viewer sees
// the grid view-only; never deleted — deactivate-only (ARCH §4).

import * as React from "react"

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
import {
  PermissionMatrix,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
} from "@kwapso/ui/registry/collections/permission-matrix/permission-matrix"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Pencil, Power } from "lucide-react"

import type { PermissionValue, RolePermissions, TeamRole } from "@shared/types"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import { RecordFooter, RecordScreen, STICKY_TABS } from "@/components/record-chrome"
import { formatCount } from "@shared/web/format-count"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"

export function RoleDetailScreen({ teamId, roleId }: { teamId: string; roleId: string }) {
  const t = useT()
  const rolesQ = useCached<TeamRole[]>(`member_roles:${teamId}`, () =>
    tenancy.roles().then((r) => r.roles)
  )
  const role = rolesQ.data?.find((r) => r.id === roleId) ?? null

  const { can } = usePermissions(teamId)
  // Edit-details / Save are gated by the SERVER payload (perms.canEdit → canSave);
  // deactivate/activate is the "delete" right in our deactivate-only model.
  const canDeactivate = can("member_roles", "delete")

  const [saving, setSaving] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false)
  const [tab, setTab] = React.useState("permissions")

  // The generic record feed (Law R5): every role action lands here — created,
  // details edited, permissions changed, deactivated — including imported roles.
  // `total` is the door's exact COUNT(*), badged on the tab (R8) through the one
  // formatCount seam (R16) — never the loaded page's length.
  const activity = useRecordActivity("member_roles", roleId)

  // A deactivated role's permissions are frozen + not fetchable (the server 404s
  // it) — only load the matrix for an active role.
  const permsQ = useCached<RolePermissions>(
    role?.active ? `role-perms:${roleId}` : null,
    () => tenancy.rolePermissions(roleId)
  )
  const perms = permsQ.data ?? null

  const [draft, setDraft] = React.useState<PermissionValue | null>(null)
  const serverRef = React.useRef<{ roleId: string; value: PermissionValue } | null>(null)
  React.useEffect(() => {
    if (!perms) return
    const prev = serverRef.current
    const nextJson = JSON.stringify(perms.value)
    // Same role + identical server value → nothing to reconcile. A realtime ping
    // (e.g. our own save) triggers a stale-while-revalidate refetch returning a
    // structurally-identical NEW object; without this bail the effect churns
    // while you're mid-edit.
    if (prev && prev.roleId === roleId && JSON.stringify(prev.value) === nextJson) return
    if (!prev || prev.roleId !== roleId) {
      setDraft(perms.value)
    } else if (JSON.stringify(prev.value) !== nextJson) {
      setDraft((d) =>
        d && JSON.stringify(d) === JSON.stringify(prev.value) ? perms.value : d
      )
    }
    serverRef.current = { roleId, value: perms.value }
  }, [perms, roleId])

  const dirty =
    perms != null && draft != null && JSON.stringify(draft) !== JSON.stringify(perms.value)

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await tenancy.saveRolePermissions(roleId, draft)
      const fresh = await tenancy.rolePermissions(roleId)
      primeCache(`role-perms:${roleId}`, fresh)
      serverRef.current = { roleId, value: fresh.value }
      setDraft(fresh.value)
      toast.success(t("Access rights saved."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save access rights."))
    } finally {
      setSaving(false)
    }
  }

  async function updateDetails(title: string, description: string) {
    const { roles: next } = await tenancy.updateRole(roleId, title, description)
    primeCache(`member_roles:${teamId}`, next)
    toast.success(t("Role updated."))
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { roles: next } = await tenancy.setRoleActive(roleId, activeNext)
      primeCache(`member_roles:${teamId}`, next)
      toast.success(activeNext ? t("Role activated.") : t("Role deactivated."))
      setConfirmDeactivate(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't update the role."))
    } finally {
      setBusyActive(false)
    }
  }

  if (rolesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the role.")}</p>
  if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!role) return <p className="text-muted-foreground text-sm">{t("That role doesn't exist.")}</p>

  const matrixConfig: PermissionMatrixConfig | null = perms && {
    ...defaultPermissionMatrixConfig,
    modules: perms.modules,
    mode: perms.isDefault ? "locked" : perms.canEdit ? "edit" : "read",
    autoFlipRead: true,
    surface: "card",
  }
  const canSave = perms != null && !perms.isDefault && perms.canEdit

  const overviewItems = [
    { label: t("Description"), value: role.description || "—" },
    { label: t("Members with this role"), value: String(role.memberCount) },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]


  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "permissions", label: t("Access rights"), icon: "shield-check", badge: "", badgeVariant: "" as const },
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: t("Activity"),
        icon: "history",
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <RecordScreen
      // D4 + N4: the eyebrow says WHAT THIS IS, and one thing about its state.
      // It used to read `Role · Locked · Inactive` — a type plus two states on
      // one band, which is three units before the title has been read. The two
      // states are mutually exclusive in practice (a locked role is a seeded
      // one and a seeded one is never switched off), so the eyebrow carries
      // whichever applies and never both.
      eyebrow={[t("Role"), role.active ? (role.isDefault ? t("Locked") : null) : t("Inactive")]
        .filter(Boolean)
        .join(" · ")}
      title={role.title}
      status={
        role.description || `${role.memberCount} member${role.memberCount === 1 ? "" : "s"}`
      }
      actions={
        canSave ? (
          <Button variant="outline" onClick={() => setEditingOpen(true)} className="shrink-0 gap-1">
            <Pencil className="size-3.5" />
            {t("Edit details")}
          </Button>
        ) : undefined
      }
    >
      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "overview")
            return <OverviewList items={overviewItems} />
          if (panel.value === "activity")
            return <ActivityPanel activity={activity} />
          // Permissions — the main tab.
          return !role.active ? (
            // Deactivated: permissions frozen (holders keep access); offer reactivate.
            <div className="border-border/60 flex flex-col gap-4 rounded-xl border p-6">
              <p className="text-muted-foreground text-sm">
                {t("This role is deactivated. Members who have it keep their access, but you can't give it to anyone new until you activate it again.")}
              </p>
              {canDeactivate && (
                <Button
                  onClick={() => void setActive(true)}
                  disabled={busyActive}
                  className="w-full gap-1 sm:w-auto sm:self-start"
                >
                  {busyActive ? <Spinner /> : <Power className="size-3.5" />}
                  {busyActive ? t("Activating…") : t("Activate")}
                </Button>
              )}
            </div>
          ) : permsQ.loading || !matrixConfig || !draft ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  {perms?.isDefault
                    ? t("The Admin role has full access and can't be changed.")
                    : canSave
                      ? t("Switch on what this role can do. Turning on Create, Edit or Remove turns on Read too.")
                      : t("You can view what this role can do, but not change it.")}
                </p>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!role.isDefault && canDeactivate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeactivate(true)}
                      disabled={busyActive}
                      className="text-destructive hover:text-destructive gap-1"
                    >
                      <Power className="size-3.5" />
                      {t("Deactivate")}
                    </Button>
                  )}
                  {canSave && (
                    <Button onClick={() => void save()} disabled={!dirty || saving}>
                      {saving ? <Spinner /> : null}
                      {saving ? t("Saving…") : t("Save")}
                    </Button>
                  )}
                </div>
              </div>
              <PermissionMatrix
                config={matrixConfig}
                value={draft}
                onChange={(next) => setDraft(next)}
              />
            </div>
          )
        }}
      />

      <RoleFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        draftKey={`role:edit:${roleId}`}
        initial={{ title: role.title, description: role.description ?? "" }}
        onSubmit={updateDetails}
      />

      <AlertDialog
        open={confirmDeactivate}
        onOpenChange={(o) => !busyActive && setConfirmDeactivate(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Deactivate")} {role.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Members who have it keep their access, but you can't give it to anyone new. You can activate it again later.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyActive}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void setActive(false)
              }}
              disabled={busyActive}
            >
              {busyActive ? <Spinner /> : null}
              {busyActive ? t("Deactivating…") : t("Deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <RecordFooter
        audit={{
          createdByName: role.createdByName,
          createdAt: role.createdAt,
          editedByName: role.editedByName,
          updatedAt: role.updatedAt,
        }}
      />
    </RecordScreen>
  )
}
