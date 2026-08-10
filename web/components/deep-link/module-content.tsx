"use client"

// The module-render switch for the deep-link host — "given the fully-resolved
// route, rights and per-module data, render the right screen". Extracted from
// deep-link-screen.tsx (which stays the routing + state + effects + dialogs
// host) so each half reads on its own. Pure: it takes ONE context bundle the
// host builds and returns the screen node; it holds no state of its own.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import { type ScreenQuery, type ScreenRights } from "@kwapso/ui/lib/recipe"

import { AccountDetailScreen } from "@/components/account-detail"
import { RoleDetailScreen } from "@/components/role-detail"
import { LearningDetailScreen } from "@/components/learning-detail"
import { LearningProgressScreen } from "@/components/learning-progress"
import { HelpDetailScreen } from "@/components/help-detail"
import { ImportScreen } from "@/components/import-screen"
import { SelectableScreen } from "@/components/selectable-screen"
import { NoAccess, NotFound, LoadError, SectionWithCreate, CollectionCard } from "@/components/deep-link/screen-bits"
import { CollectionHeading } from "@/components/collection-heading"
import { LoadMore } from "@/components/load-more"
import { content as contentApi, tenancy } from "@/lib/api"
import { accountsKey, helpKey } from "@/lib/live-resources"
import { CountedAbove } from "@/components/counted-tabs"
import { formatCount } from "@shared/web/format-count"
import {
  shapeAccountsList,
  shapeHelpList,
  shapeInviteDetail,
  shapeInvitesList,
  shapeLearningList,
  shapeMemberDetail,
  shapeMembersList,
  shapeRolesList,
  shapeTeamDetail,
} from "@/components/deep-link/shape"
import type { useScreenData } from "@/lib/use-screen-data"
import type { usePermissions } from "@/lib/perms"
import type { useActiveTeam } from "@/lib/use-active-team"
import {
  MODULE_PERMISSION,
  resolveRecipe,
  withDataDrivenCollection,
  withoutActions,
  withTabCounts,
} from "@/lib/screens"
import type { TeamRole } from "@shared/types"

type ScreenData = ReturnType<typeof useScreenData>

/** Everything the module-render switch needs from the host: the resolved route,
 * the caller's rights, the per-module queries, and the intent/action bridges.
 * The host owns all of it; this bundle is how it hands the render half a snapshot. */
