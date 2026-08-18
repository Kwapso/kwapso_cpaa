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

import { ProcessesScreen } from "@/components/processes-screen"
import { AppsScreen } from "@/components/apps-screen"
import { SprintsScreen } from "@/components/sprints-screen"
import { StoriesScreen } from "@/components/stories-screen"
import { TasksScreen } from "@/components/tasks-screen"
import { TimeScreen } from "@/components/time-screen"
import { MeetingsScreen } from "@/components/meetings-screen"
import { TicketsCollection } from "@/components/tickets-collection"
import {
  BrandLibraryScreen,
  PurposesScreen,
} from "@/components/internal-screens"
import { NotFound, LoadError, SectionWithCreate, CollectionCard } from "@/components/deep-link/screen-bits"
import { CollectionHeading } from "@/components/collection-heading"
import { KnowledgeAsk } from "@/components/knowledge-ask"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { content as contentApi, tenancy } from "@/lib/api"
import { accountsKey, knowledgeKey } from "@/lib/live-resources"
import { invalidate } from "@shared/web/store"
import { GoogleSyncButton } from "@/components/google-sync"
import { CountedAbove } from "@/components/counted-tabs"
import { formatCount } from "@shared/web/format-count"
import {
  accountStatus,
  shapeAccountsList,
  shapeInvitesList,
  shapeKnowledgeList,
  shapeMembersList,
  shapeRolesList,
} from "@/components/deep-link/shape"
import {
  resolveRecipe,
  withDataDrivenCollection,
} from "@/lib/screens"
import type { Account, KnowledgeSource } from "@shared/types"
import type { ModuleContentCtx } from "./module-content"

