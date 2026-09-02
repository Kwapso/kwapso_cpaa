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

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
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
import {
  PermissionMatrix,
  type PermissionRight,
} from "@shared/ui/components/permission-matrix/permission-matrix"
import { TabsView } from "@shared/web/screen-engine/tabs-view"
import { useRemembered } from "@shared/web/remembered"
import { Pencil, Power } from "@shared/ui/foundations/icons"
import { Badge } from "@shared/ui/components/badge/badge"

import type { PermissionValue, RightSet, RolePermissions, TeamRole } from "@shared/types"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import { RecordScreen, STICKY_TABS, RECORD_TABS_CONFIG } from "@/components/record-chrome"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@shared/web/store"
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
  // The open tab is remembered per record for as long as this document
  // lives (web/lib/nav-memory.ts) — leaving to another section and coming
  // back lands on the tab she was reading, and a miss lands on "permissions".
  const [tab, setTab] = useRemembered("tab", "permissions")

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

  // THE CHROME STAYS, ONLY THE PANEL SPINS (RecordChrome's law 4) — part of
  // the rollout from help-detail (73414c58).
  if (rolesQ.error)
    return (
      <RecordScreen
        title={<Skeleton className="h-7 w-48" />}
        state="error"
        copy={{ errorTitle: t("Couldn't load the role.") }}
        errorAction={
          <Button variant="secondary" onClick={() => invalidate(`member_roles:${teamId}`)}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (rolesQ.data === undefined)
    return <RecordScreen title={<Skeleton className="h-7 w-48" />} state="loading" />
  if (!role)
    return (
      <RecordScreen
        title={t("Role")}
        state="empty"
        copy={{ emptyTitle: t("That role doesn't exist."), emptyDescription: "" }}
      />
    )

  // SERVER ⇄ KIT rights vocabulary. The app's sheet says read/create; the kit
  // says see/create. Three of the four now agree: the kit called the second
  // right `add` until v1.2.24, when it took the word every enforcing surface
  // here already uses (shared/workers/gating.ts's `Right`, the glossary), so
  // `create` maps to itself. `see`/`read` is the one that still differs and
  // deliberately so — the kit's id is the word in front of a reader, and
  // `read` is the word the gate is written in. One mapping here, both
  // directions, so neither side ever learns the other's words.
  const RIGHT_TO_KIT = { read: "see", create: "create", edit: "edit", delete: "delete" } as const
  const KIT_TO_RIGHT: Record<PermissionRight, keyof RightSet> = {
    see: "read",
    create: "create",
    edit: "edit",
    delete: "delete",
  }
  const matrixModules = perms
    ? perms.modules.map((m) => ({
        id: m.key,
        label: m.label,
        locked: perms.isDefault,
        held: {
          [roleId]: (Object.keys(RIGHT_TO_KIT) as (keyof RightSet)[])
            .filter((r) => draft?.[m.key]?.[r])
            .map((r) => RIGHT_TO_KIT[r]),
        },
      }))
    : null
  const canSave = perms != null && !perms.isDefault && perms.canEdit

  const overviewItems = [
    { label: t("Description"), value: role.description || "—" },
    { label: t("Members with this role"), value: String(role.memberCount) },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]


  const tabsConfig = {
    ...RECORD_TABS_CONFIG,
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
      // A DELIBERATE MARK, NEVER AN EMPTY SLOT — the role's own initial in the
      // same square every other record's picture or glyph sits in
      // (shared/web/record-mark.tsx).
      leading={<RecordMark name={role.title} size="band" />}
      // The bare record-type word, glossary's own term (shared/glossary.ts
      // `role`), client ruling 2026-08-31.
      eyebrow={t("Role")}
      // D4 + N4: the chip row says one thing about the role's state, never
      // the type word again — client correction, 2026-08-31, verbatim: "now
      // it also show 'meeting' as a tag! thats not a tg but the eyebrow
      // remember. not only for meetings, but everywhere." This used to also
      // carry `collectionLabel={t("Role")}`, repeating the eyebrow above as a
      // second chip — the same systemic mistake, found here too. It used to
      // read `Role · Role · Locked · Inactive`, which is worse than the
      // `Role · Locked · Inactive` this comment already flagged as three
      // units before the title. The two states are mutually exclusive in
      // practice (a locked role is a seeded one and a seeded one is never
      // switched off), so the row carries whichever applies and never both.
      chips={
        role.active ? (
          role.isDefault ? (
            <Badge>{t("Locked")}</Badge>
          ) : null
        ) : (
          <Badge variant="status" dot="archived">
            {t("Inactive")}
          </Badge>
        )
      }
      title={role.title}
      // THE DESCRIPTION/MEMBER-COUNT LINE IS GONE — CLIENT RULING,
      // 2026-08-31, VERBATIM: "what is this 3rd component in the title under
      // the chips? kill everywhere. chips is the last component of
      // headers!" `status` mapped to `RecordChrome`'s `meta`, drawn directly
      // under the chips row (`data-record-region="header"`). Not lost: both
      // facts are already rows in the Overview tab (`overviewItems`:
      // "Description", "Members with this role").
      actions={
        // ICON-ONLY (client ruling, 2026-08-31: "edit, only the pencil icon").
        canSave ? (
          <Button variant="secondary" size="icon" onClick={() => setEditingOpen(true)} aria-label={t("Edit details")}>
            <Pencil className="size-3.5" />
          </Button>
        ) : undefined
      }
      // D7 / CHECKLIST 11.3 — who made it and when, now the kit's own ink
      // footer's Record column.
      audit={{
        createdByName: role.createdByName,
        createdAt: role.createdAt,
        editedByName: role.editedByName,
        updatedAt: role.updatedAt,
      }}
      activity={activity}
      onAddNote={can("member_roles", "create") ? activity.addNote : undefined}
      notePlaceholder={t("Add a note")}
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
            return (
              <ActivityPanel
                activity={activity}
                onAddNote={can("member_roles", "create") ? activity.addNote : undefined}
                notePlaceholder={t("Add a note")}
              />
            )
          // Permissions — the main tab.
          return !role.active ? (
            // Deactivated: permissions frozen (holders keep access); offer reactivate.
            <div className="bg-surface-panel flex flex-col gap-4 rounded-[var(--radius)] p-6">
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
          ) : permsQ.loading || !matrixModules || !draft ? (
            <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
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
                      variant="secondary"
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
                modules={matrixModules ?? []}
                roles={[{ id: roleId, label: role.title }]}
                disabled={!canSave}
                onChange={(moduleId, _roleId, capabilityId, next) => {
                  const right = KIT_TO_RIGHT[capabilityId as PermissionRight]
                  setDraft((prev) => {
                    const cur = prev?.[moduleId] ?? {
                      read: false,
                      create: false,
                      edit: false,
                      delete: false,
                    }
                    const val = { ...cur, [right]: next }
                    // The old matrix's autoFlipRead, kept as behaviour: granting
                    // any write grants read with it — a right to change a thing
                    // you cannot open is a sheet nobody means.
                    if (next && right !== "read") val.read = true
                    return { ...prev, [moduleId]: val }
                  })
                }}
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
    </RecordScreen>
  )
}
