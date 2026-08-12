"use client"

// THE COLLECTION HALF of the deep-link host's module-render switch — a module's
// LIST screen, for a route that names no record. Its sibling half (the record
// details) stays in module-content.tsx beside it.
//
// The switch was one 486-line function with fifteen `module === "…"` branches in
// two groups, and it grows by a branch every time a module ships. A collection
// and a record detail are two questions; they are now two files. Nothing had to
// be re-threaded to do it: both halves take the SAME ModuleContentCtx the host
// already builds, so the seam is where the switch always was.
//
// Pure, like the whole switch: it takes the bundle and returns a node. No state,
// no effects — those stay in deep-link-screen.tsx, which owns them.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  ScreenRenderer,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"

import { LearningProgressScreen } from "@/components/learning-progress"
import { ProcessesScreen } from "@/components/processes-screen"
import { NotFound, LoadError, SectionWithCreate, CollectionCard } from "@/components/deep-link/screen-bits"
import { CollectionHeading } from "@/components/collection-heading"
import { LoadMore } from "@/components/load-more"
import { content as contentApi, tenancy } from "@/lib/api"
import { accountsKey, helpKey, knowledgeKey } from "@/lib/live-resources"
import { CountedAbove } from "@/components/counted-tabs"
import { formatCount } from "@shared/web/format-count"
import {
  shapeAccountsList,
  shapeHelpList,
  shapeInvitesList,
  shapeKnowledgeList,
  shapeLearningList,
  shapeMembersList,
  shapeRolesList,
} from "@/components/deep-link/shape"
import {
  resolveRecipe,
  withDataDrivenCollection,
} from "@/lib/screens"
import type { ModuleContentCtx } from "./module-content"

/** The list screen for `module`, or the honest refusal/empty state. */
export function renderCollection(ctx: ModuleContentCtx): React.ReactNode {
  const {
    module,
    teamId,
    can,
    go,
    overridesQ,
    membersQ,
    rolesQ,
    roles,
    invitesQ,
    learningQ,
    helpQ,
    accountsQ,
    knowledgeQ,
    totals,
    rights,
    onAction,
    onIntent,
    sectionPath,
    helpScope,
    helpMineQ,
    setHelpScope,
    query,
  } = ctx

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
  if (module === "processes") {
    // The whole screen is host-composed: the VALUE drill-down sits above the
    // list, and a map cannot be created without the apps it might belong to. Its
    // own file, so this switch stays a switch.
    return (
      <ProcessesScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.processes}
        canCreate={can("processes", "create")}
        onAction={onAction}
        onIntent={onIntent}
      />
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
          // Parity, in the direction nobody checks. `export_accounts_csv` has been
          // on the machine surface — and a declared import target — while this
          // screen offered no way to do it: a machine could export the customer
          // book and a person could not. Same rule as its three siblings above:
          // export needs READ, which is implied by seeing the list at all.
          download={{
            show: (data.rows?.length ?? 0) > 0,
            label: "Export CSV",
            href: "/api/tenancy/accounts/export",
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
  if (module === "knowledge") {
    if (knowledgeQ.error) return <LoadError what="the knowledge base" />
    if (knowledgeQ.data === undefined) return <Skeleton variant="list" lines={4} />
    // The account NAMES a source is filed under — the list says "Bergman S.A.",
    // never `account:01J…`. Already loaded for the whole team area on the
    // accounts screen; here it is cache-first and empty until it lands, which
    // the shaping reads as the honest "A client".
    const names = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))
    const data = shapeKnowledgeList(knowledgeQ.data, names)
    const knowledgeRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
    // R16: the count lives in the heading (a sidebar page has no tab strip to
    // badge), and it is the door's exact COUNT(*) — never the loaded page's
    // length, which on a paged list is just "50" forever.
    return (
      <div className="flex flex-col gap-4">
        <CollectionHeading sectionKey="knowledge" total={totals.knowledge} />
        <SectionWithCreate
          show={can("knowledge", "create")}
          label="Add a source"
          icon="plus"
          onCreate={() => go(sectionPath, { panel: "add", module: "knowledge" })}
        >
          <ScreenRenderer recipe={knowledgeRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
        </SectionWithCreate>
        {/* R14: one source per ticket, per article, per account, plus every note
            anybody writes — the list pages. */}
        <LoadMore
          listKey={knowledgeKey(teamId as string)}
          label="Load more sources"
          fetchPage={(c: string) =>
            contentApi.knowledge(c).then((r) => ({ rows: r.sources, nextCursor: r.nextCursor }))
          }
        />
      </div>
    )
  }
  if (module === "tickets") {
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
      <CollectionHeading sectionKey="tickets" total={totals.help} />
      <SectionWithCreate
        show={can("help", "create")}
        label="Raise ticket"
        icon="plus"
        onCreate={() => go(sectionPath, { panel: "add", module: "tickets" })}
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