export type ModuleContentCtx = Pick<
  ScreenData,
  | "overridesQ" | "metaQ" | "membersQ" | "rolesQ" | "invitesQ" | "learningQ" | "helpQ" | "helpMineQ" | "accountsQ" | "totals" | "activityQ" | "activityTotal" | "activityKey" | "activityScope" | "inviteAuditQ"
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
    rolesQ,
    roles,
    invitesQ,
    learningQ,
    helpQ,
    accountsQ,
    totals,
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
    helpScope,
    helpMineQ,
    setHelpScope,
    myUserId,
    query,
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

    // Lists ------------------------------------------------------------------
    if (!recordId) {
      const recipe = resolveRecipe(`${module}.list`, overridesQ.data)
      if (!recipe) return <NotFound />
      if (module === "members") {
        if (membersQ.error) return <LoadError what="members" />
        if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeMembersList(membersQ.data)
        const membersRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <CollectionCard>
            <ScreenRenderer recipe={membersRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </CollectionCard>
        )
      }
      if (module === "roles") {
        if (rolesQ.error) return <LoadError what="roles" />
        if (rolesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeRolesList(roles)
        const rolesRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <SectionWithCreate
            show={can("member_roles", "create")}
            label="New role"
            icon="plus"
            secondary={{
              show: can("member_roles", "create"),
              label: "Import CSV",
              onClick: () => go(`/t/${teamId}/import/member_roles`),
            }}
            download={{
              show: (data.rows?.length ?? 0) > 0, // export needs READ — implied by seeing this list
              label: "Export CSV",
              href: "/api/tenancy/roles/export",
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "roles" })}
          >
            <ScreenRenderer recipe={rolesRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "invites") {
        if (invitesQ.error) return <LoadError what="invites" />
        if (invitesQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeInvitesList(invitesQ.data)
        const invitesRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        return (
          <SectionWithCreate
            show={can("team_members", "create")}
            label="Invite"
            icon="mail"
            onCreate={() => go(sectionPath, { panel: "add", module: "invites" })}
          >
            <ScreenRenderer recipe={invitesRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
      }
      if (module === "learning") {
        if (learningQ.error) return <LoadError what="learning" />
        if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeLearningList(learningQ.data)
        const learningRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        const articlesPanel = (
          <SectionWithCreate
            show={can("learning", "create")}
            label="New article"
            icon="plus"
            secondary={{
              show: can("learning", "create"),
              label: "Import CSV",
              onClick: () => go(`/t/${teamId}/import/learning`),
            }}
            download={{
              show: (data.rows?.length ?? 0) > 0, // export needs READ — implied by seeing this list
              label: "Export CSV",
              href: "/api/content/learning/export",
            }}
            onCreate={() => go(sectionPath, { panel: "add", module: "learning" })}
          >
            <ScreenRenderer recipe={learningRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
        )
        // R16: the badge is the exact server total through the ONE seam — never
        // rows.length (a capped list's length is a ceiling, not a total).
        const learningBadge = formatCount(totals.learning)
        // Articles / Team progress as a REAL tab strip (library TabsView, URL-driven
        // via ?tab so Back works). The completion grid is for curators (learning:edit).
        // NON-curators see no strip — so the count lives in the CollectionHeading
        // instead (R16: a count must never depend on an unrelated permission; it
        // used to vanish for anyone without the edit right, because the strip
        // carrying it was the curator's).
        if (!can("learning", "edit"))
          return (
            <div className="flex flex-col gap-4">
              <CollectionHeading sectionKey="learning" total={totals.learning} />
              {articlesPanel}
            </div>
          )
        const learnTab = query.tab === "progress" ? "progress" : "articles"
        const learnTabsConfig = {
          ...defaultTabsConfig,
          variant: "line" as const,
          tabs: [
            {
              value: "articles",
              label: "Articles",
              icon: "book-open",
              badge: learningBadge,
              badgeVariant: "" as const,
            },
            { value: "progress", label: "Team progress", icon: "users", badge: "", badgeVariant: "" as const },
          ],
        }
        // ARBITRATION (R16 iii): the counted strip is the heading's SIBLING here,
        // so CountedAbove marks it — the badged tab WINS, the heading stands down.
        return (
          <CountedAbove active={learningBadge !== ""}>
            <div className="flex flex-col gap-4">
              <CollectionHeading sectionKey="learning" total={totals.learning} />
              <TabsView
                config={learnTabsConfig}
                value={learnTab}
                onValueChange={(v) => go(sectionPath, v === "progress" ? { tab: "progress" } : {})}
                renderPanel={(t) =>
                  t.value === "progress" ? <LearningProgressScreen teamId={teamId as string} /> : articlesPanel
                }
              />
            </div>
          </CountedAbove>
        )
      }
      if (module === "accounts") {
        if (accountsQ.error) return <LoadError what="accounts" />
        if (accountsQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeAccountsList(accountsQ.data)
        const accountsRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        // R16: the count lives in the heading (a sidebar page has no tab strip to
        // badge), and it is the door's exact COUNT(*) — never the loaded page's
        // length, which on a paged list is just "50" forever.
        return (
          <div className="flex flex-col gap-4">
            <CollectionHeading sectionKey="accounts" total={totals.accounts} />
            <SectionWithCreate
              show={can("accounts", "create")}
              label="New account"
              icon="plus"
              secondary={{
                show: can("accounts", "create"),
                label: "Import CSV",
                onClick: () => go(`/t/${teamId}/import/accounts`),
              }}
              onCreate={() => go(sectionPath, { panel: "add", module: "accounts" })}
            >
              <ScreenRenderer recipe={accountsRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
            </SectionWithCreate>
            {/* R14: every company AND every person is a row here — the list pages. */}
            <LoadMore
              listKey={accountsKey(teamId as string)}
              label="Load more accounts"
              fetchPage={(c: string) =>
                tenancy.accounts({ cursor: c }).then((r) => ({ rows: r.accounts, nextCursor: r.nextCursor }))
              }
            />
          </div>
        )
      }
      if (module === "help") {
        // R14: My/All is a SERVER scope, each its own paged cache — filtering a
        // loaded PAGE by raiser would disagree with the exact badge above it.
        const scopedQ = helpScope === "mine" ? helpMineQ : helpQ
        if (scopedQ.error) return <LoadError what="tickets" />
        if (scopedQ.data === undefined) return <Skeleton variant="list" lines={4} />
        const data = shapeHelpList(scopedQ.data)
        const helpRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
        // R16: both scope badges are exact server totals (All + My come back from
        // the door's one COUNT read) through the ONE seam — never a filter's length.
        const helpBadge = formatCount(totals.help)
        return (
          <CountedAbove active={helpBadge !== ""}>
          <div className="flex flex-col gap-4">
          <CollectionHeading sectionKey="help" total={totals.help} />
          <SectionWithCreate
            show={can("help", "create")}
            label="Raise ticket"
            icon="plus"
            onCreate={() => go(sectionPath, { panel: "add", module: "help" })}
            // The My/All raiser strip sits ABOVE the boxed list — it scopes which
            // tickets the collection card shows, so it isn't part of that unit.
            aboveCard={
              <TabsView
                config={{
                  ...defaultTabsConfig,
                  variant: "line",
                  tabs: [
                    {
                      value: "all",
                      label: "All tickets",
                      icon: "inbox",
                      badge: helpBadge,
                      badgeVariant: "",
                    },
                    {
                      value: "mine",
                      label: "My tickets",
                      icon: "user",
                      badge: formatCount(totals.helpMine),
                      badgeVariant: "",
                    },
                  ],
                }}
                value={helpScope}
                onValueChange={(v) => setHelpScope(v as "mine" | "all")}
              />
            }
          >
            <ScreenRenderer recipe={helpRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
          </SectionWithCreate>
          <LoadMore
            listKey={helpKey(teamId as string, helpScope)}
            label="Load more tickets"
            fetchPage={(c: string) => contentApi.help(helpScope, c).then((r) => ({ rows: r.tickets, nextCursor: r.nextCursor }))}
          />
          </div>
          </CountedAbove>
        )
      }
      return <NotFound />
    }

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
    if (module === "help") {
      return <HelpDetailScreen teamId={teamId as string} helpId={recordId} myUserId={myUserId} />
    }
    return <NotFound />
}
