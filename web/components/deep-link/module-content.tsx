"use client"

// The module-render switch for the deep-link host — "given the fully-resolved
// route, rights and per-module data, render the right screen". Extracted from
// deep-link-screen.tsx (which stays the routing + state + effects + dialogs
// host) so each half reads on its own. Pure: it takes ONE context bundle the
// host builds and returns the screen node; it holds no state of its own.
//
// This file is the DISPATCHER plus the RECORD-DETAIL half: the guards every
// module passes through, the two modules with no permission key of their own
// (import, dropdowns), the team overview, and each `/<module>/<id>` detail. The
// COLLECTION half lives in collection-content.tsx beside it — one switch of
// fifteen branches was two questions wearing one function, and it grew by a
// branch every time a module shipped. Both halves take the same
// ModuleContentCtx, so the split re-threaded nothing.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import { type ScreenQuery, type ScreenRights } from "@kwapso/ui/lib/recipe"

import { AccountDetailScreen } from "@/components/account-detail"
import { RoleDetailScreen } from "@/components/role-detail"
import { LearningDetailScreen } from "@/components/learning-detail"
import { KnowledgeDetailScreen } from "@/components/knowledge-detail"
import { HelpDetailScreen } from "@/components/help-detail"
import { ImportScreen } from "@/components/import-screen"
import { SelectableScreen } from "@/components/selectable-screen"
import { NoAccess, NotFound, LoadError } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { tenancy } from "@/lib/api"
import {
  shapeInviteDetail,
  shapeMemberDetail,
  shapeTeamDetail,
} from "@/components/deep-link/shape"
import type { useScreenData } from "@/lib/use-screen-data"
import type { usePermissions } from "@/lib/perms"
import type { useActiveTeam } from "@/lib/use-active-team"
import {
  MODULE_PERMISSION,
  resolveRecipe,
  withoutActions,
  withTabCounts,
} from "@/lib/screens"
import type { TeamRole } from "@shared/types"
import { renderCollection } from "@/components/deep-link/collection-content"

type ScreenData = ReturnType<typeof useScreenData>

/** Everything the module-render switch needs from the host: the resolved route,
 * the caller's rights, the per-module queries, and the intent/action bridges.
 * The host owns all of it; this bundle is how it hands the render half a snapshot. */
export type ModuleContentCtx = Pick<
  ScreenData,
  | "overridesQ" | "metaQ" | "membersQ" | "rolesQ" | "invitesQ" | "learningQ" | "helpQ" | "helpMineQ" | "accountsQ" | "knowledgeQ" | "totals" | "activityQ" | "activityTotal" | "activityKey" | "activityScope" | "inviteAuditQ"
> & {
  noAccess: boolean
  enabled: boolean
  perms: ReturnType<typeof usePermissions>["perms"]
  can: ReturnType<typeof usePermissions>["can"]
  module: string | null
  recordId: string | null
  teamId: string | null
  canImport: boolean
  go: (path: string, q?: ScreenQuery) => void
  roles: TeamRole[]
  teamName: string
  active: ReturnType<typeof useActiveTeam>
  rights: ScreenRights
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
  sectionPath: string
  helpScope: "mine" | "all"
  setHelpScope: (v: "mine" | "all") => void
  myUserId: string | null
  query: ScreenQuery
}

