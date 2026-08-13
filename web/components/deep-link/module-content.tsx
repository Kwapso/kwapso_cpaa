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
import { type ScreenQuery, type ScreenRecipe, type ScreenRights } from "@kwapso/ui/lib/recipe"

import { AccountDetailScreen } from "@/components/account-detail"
import { RoleDetailScreen } from "@/components/role-detail"
import { LearningDetailScreen } from "@/components/learning-detail"
import { KnowledgeDetailScreen } from "@/components/knowledge-detail"
import { HelpDetailScreen } from "@/components/help-detail"
import { ProcessDetailScreen } from "@/components/process-detail"
import { AppDetailScreen } from "@/components/app-detail"
import { SprintDetailScreen } from "@/components/sprint-detail"
import { StoryDetailScreen } from "@/components/story-detail"
import { ImportScreen } from "@/components/import-screen"
import { InternalRateCardScreen } from "@/components/internal-rate-card"
import { StaffPanel } from "@/components/staff-panel"
import { SelectableScreen } from "@/components/selectable-screen"
import { NoAccess, NotFound, LoadError } from "@/components/deep-link/screen-bits"
import { LoadMore } from "@/components/load-more"
import { tenancy } from "@/lib/api"
import type { HelpScope } from "@/lib/live-resources"
import {
  shapeBrandDetail,
  shapeInviteDetail,
  shapeMarketingDetail,
  shapeMemberDetail,
  shapeProgrammeDetail,
  shapePurposeDetail,
  shapeTaskDetail,
  shapeTeamDetail,
} from "@/components/deep-link/shape"
import type { ActivityItem } from "@shared/types"
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
import { personName } from "@/lib/identity"
import { renderCollection } from "@/components/deep-link/collection-content"

type ScreenData = ReturnType<typeof useScreenData>

/** Everything the module-render switch needs from the host: the resolved route,
 * the caller's rights, the per-module queries, and the intent/action bridges.
 * The host owns all of it; this bundle is how it hands the render half a snapshot. */
export type ModuleContentCtx = Pick<
  ScreenData,
  | "overridesQ" | "metaQ" | "membersQ" | "rolesQ" | "invitesQ" | "learningQ" | "helpQ" | "helpMineQ" | "helpArchivedQ" | "accountsQ" | "knowledgeQ" | "totals" | "activityQ" | "activityTotal" | "activityKey" | "activityScope" | "inviteAuditQ"
  | "marketingQ" | "brandQ" | "programmesQ" | "purposesQ" | "internalActivity"
  | "storiesQ" | "sprintsQ" | "appsQ" | "tasksQ"
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
  helpScope: HelpScope
  setHelpScope: (v: HelpScope) => void
  myUserId: string | null
  query: ScreenQuery
}

/** The row is whichever record kind a segment holds; each shaper takes its own
 * type, so the four call sites erase it through this one alias rather than four
 * inline casts. */
type InternalShaper = (row: { id: string }, activity: ActivityItem[]) => ReturnType<typeof shapeMarketingDetail>

/** The BODY of an agency-internal record detail, once: find the row in its
 * loaded collection, render it through the engine, and hang the paged history
 * under it. The four branches above each own the two things a law reads off
 * them — which recipe, and that it went through withTabCounts — and share
 * everything that is genuinely identical. */
