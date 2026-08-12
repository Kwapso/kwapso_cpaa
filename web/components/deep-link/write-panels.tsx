"use client"

// The WRITE UI of the deep-link host, in one place. Every form and confirm here is
// opened by the URL (?panel=… / ?confirm=…) so Back closes it and a link to it is
// shareable — and every one is gated by the right its action needs, because a deep
// link must not reach a form the action itself would hide (block at every step, not
// just at submit). The host owns the URL and the mutations; this owns the dialogs.

import * as React from "react"

import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { type ScreenQuery } from "@kwapso/ui/lib/recipe"

import { AccountFormDialog } from "@/components/account-form-dialog"
import { LearningFormDialog } from "@/components/learning-form-dialog"
import { KnowledgeFormDialog } from "@/components/knowledge-form-dialog"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { InviteDialog } from "@/components/invite-dialog"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { ConfirmAction } from "@/components/deep-link/confirm-action"
import { ApiFailure } from "@/lib/api"
import { personName } from "@/lib/identity"
import { type usePermissions } from "@/lib/perms"
import { type useActiveTeam } from "@/lib/use-active-team"
import { type useScreenActions } from "@/lib/use-screen-actions"
import { type useScreenData } from "@/lib/use-screen-data"
import { reportError } from "@shared/web/log"
import type { TeamRole } from "@shared/types"

/** Everything the write layer needs from the host: the URL's ?panel/?confirm, the
 * caller's rights, the lists the pickers offer, and the mutations to run. Taken as
 * ONE bundle (like the render half's ModuleContentCtx) so the host hands over a
 * snapshot rather than threading a dozen loose props. */
export type WritePanelsProps = Pick<
  ReturnType<typeof useScreenData>,
  "membersQ" | "accountsQ" | "learningCategoryOptions" | "contentTypeOptions" | "helpTypeOptions"
> &
  Pick<
    ReturnType<typeof useScreenActions>,
    "runAction" | "createLearning" | "createHelp" | "createAccount" | "createKnowledge"
  > & {
    query: ScreenQuery
    can: ReturnType<typeof usePermissions>["can"]
    teamId: string | null
    /** the roles a picker may offer — retired ones can't be assigned */
    activeRoles: TeamRole[]
    active: ReturnType<typeof useActiveTeam>
    /** close the open panel / confirm (Back, or a clean replace on a deep link) */
    closePanel: () => void
    /** the record is gone — go back to the list it left */
    onRecordGone: () => void
  }

export function WritePanels({
  query,
  can,
  teamId,
  activeRoles,
  active,
  membersQ,
  accountsQ,
  learningCategoryOptions,
  contentTypeOptions,
  helpTypeOptions,
  runAction,
  createLearning,
  createHelp,
  createAccount,
  createKnowledge,
  closePanel,
  onRecordGone,
}: WritePanelsProps) {
  // The change-role target (for the picker), from the URL id.
  const changeTarget =
    query.panel === "edit" && query.module === "members" && query.id
      ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
      : null

  return (
    <>
      {/* Change a member's role (?panel=edit&module=members&id) — gated by edit. */}
      <RolePickerDialog
        open={
          query.panel === "edit" &&
          query.module === "members" &&
          !!query.id &&
          can("team_members", "edit")
        }
        onOpenChange={(o) => !o && closePanel()}
        roles={activeRoles}
        currentRoleId={changeTarget?.roleId ?? null}
        subjectName={changeTarget ? personName(changeTarget) : null}
        onPick={(roleId) => runAction("members.changeRole", { userId: query.id ?? "", roleId })}
      />

      {/* Invite someone (?panel=add&module=invites) — gated by create. */}
      <InviteDialog
        open={query.panel === "add" && query.module === "invites" && can("team_members", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `invite:new:${teamId}` : undefined}
        roles={activeRoles}
        onSubmit={(email, roleId) => runAction("invites.create", { email, roleId })}
      />

      {/* Create a role (?panel=add&module=roles) — gated by create. */}
      <RoleFormDialog
        open={query.panel === "add" && query.module === "roles" && can("member_roles", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `role:new:${teamId}` : undefined}
        onSubmit={(title, description) => runAction("roles.create", { title, description })}
      />

      {/* Add an account (?panel=add&module=accounts) — gated by create. The parent
       * picker offers the accounts already loaded on the list behind it; the
       * statuses are the ones this team already uses, so they stay consistent. */}
      <AccountFormDialog
        open={query.panel === "add" && query.module === "accounts" && can("accounts", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `account:new:${teamId}` : undefined}
        parentOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        statusOptions={[
          ...new Set((accountsQ.data ?? []).map((a) => a.status).filter((s): s is string => !!s)),
        ]}
        onSubmit={createAccount}
      />

      {/* Create a learning article (?panel=add&module=learning) — gated by create. */}
      <LearningFormDialog
        open={query.panel === "add" && query.module === "learning" && can("learning", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `learning:new:${teamId}` : undefined}
        teamId={teamId}
        categoryOptions={learningCategoryOptions}
        contentTypeOptions={contentTypeOptions}
        onSubmit={createLearning}
      />

      {/* Raise a help ticket (?panel=add&module=help) — gated by create. */}
      <HelpFormDialog
        open={query.panel === "add" && query.module === "tickets" && can("help", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `help:new:${teamId}` : undefined}
        teamId={teamId}
        helpTypeOptions={helpTypeOptions}
        onSubmit={createHelp}
      />

      {/* Add a knowledge source (?panel=add&module=knowledge) — gated by create.
          The account picker offers the accounts the caller can already see, so a
          source can only ever be filed under a client they may read. */}
      <KnowledgeFormDialog
        open={query.panel === "add" && query.module === "knowledge" && can("knowledge", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `knowledge:new:${teamId}` : undefined}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        onSubmit={createKnowledge}
      />

      {/* Edit the team (?panel=edit&module=team) — gated by teams:edit. */}
      <TeamEditDialog
        open={query.panel === "edit" && query.module === "team" && can("teams", "edit")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `team:edit:${teamId}` : undefined}
        team={active.ctx?.team ?? null}
        onSaved={active.refresh}
      />

      {/* Destructive confirms (?confirm=members.remove | invites.revoke) — both
       * need team_members:delete, gated so a deep link can't reach them. */}
      <ConfirmAction
        query={query}
        canRun={can("team_members", "delete")}
        memberName={
          query.confirm === "members.remove"
            ? (membersQ.data?.find((m) => m.userId === query.id) ?? null)
            : null
        }
        onCancel={closePanel}
        onConfirm={async () => {
          if (!query.confirm || !query.id) return
          const payload: Record<string, string> =
            query.confirm === "members.remove"
              ? { userId: query.id }
              : { inviteId: query.id }
          try {
            await runAction(query.confirm, payload)
            // The member is gone / the invite changed — return to the list.
            onRecordGone()
          } catch (err) {
            if (!(err instanceof ApiFailure)) reportError("deep-link:confirm", err)
            toast.error(err instanceof ApiFailure ? err.message : "Something went wrong. Try again.")
          }
        }}
      />
    </>
  )
}
