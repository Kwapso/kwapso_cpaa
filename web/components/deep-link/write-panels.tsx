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
import { KnowledgeUploadDialog } from "@/components/knowledge-upload-dialog"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { RolePickerDialog } from "@/components/role-picker-dialog"
import { RoleFormDialog } from "@/components/role-form-dialog"
import { InviteDialog } from "@/components/invite-dialog"
import { TeamEditDialog } from "@/components/team-edit-dialog"
import { ConfirmAction } from "@/components/deep-link/confirm-action"
import {
  InternalRecordDialog,
  brandAssetFields,
  marketingFields,
  programmeFields,
  purposeFields,
} from "@/components/internal-record-dialog"
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
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import type { InternalKind } from "@/lib/use-screen-actions"
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
  | "membersQ"
  | "accountsQ"
  | "learningCategoryOptions"
  | "contentTypeOptions"
  | "helpTypeOptions"
  // The agency's own housekeeping: the pick-or-create vocabularies its forms
  // offer, and the loaded rows an EDIT panel prefills from.
  | "marketingChannelOptions"
  | "marketingStatusOptions"
  | "brandCategoryOptions"
  | "departmentOptions"
  | "marketingQ"
  | "brandQ"
  | "programmesQ"
  | "purposesQ"
> &
  Pick<
    ReturnType<typeof useScreenActions>,
    | "runAction"
    | "createLearning"
    | "createHelp"
    | "createAccount"
    | "createKnowledge"
    | "uploadKnowledgeFile"
    | "saveInternalRecord"
    | "setInternalActive"
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

/** URL segment → which agency-internal record kind its panels are about. The
 * one place the translation is written down, so the form, the confirm and the
 * writer all agree. */
const INTERNAL_PANELS: Record<string, InternalKind | undefined> = {
  marketing: "marketing",
  brand: "brand",
  delivery: "delivery",
  purposes: "purposes",
}

/** …and the permission module each kind gates on. Two of them share `delivery`,
 * which is the point of that module: one right, two nouns. */
const INTERNAL_MODULE: Record<string, string> = {
  marketing: "marketing",
  brand: "brand_assets",
  delivery: "delivery",
  purposes: "delivery",
}

/** What to call one in a sentence a person reads before archiving it. */
const INTERNAL_NOUN: Record<string, string> = {
  marketing: "post",
  brand: "brand asset",
  delivery: "programme",
  purposes: "meeting purpose",
}

/** A loaded record → the flat string map the form prefills from. Every value is
 * stringified and every null becomes "", because a form field holds a string and
 * `null` in one renders as the word "null". */