function internalDetail(
  ctx: ModuleContentCtx,
  recipe: ScreenRecipe,
  spec: {
    what: string
    query: { data: { id: string }[] | undefined; error: unknown }
    shape: InternalShaper
  }
): React.ReactNode {
  if (spec.query.error) return <LoadError what={spec.what} />
  if (spec.query.data === undefined) return <Skeleton variant="list" lines={4} />
  const row = spec.query.data.find((r) => r.id === ctx.recordId) ?? null
  if (!row) return <p className="text-muted-foreground text-sm">That record no longer exists.</p>
  return (
    <div className="flex flex-col gap-4">
      <ScreenRenderer
        recipe={recipe}
        data={spec.shape(row, ctx.internalActivity.rows)}
        rights={ctx.rights}
        onAction={ctx.onAction}
        onIntent={ctx.onIntent}
      />
      {/* R14: the badge above counts the WHOLE history, so the feed under it
          must be able to reach all of it. */}
      <LoadMore
        listKey={ctx.internalActivity.listKey}
        label="Load more activity"
        fetchPage={ctx.internalActivity.fetchPage}
      />
    </div>
  )
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

    // WHAT OUR OWN HOUR COSTS US. A team-wide screen with no record level: the
    // card IS the collection, so it is handled here rather than falling through
    // to the list/detail split below. Its twin — what an ACCOUNT is charged —
    // is a tab on the account's own record and a different file entirely, which
    // is the shape Law R23 is about (internal-rate-card.tsx says why).
    if (module === "internal-rates") return <InternalRateCardScreen teamId={teamId as string} />

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
          {/* THE PERSON BEHIND THE MEMBER ROW — the owner's ruling, literally:
              a profile and the certificates somebody holds go on their own page.
              Gated on `staff_profiles`, so a role without that read right sees
              nothing here and the member page is unchanged. */}
          <StaffPanel teamId={teamId as string} userId={member.userId} memberName={personName(member)} />
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
      return (
        <HelpDetailScreen
          teamId={teamId as string}
          helpId={recordId}
          myUserId={myUserId}
          basePath={sectionPath}
        />
      )
    }
    if (module === "processes") {
      return <ProcessDetailScreen teamId={teamId as string} processId={recordId} />
    }

    // ── THE WORK ENGINE'S RECORDS ────────────────────────────────────────────
    // Three bespoke, one recipe. The app, the sprint and the story each carry a
    // collection tab with its own create action (or, on the story, a status
    // stepper and the time logged against it) — controls no engine block draws.
    // The TASK carries none of that: it is a title, a date and a tick, so its
    // detail is the recipe below with the four housekeeping ones.
    if (module === "apps") {
      return <AppDetailScreen teamId={teamId as string} appId={recordId} basePath={sectionPath} />
    }
    if (module === "sprints") {
      return (
        <SprintDetailScreen teamId={teamId as string} sprintId={recordId} basePath={sectionPath} />
      )
    }
    if (module === "stories") {
      return (
        <StoryDetailScreen teamId={teamId as string} storyId={recordId} basePath={sectionPath} />
      )
    }
    if (module === "tasks") {
      const base = resolveRecipe("tasks.detail", overridesQ.data)
      if (!base) return <NotFound />
      // R8/R16: the Activity tab badges this record's exact history total.
      return internalDetail(ctx, withTabCounts(base, { activity: ctx.internalActivity.total }), {
        what: "the tasks",
        query: ctx.tasksQ,
        shape: shapeTaskDetail as InternalShaper,
      })
    }

    // ── THE AGENCY'S OWN HOUSEKEEPING ────────────────────────────────────────
    // The only four RECORD details in the app that are pure recipes: each one is
    // the record's own fields plus its history, which is exactly the pair of
    // blocks the engine draws. The bespoke details beside them exist because no
    // engine block draws a ticket's conversation or a map's arithmetic; none of
    // these four has that problem, so none of them is a component.
    //
    // The history comes through the GENERIC (table, id) path (R5) — the same
    // hook every bespoke detail uses, resolved once in use-screen-data because a
    // render switch full of early returns cannot call a hook.
    //
    // FOUR BRANCHES, NOT A TABLE, and that is the law's doing rather than a
    // preference. R8's check counts `resolveRecipe("<x>.detail"` literals and
    // demands one `withTabCounts` per rendered detail — a table that resolved
    // its recipe from a variable was invisible to the count, which means the law
    // could no longer see whether these four tabs carried their badge. Code a
    // law cannot read is a law quietly switched off, so the shape it measures is
    // the shape they are written in.
    if (module === "marketing") {
      const base = resolveRecipe("marketing.detail", overridesQ.data)
      if (!base) return <NotFound />
      // R8/R16: the Activity tab badges this record's exact history total.
      return internalDetail(ctx, withTabCounts(base, { activity: ctx.internalActivity.total }), {
        what: "marketing posts",
        query: ctx.marketingQ,
        shape: shapeMarketingDetail as InternalShaper,
      })
    }
    if (module === "brand") {
      const base = resolveRecipe("brand.detail", overridesQ.data)
      if (!base) return <NotFound />
      return internalDetail(ctx, withTabCounts(base, { activity: ctx.internalActivity.total }), {
        what: "the brand library",
        query: ctx.brandQ,
        shape: shapeBrandDetail as InternalShaper,
      })
    }
    if (module === "delivery") {
      const base = resolveRecipe("delivery.detail", overridesQ.data)
      if (!base) return <NotFound />
      return internalDetail(ctx, withTabCounts(base, { activity: ctx.internalActivity.total }), {
        what: "the delivery programmes",
        query: ctx.programmesQ,
        shape: shapeProgrammeDetail as InternalShaper,
      })
    }
    if (module === "purposes") {
      const base = resolveRecipe("purposes.detail", overridesQ.data)
      if (!base) return <NotFound />
      return internalDetail(ctx, withTabCounts(base, { activity: ctx.internalActivity.total }), {
        what: "the meeting purposes",
        query: ctx.purposesQ,
        shape: shapePurposeDetail as InternalShaper,
      })
    }
    return <NotFound />
}