export function renderModuleContent(ctx: ModuleContentCtx): React.ReactNode {
  const {
    noAccess,
    enabled,
    perms,
    module,
    recordId,
    teamId,
    canImport,
    can,
    go,
    overridesQ,
    metaQ,
    membersQ,
    invitesQ,
    activityQ,
    activityTotal,
    activityKey,
    activityScope,
    inviteAuditQ,
    teamName,
    active,
    rights,
    onAction,
    onIntent,
    sectionPath,
    myUserId,
  } = ctx

    if (noAccess) return <NoAccess />
    if (!enabled) return <Skeleton variant="list" lines={4} />
    if (perms === undefined) return <Skeleton variant="list" lines={4} />

    // Import — no permission KEY of its own (gated per-target). Handle it before
    // the MODULE_PERMISSION lookup, which would otherwise NotFound it.
    if (module === "import") {
      if (!canImport) return <NoAccess />
      return <ImportScreen teamId={teamId as string} initialTarget={recordId || undefined} />
    }

    if (module === "dropdowns") {
      if (!can("selectable_data", "read")) return <NoAccess />
      return (
        <SelectableScreen
          teamId={teamId as string}
          onImport={() => go(`/t/${teamId}/import/selectable_data`)}
        />
      )
    }

    const permKey = module ? MODULE_PERMISSION[module] : undefined
    if (!permKey) return <NotFound />
    if (!can(permKey, "read")) return <NoAccess />

    // Team overview ----------------------------------------------------------
    if (module === "team") {
      const base = resolveRecipe("team.detail", overridesQ.data)
      if (!base) return <NotFound />
      if (metaQ.data === undefined) return <Skeleton variant="list" lines={3} />
      // R8: the Activity tab badges the feed's EXACT server total (R16's seam),
      // not the loaded page — this feed is the one that pages below.
      const recipe = withTabCounts(base, { activity: activityTotal })
      const data = shapeTeamDetail({
        teamId: teamId as string,
        name: teamName,
        logoUrl: active.ctx?.team?.logoUrl ?? null,
        meta: metaQ.data,
        activity: activityQ.data ?? [],
      })
      return (
        <div className="flex flex-col gap-4">
          <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          {/* R14: the team feed is the fastest-growing collection in the base —
              every mutation writes a row — so it pages instead of stopping at 50. */}
          <LoadMore
            listKey={`activity:team:${teamId}`}
            label="Load more activity"
            fetchPage={(c: string) =>
              tenancy.activity("team", undefined, c).then((r) => ({ rows: r.activity, nextCursor: r.nextCursor }))
            }
          />
        </div>
      )
    }

    // Lists — the collection half, next door. Same ctx bundle, so the seam
    // costs nothing to cross; what it buys is two files you can hold in your
    // head instead of one switch with fifteen branches in it.
    if (!recordId) return renderCollection(ctx)

    // Details ----------------------------------------------------------------
    // R14: a member's / an invite's history is the same ever-growing feed, sliced
    // — and the Activity tab badges its EXACT total (R16), so the feed under the
    // badge must be able to reach the rest of it. The recipe renders the tabs, so
    // this sits below the screen (like the team feed above); it disappears on its
    // own when there is no next page. Same key the detail's page one primed.
    const activityMore = (
      <LoadMore
        listKey={activityKey as string}
        label="Load more activity"
        fetchPage={(c: string) =>
          tenancy
            .activity(activityScope ?? "team", recordId ?? undefined, c)
            .then((r) => ({ rows: r.activity, nextCursor: r.nextCursor }))
        }
      />
    )
    if (module === "members") {
      if (membersQ.error) return <LoadError what="members" />
      if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />
      const member = membersQ.data.find((m) => m.userId === recordId) ?? null
      if (!member) return <p className="text-muted-foreground text-sm">That member isn&apos;t on this team.</p>
      const base = resolveRecipe("members.detail", overridesQ.data)
      if (!base) return <NotFound />
      // R8/R16: the Activity tab badges this member's exact history total.
      let recipe = withTabCounts(base, { activity: activityTotal })
      // You can't change your own role or remove yourself here.
      if (member.isYou) recipe = withoutActions(recipe, ["members.changeRole", "members.remove"])
      const data = shapeMemberDetail(member, activityQ.data ?? [])
      return (
        <div className="flex flex-col gap-4">
          <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          {activityMore}
        </div>
      )
    }
    if (module === "invites") {
      if (invitesQ.error) return <LoadError what="invites" />
      if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
      const invite = invitesQ.data.find((i) => i.id === recordId) ?? null
      if (!invite) return <p className="text-muted-foreground text-sm">That invite no longer exists.</p>
      const base = resolveRecipe("invites.detail", overridesQ.data)
      if (!base) return <NotFound />
      // R8/R16: the Activity tab badges this invite's exact history total.
      let recipe = withTabCounts(base, { activity: activityTotal })
      // Revoke only makes sense while the invite is still pending.
      if (invite.status !== "pending") recipe = withoutActions(recipe, ["invites.revoke"])
      const data = shapeInviteDetail(invite, inviteAuditQ.data ?? null, activityQ.data ?? [])
      return (
        <div className="flex flex-col gap-4">
          <ScreenRenderer recipe={recipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          {activityMore}
        </div>
      )
    }
    if (module === "accounts") {
      return (
        <AccountDetailScreen
          teamId={teamId as string}
          accountId={recordId}
          basePath={sectionPath}
        />
      )
    }
    if (module === "roles") {
      return <RoleDetailScreen teamId={teamId as string} roleId={recordId} />
    }
    if (module === "learning") {
      return <LearningDetailScreen teamId={teamId as string} learningId={recordId} />
    }
    if (module === "knowledge") {
      return <KnowledgeDetailScreen teamId={teamId as string} sourceId={recordId} />
    }
    if (module === "tickets") {
      return <HelpDetailScreen teamId={teamId as string} helpId={recordId} myUserId={myUserId} />
    }
    return <NotFound />
}