function prefill(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])
  )
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
  uploadKnowledgeFile,
  saveInternalRecord,
  setInternalActive,
  marketingChannelOptions,
  marketingStatusOptions,
  brandCategoryOptions,
  departmentOptions,
  marketingQ,
  brandQ,
  programmesQ,
  purposesQ,
  closePanel,
  onRecordGone,
}: WritePanelsProps) {
  const [archiving, setArchiving] = React.useState(false)

  // WHICH agency-internal form the URL is asking for, and everything it needs to
  // open prefilled. Resolved once, here, because "is this panel mine?" and "what
  // does it show?" are the same question asked of four segments — answering it
  // per-dialog is how a create panel and an edit panel end up offering different
  // fields for one record kind.
  const internal = React.useMemo(() => {
    const kind = INTERNAL_PANELS[query.module ?? ""]
    const spec = kind
      ? {
          marketing: {
            fields: marketingFields(marketingChannelOptions, marketingStatusOptions),
            title: "Marketing post",
            subtitle: "Something we published about ourselves. Ours alone — no client ever sees it.",
            submitLabel: "Record it",
            rows: marketingQ.data,
          },
          brand: {
            fields: brandAssetFields(brandCategoryOptions),
            title: "Brand asset",
            subtitle: "A piece of our own brand material — a logo, a deck, a template.",
            submitLabel: "Add it",
            rows: brandQ.data,
          },
          delivery: {
            fields: programmeFields(),
            title: "Delivery programme",
            subtitle: "A way we run an engagement, start to finish.",
            submitLabel: "Add it",
            rows: programmesQ.data,
          },
          purposes: {
            fields: purposeFields(departmentOptions),
            title: "Meeting purpose",
            subtitle: "Why we meet, and the department it belongs to.",
            submitLabel: "Add it",
            rows: purposesQ.data,
          },
        }[kind]
      : null
    const editing = query.panel === "edit" && !!query.id
    const row = editing ? (spec?.rows as { id: string }[] | undefined)?.find((r) => r.id === query.id) : undefined
    return {
      kind,
      open:
        !!kind &&
        (query.panel === "add" || editing) &&
        can(INTERNAL_MODULE[kind], editing ? "edit" : "create"),
      fields: spec?.fields ?? [],
      title: spec?.title ?? "",
      subtitle: spec?.subtitle ?? "",
      submitLabel: spec?.submitLabel ?? "Save",
      // The dialog's own draft rule (R7) is keyed per record, so an edit prefills
      // from the loaded row and a create starts blank.
      initial: row ? (prefill(row) as Record<string, string>) : undefined,
    }
  }, [
    query.module, query.panel, query.id, can,
    marketingChannelOptions, marketingStatusOptions, brandCategoryOptions, departmentOptions,
    marketingQ.data, brandQ.data, programmesQ.data, purposesQ.data,
  ])

  const internalArchive = React.useMemo(() => {
    const kind = INTERNAL_PANELS[(query.confirm ?? "").replace(/\.archive$/, "")]
    return {
      kind,
      open: !!kind && query.confirm === `${kind}.archive` && !!query.id && can(INTERNAL_MODULE[kind], "delete"),
      title: `Archive this ${INTERNAL_NOUN[kind ?? "marketing"]}?`,
    }
  }, [query.confirm, query.id, can])

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

      {/* Upload a FILE into the knowledge base (?panel=upload&module=knowledge)
          — gated by the same create right, because it makes the same kind of
          record by another road. Its own panel name rather than a flag on the
          one above: the two forms ask different first questions ("what should
          the assistant know?" versus "which file?"), and a deep link should be
          able to say which one it means. */}
      <KnowledgeUploadDialog
        open={query.panel === "add" && query.module === "knowledge-file" && can("knowledge", "create")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `knowledge:upload:${teamId}` : undefined}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        onSubmit={uploadKnowledgeFile}
      />

      {/* Edit the team (?panel=edit&module=team) — gated by teams:edit. */}
      <TeamEditDialog
        open={query.panel === "edit" && query.module === "team" && can("teams", "edit")}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={teamId ? `team:edit:${teamId}` : undefined}
        team={active.ctx?.team ?? null}
        onSaved={active.refresh}
      />

      {/* THE AGENCY'S OWN HOUSEKEEPING — one dialog, four record kinds, opened
          either as `?panel=add&module=<segment>` or `?panel=edit&module=<segment>&id`.
          Every one is gated by the right its action needs, so a deep link can
          never reach a form the screen itself would have hidden. */}
      <InternalRecordDialog
        open={internal.open}
        onOpenChange={(o) => !o && closePanel()}
        draftKey={
          teamId && internal.kind ? `${internal.kind}:${query.id ?? "new"}:${teamId}` : undefined
        }
        fields={internal.fields}
        title={internal.title}
        subtitle={internal.subtitle}
        submitLabel={query.id ? "Save changes" : internal.submitLabel}
        initial={internal.initial}
        onSubmit={(values) =>
          saveInternalRecord(internal.kind as InternalKind, values, query.id || undefined)
        }
      />

      {/* Archive one of them (?confirm=<segment>.archive&id) — gated by delete.
          Its own AlertDialog rather than ConfirmAction's, which is built around
          the two member/invite cases and their wording. */}
      <AlertDialog
        open={internalArchive.open}
        onOpenChange={(o) => !archiving && !o && closePanel()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{internalArchive.title}</AlertDialogTitle>
            <AlertDialogDescription>
              It stops showing as live and nothing is deleted — its history stays, and you can put
              it back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                setArchiving(true)
                void setInternalActive(internalArchive.kind as InternalKind, query.id ?? "", false)
                  .then(onRecordGone)
                  .catch((err: unknown) => {
                    if (!(err instanceof ApiFailure)) reportError("deep-link:archive", err)
                    toast.error(
                      err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
                    )
                  })
                  .finally(() => setArchiving(false))
              }}
              disabled={archiving}
            >
              {archiving ? <Spinner /> : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