/** The list screen for `module`, or the honest refusal/empty state. */
export function renderCollection(ctx: ModuleContentCtx): React.ReactNode {
  const {
    t,
    module,
    teamId,
    can,
    go,
    overridesQ,
    membersQ,
    rolesQ,
    roles,
    invitesQ,
    accountsQ,
    knowledgeQ,
    brandQ,
    purposesQ,
    totals,
    rights,
    onAction,
    onIntent,
    sectionPath,
    helpScope,
  } = ctx

  // TIME — the one collection with NO recipe, so it is answered before the
  // recipe guard below rather than after it.
  //
  // Its rows are a list whose only controls are a correction dialog and a
  // three-answer prompt, which is a screen the engine has no block for — the
  // same reason the story detail is host-composed. Everything under this line
  // has a `<module>.list` recipe and dies without one, so a host-only collection
  // placed among them resolves to NotFound: the section is in every registry,
  // the rail links to it, and the page 404s. (It did, for one commit.)
  if (module === "time") {
    if (ctx.workLogsQ.error) return <LoadError what="the time" />
    return (
      <TimeScreen
        teamId={teamId as string}
        total={totals.workLogs}
        canCreate={can("work", "create")}
        canEdit={can("work", "edit")}
      />
    )
  }

  const recipe = resolveRecipe(`${module}.list`, overridesQ.data, t)
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
        label={t("New role")}
        icon="plus"
        secondary={{
          show: can("member_roles", "create"),
          label: t("Import CSV"),
          onClick: () => go(`/t/${teamId}/import/member_roles`),
        }}
        download={{
          show: (data.rows?.length ?? 0) > 0, // export needs READ — implied by seeing this list
          label: t("Export CSV"),
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
        label={t("Invite")}
        icon="mail"
        onCreate={() => go(sectionPath, { panel: "add", module: "invites" })}
      >
        <ScreenRenderer recipe={invitesRecipe} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      </SectionWithCreate>
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
  // ── THE WORK ENGINE'S FOUR ───────────────────────────────────────────────
  // Each one host-composed for the same reason the maps screen is: it needs
  // data the recipe has no way to ask for — a story needs the sprints, the
  // apps, the open requests and the team's people to be written at all. Their
  // own files, so this switch stays a switch.
  if (module === "stories") {
    return (
      <StoriesScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.stories}
        canCreate={can("work", "create")}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "sprints") {
    return (
      <SprintsScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.sprints}
        canCreate={can("work", "create")}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "apps") {
    return (
      <AppsScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.apps}
        canCreate={can("processes", "create")}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "tasks") {
    return (
      <TasksScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.tasks}
        counts={{
          all: totals.tasksAll,
          overdue: totals.tasksOverdue,
          upcoming: totals.tasksUpcoming,
          completed: totals.tasksCompleted,
          calendar: totals.tasksCalendar,
          dueToday: totals.tasksDueToday,
          dueTodayDone: totals.tasksDueTodayDone,
        }}
        view={ctx.taskView}
        onViewChange={ctx.setTaskView}
        myUserId={ctx.myUserId}
        canCreate={can("work", "create")}
        canRaiseTodo={can("todos", "create")}
        canCancelTodo={can("todos", "delete")}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "meetings") {
    return (
      <MeetingsScreen
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        total={totals.meetings}
        purposeCount={totals.purposes}
        canCreate={can("meetings", "create")}
        canReadPurposes={can("delivery", "read")}
        onPurposes={() => go(`/t/${teamId}/purposes`)}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  // ── THE AGENCY'S OWN HOUSEKEEPING ─────────────────────────────────────────
  // Two collections, one shape, in their own file (internal-screens.tsx) so
  // this switch stays a switch.
  if (module === "brand") {
    if (brandQ.error) return <LoadError what="the brand library" />
    if (brandQ.data === undefined) return <Skeleton variant="list" lines={4} />
    return (
      <BrandLibraryScreen
        rows={brandQ.data}
        recipe={recipe}
        rights={rights}
        total={totals.brand_assets}
        canCreate={can("brand_assets", "create")}
        onCreate={() => go(sectionPath, { panel: "add", module: "brand" })}
        onImport={() => go(`/t/${teamId}/import/brand_assets`)}
        exportHref="/api/content/brand-assets/export"
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "purposes") {
    if (purposesQ.error) return <LoadError what="the meeting purposes" />
    if (purposesQ.data === undefined) return <Skeleton variant="list" lines={4} />
    return (
      <PurposesScreen
        rows={purposesQ.data}
        recipe={recipe}
        rights={rights}
        total={totals.purposes}
        canCreate={can("delivery", "create")}
        onCreate={() => go(sectionPath, { panel: "add", module: "purposes" })}
        onImport={() => go(`/t/${teamId}/import/meeting_purposes`)}
        exportHref="/api/content/delivery/purposes/export"
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "accounts") {
    if (accountsQ.error) return <LoadError what="accounts" />
    if (accountsQ.data === undefined) return <Skeleton variant="list" lines={4} />
    const loaded = accountsQ.data
    // ALL / COMPANIES / PEOPLE — the strip Aurora asked for ("the Accounts tab is
    // a bit confusing, she would like to see things by company, customer or
    // contact"). It replaces the Type select rather than sitting beside it: two
    // controls for one field is the clutter she was describing.
    //
    // It is a SERVER narrowing, driven through the find's `fixed` question, so
    // the paging, the search box, the other filters and the CSV export all narrow
    // together — a tab that sieved the loaded page would show "the companies
    // among the newest fifty" under a badge counting all of them.
    //
    // A PERSON WHO MAY NOT LIST CONTACTS IS SHOWN NO PEOPLE TAB. The door already
    // narrows them to the companies through one `accountsWhere` (and answers
    // `individualTotal: 0`); a tab offering a pile they cannot have would be the
    // UI disagreeing with the fence out loud.
    const seesPeople = can("contacts", "read")
    const accountTab =
      seesPeople && ctx.query.tab === "people"
        ? "people"
        : ctx.query.tab === "companies"
          ? "companies"
          : "all"
    // R16: every badge is the door's exact COUNT(*), through the ONE seam — never
    // the loaded page's length, which on a paged list is just "50" forever.
    const accountsBadge = formatCount(totals.accounts)
    const accountTabs = [
      { value: "all", label: t("All"), icon: "users", badge: accountsBadge, badgeVariant: "" as const },
      {
        value: "companies",
        label: t("Companies"),
        icon: "building",
        badge: formatCount(totals.accountsEntity),
        badgeVariant: "" as const,
      },
      ...(seesPeople
        ? [
            {
              value: "people",
              label: t("People"),
              icon: "user",
              badge: formatCount(totals.accountsIndividual),
              badgeVariant: "" as const,
            },
          ]
        : []),
    ]
    // ARBITRATION (R16 iii): the badged strip WINS and the heading stands down,
    // through the context rather than by saying the same number twice.
    return (
      <CountedAbove active={accountsBadge !== ""}>
      <div className="flex flex-col gap-4">
        <CollectionHeading sectionKey="accounts" total={totals.accounts} />
        {/* R14's other half: the list pages, so the search box and every filter
            are answered by the DOOR. `status` options come from what is loaded
            (the team's own words, which no enum here could keep up with) while
            the filtering itself still happens over the whole collection. */}
        <PagedFind<Account>
          listKey={accountsKey(teamId as string)}
          placeholder={t("Search accounts…")}
          noun="accounts"
          // THE ORDER, asked of the door for the reason the search box is: the
          // list pages, so ordering the loaded page would arrange the newest
          // fifty companies under a badge counting all of them.
          sorts={translatedSorts("accounts", t)}
          defaultSort={COLLECTION_SORTS.accounts.defaultSort}
          fixed={accountTab === "all" ? undefined : { type: accountTab === "people" ? "individual" : "entity" }}
          facets={[
            {
              field: "status",
              label: t("Status"),
              control: "select",
              options: [...new Set(loaded.map((a) => a.status).filter((s): s is string => !!s))].map(
                (s) => ({ value: s, label: accountStatus(s) })
              ),
            },
            {
              field: "archived",
              label: t("Archived"),
              control: "select",
              options: [
                { value: "no", label: t("No") },
                { value: "yes", label: t("Yes") },
              ],
            },
          ]}
          fetchPage={(query, cursor) =>
            tenancy
              .accounts({ ...query, cursor })
              .then((r) => ({ rows: r.accounts, nextCursor: r.nextCursor, total: r.total }))
          }
        >
          {(found) => {
            const rows = found.active ? found.rows : loaded
            if (rows === null) return <Skeleton variant="list" lines={4} />
            const data = shapeAccountsList(rows)
            const accountsRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
            return (
              <>
                <SectionWithCreate
                  show={can("accounts", "create")}
                  label={t("New account")}
                  icon="plus"
                  secondary={{
                    show: can("accounts", "create"),
                    label: t("Import CSV"),
                    onClick: () => go(`/t/${teamId}/import/accounts`),
                  }}
                  // Parity, in the direction nobody checks. `export_accounts_csv` has been
                  // on the machine surface — and a declared import target — while this
                  // screen offered no way to do it: a machine could export the customer
                  // book and a person could not. Same rule as its three siblings above:
                  // export needs READ, which is implied by seeing the list at all.
                  //
                  // It carries the FIND with it: the export door narrows by the
                  // same five words as the list, deliberately, so that "export
                  // what I'm looking at" is one book and not two. It is also how
                  // a filtered book past the export ceiling gets out at all —
                  // the door's own refusal says "narrow it", and this is the
                  // narrowing.
                  download={{
                    show: (data.rows?.length ?? 0) > 0,
                    label: t("Export CSV"),
                    href: `/api/tenancy/accounts/export${found.queryString}`,
                  }}
                  onCreate={() => go(sectionPath, { panel: "add", module: "accounts" })}
                  // The strip sits ABOVE the boxed list — it scopes which accounts
                  // the collection card shows, so it is not part of that unit. It
                  // is URL-driven (?tab=) so Back works and a link to "the people"
                  // is a link somebody can send.
                  aboveCard={
                    <TabsView
                      config={{ ...defaultTabsConfig, variant: "line", tabs: accountTabs }}
                      value={accountTab}
                      onValueChange={(v) => go(sectionPath, v === "all" ? {} : { tab: v })}
                    />
                  }
                >
                  <ScreenRenderer
                    recipe={accountsRecipe}
                    data={data}
                    rights={rights}
                    onAction={onAction}
                    onIntent={onIntent}
                  />
                </SectionWithCreate>
                {/* R14: every company AND every person is a row here — the list
                    pages, and so do the matches when a find is on. */}
                <LoadMore
                  listKey={found.listKey ?? accountsKey(teamId as string)}
                  label={t("Load more accounts")}
                  fetchPage={found.fetchPage}
                />
              </>
            )
          }}
        </PagedFind>
      </div>
      </CountedAbove>
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
    const loadedSources = knowledgeQ.data
    // R16: the count lives in the heading (a sidebar page has no tab strip to
    // badge), and it is the door's exact COUNT(*) — never the loaded page's
    // length, which on a paged list is just "50" forever.
    return (
      <div className="flex flex-col gap-4">
        <CollectionHeading sectionKey="knowledge" total={totals.knowledge} />
        {/* THE SYNC AFFORDANCE, on the screen most obviously made of Google
            material. The owner: "we should have this button everywhere, wherever
            we're showing data coming from Google sources." It is the SAME
            component Settings and Meetings carry — one implementation, one
            sentence about when it last ran, one honest nothing. */}
        <GoogleSyncButton
          teamId={teamId as string}
          scope="knowledge"
          onSynced={() => invalidate(knowledgeKey(teamId as string))}
        />
        {/* ASK IT, HERE. The list answers "what does it know?"; this answers
            "what does it know about X?", which is the question somebody actually
            came with. It sits ABOVE the list because a page whose first control
            is a question box is a page people ask questions on. It spends no
            assistant allowance and says so — see knowledge-ask.tsx. */}
        <KnowledgeAsk
          onOpenSource={(id) => go(`${sectionPath}/${id}`)}
          onOpenRecord={(path) => go(`/t/${teamId}/${path}`)}
        />
        {/* R14's other half: the sweep only ever adds, so the search box is
            answered by the door — over every source, not the newest fifty. */}
        <PagedFind<KnowledgeSource>
          sorts={translatedSorts("knowledge", t)}
          defaultSort={COLLECTION_SORTS.knowledge.defaultSort}
          listKey={knowledgeKey(teamId as string)}
          placeholder={t("Search the knowledge base…")}
          noun="sources"
          fetchPage={(query, cursor) =>
            contentApi
              .knowledge(cursor, query)
              .then((r) => ({ rows: r.sources, nextCursor: r.nextCursor, total: r.total }))
          }
        >
          {(found) => {
            const rows = found.active ? found.rows : loadedSources
            if (rows === null) return <Skeleton variant="list" lines={4} />
            const data = shapeKnowledgeList(rows, names)
            const knowledgeRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
            return (
              <>
                <SectionWithCreate
                  show={can("knowledge", "create")}
                  label={t("Add a source")}
                  icon="plus"
                  // The third way in, beside the other two. It sits in the SECONDARY
                  // slot — the same place "Import CSV" sits on the accounts screen —
                  // because it is the same kind of affordance: another road to the same
                  // record, for material that already exists somewhere else.
                  secondary={{
                    show: can("knowledge", "create"),
                    label: t("Upload a file"),
                    onClick: () => go(sectionPath, { panel: "add", module: "knowledge-file" }),
                  }}
                  onCreate={() => go(sectionPath, { panel: "add", module: "knowledge" })}
                >
                  <ScreenRenderer
                    recipe={knowledgeRecipe}
                    data={data}
                    rights={rights}
                    onAction={onAction}
                    onIntent={onIntent}
                  />
                </SectionWithCreate>
                {/* R14: one source per ticket, per article, per account, plus every note
                    anybody writes — the list pages. */}
                <LoadMore
                  listKey={found.listKey ?? knowledgeKey(teamId as string)}
                  label={t("Load more sources")}
                  fetchPage={found.fetchPage}
                />
              </>
            )
          }}
        </PagedFind>
      </div>
    )
  }
  if (module === "tickets") {
    // TWO TAB STRIPS AND A QUEUE (CHECKLIST 5.1 + 5.11), which is state — and
    // this switch is deliberately pure (no hooks, no effects). So the screen is a
    // component of its own now; the host still owns the recipe, the rights and
    // the two callbacks, and hands them over.
    return (
      <TicketsCollection
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
        helpScope={helpScope}
        setHelpScope={ctx.setHelpScope}
        helpTypeOptions={ctx.helpTypeOptions}
        totals={totals}
        can={can}
        onCreate={() => go(sectionPath, { panel: "add", module: "tickets" })}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  return <NotFound />
}
