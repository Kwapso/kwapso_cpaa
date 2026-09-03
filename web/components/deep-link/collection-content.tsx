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

import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import {
  ScreenRenderer,
} from "@shared/web/screen-engine/screen-renderer"
import { CollectionCreateActionProvider } from "@shared/web/screen-engine/collection-frame"
import { Button, buttonVariants } from "@shared/ui/components/button/button"
import { Download, UploadSimple, Plus } from "@shared/ui/foundations/icons"
import { cn } from "@shared/ui/lib/utils"

import { WavesScreen } from "@/components/waves-screen"
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
import { NotFound, LoadError, SectionWithCreate, CollectionCard, AddButton } from "@/components/deep-link/screen-bits"
import { CollectionHeading } from "@/components/collection-heading"
import { ContactsScreen } from "@/components/contacts-screen"
import { AskTheAssistant } from "@/components/ask-the-assistant"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { content as contentApi, tenancy } from "@/lib/api"
import { accountsKey, knowledgeKey } from "@/lib/live-resources"
import { invalidate } from "@shared/web/store"
import { GoogleSyncButton } from "@/components/google-sync"
import { CountedAbove } from "@/components/counted-tabs"
import { formatCount } from "@shared/web/format-count"
import {
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
    lang,
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
    companiesQ,
    brandQ,
    purposesQ,
    totals,
    rights,
    onAction,
    onIntent,
    sectionPath,
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

  // WAVES — the second host-only collection, and it is answered up here for the
  // reason the paragraph above gives, not for a new one. It shipped BELOW the
  // guard: the rail linked to it, the section was in every registry, and
  // /waves rendered "That screen doesn't exist." The prose warning was already
  // written and it was not enough, so `web/test/rules.test.ts` now derives the
  // answer instead — every sidebar section either resolves a `<module>.list`
  // recipe or is handled above this line.
  //
  // Host-composed because a row pairs a DERIVED date range with a sprint count
  // and an inline switch-off, and no engine block draws that. It reads its own
  // list and its own total.
  if (module === "waves") {
    return <WavesScreen teamId={teamId as string} basePath={sectionPath} />
  }

  const recipe = resolveRecipe(`${module}.list`, overridesQ.data, t)
  if (!recipe) return <NotFound />
  if (module === "members") {
    if (membersQ.error) return <LoadError what="members" />
    if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />
    const data = shapeMembersList(membersQ.data, lang)
    const membersRecipe = withDataDrivenCollection(recipe, data.rows ?? [])
    // No SectionWithCreate here — a member is never created directly (they
    // arrive by accepting an invite), so there is no create action to
    // coordinate and no double-button risk. The kit panel still draws the
    // box and the real search/filter chrome this recipe already declares
    // (the Role facet), which is what the legacy header drew by hand before.
    return (
      <ScreenRenderer
        recipe={membersRecipe}
        data={data}
        rights={rights}
        onAction={onAction}
        onIntent={onIntent}
        useKitPanel
      />
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
        useKitPanel
      >
        <ScreenRenderer
          recipe={rolesRecipe}
          data={data}
          rights={rights}
          onAction={onAction}
          onIntent={onIntent}
          useKitPanel
        />
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
        useKitPanel
      >
        <ScreenRenderer
          recipe={invitesRecipe}
          data={data}
          rights={rights}
          onAction={onAction}
          onIntent={onIntent}
          useKitPanel
        />
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
    // COMPANIES / ALL — the strip Aurora asked for ("the Accounts tab is a bit
    // confusing, she would like to see things by company, customer or
    // contact"). It replaces the Type select rather than sitting beside it: two
    // controls for one field is the clutter she was describing.
    //
    // CONTACTS LEFT THIS STRIP (client, 31 Aug 2026: "contacts as a real
    // sidebar page, also remove the tab from inside accounts") — see the
    // `contacts` module below, its own destination now, drawing the SAME
    // grouped-by-company arrangement this strip used to hold on its third tab.
    // What is left here answers "which companies do we work with"; All still
    // shows every account, companies and people together.
    //
    // COMPANIES LEADS, AND IS WHERE THE SCREEN OPENS (the owner, 18 Aug 2026:
    // "the tab order should be Companies, then Contacts, then All"). His model of
    // the section is "an account is a company", so the bare URL is the companies
    // and All is the one that carries `?tab=all` — a deliberate swap, because
    // the tab a screen opens on should be the one somebody meant to arrive at.
    //
    // It is a SERVER narrowing, driven through the find's `fixed` question, so
    // the paging, the search box, the other filters and the CSV export all narrow
    // together — a tab that sieved the loaded page would show "the companies
    // among the newest fifty" under a badge counting all of them.
    const accountTab = ctx.query.tab === "all" ? "all" : "companies"
    // R16: every badge is the door's exact COUNT(*), through the ONE seam — never
    // the loaded page's length, which on a paged list is just "50" forever.
    const accountsBadge = formatCount(totals.accounts)
    const accountTabs = [
      {
        value: "companies",
        label: t("Companies"),
        icon: "building",
        badge: formatCount(totals.accountsEntity),
        badgeVariant: "" as const,
      },
      { value: "all", label: t("All"), icon: "users", badge: accountsBadge, badgeVariant: "" as const },
    ]
    const canCreateAccount = can("accounts", "create")
    // ARBITRATION (R16 iii): the badged strip WINS and the heading stands down,
    // through the context rather than by saying the same number twice.
    return (
      <CountedAbove active={accountsBadge !== ""}>
      <div className="flex flex-col gap-4">
        <CollectionHeading sectionKey="accounts" total={totals.accounts} />
        {/* THE CANONICAL SHAPE (client, 31 Aug 2026, a reference screenshot of
            the kit's own collection composition — the "mini app" demo at
            verify/, lorem-ipsum data, dark mode): title, then tabs INSIDE the
            card, then — still inside the SAME card — the toolbar, then the
            rows. Read precisely: "toolbar placement is not exactly correct.
            should be under title (also inside of card) with All - and on the
            right the button[s] tha[t] are currently on the right of the
            toolbar. under the title, the full toolbar with search, filters,
            view selector." — THEN CORRECTED, same day, once the actions had
            landed beside the tabs instead: "never align the button with the
            tabs — that button belongs in the right of the toolbar, part of
            the toolbar." So the tabs (`tabs`, a `FolderTabStrip`) carry nothing
            but themselves — the SHAPE now, not just the practice — and
            New/Import/Export sit at the right of the toolbar
            row itself (`actions`, PagedFind's own slot for exactly this) —
            the native composition's own shape ("search, then filters, then
            view switcher, then actions pinned right"), not the folder strip's
            row. */}
        {/* R14's other half: the list pages, so the search box and every filter
            are answered by the DOOR. `status` options come from what is loaded
            (the team's own words, which no enum here could keep up with) while
            the filtering itself still happens over the whole collection. */}
        <PagedFind<Account>
          listKey={accountsKey(teamId as string)}
          placeholder={t("Search accounts…")}
          matches={{
            none: t("No accounts match"),
            one: t("1 account matches"),
            many: t("{count} accounts match"),
          }}
          // THE ORDER, asked of the door for the reason the search box is: the
          // list pages, so ordering the loaded page would arrange the newest
          // fifty companies under a badge counting all of them. THE CLIENT'S
          // OWN ADDITION ("i forgot in toolbar also the sort"): it stays in
          // THIS toolbar row, below the tabs, exactly where it already was —
          // moving the action buttons up did not touch it.
          sorts={translatedSorts("accounts", t)}
          defaultSort={COLLECTION_SORTS.accounts.defaultSort}
          // R50 — the resting read's own row count, across BOTH tabs: a team
          // with companies but no individuals yet is not a genuinely empty
          // Accounts collection, only an empty Contacts one (its own screen).
          restingEmpty={loaded.length === 0}
          fixed={accountTab === "all" ? undefined : { type: "entity" }}
          // THE DOOR'S OWN FILTERS, named once in lib/collection-filters.ts
          // beside every other paged collection's. A `status` facet stood here
          // and went with the column (0042) — its options were ROWS, which is
          // what let one free-text field grow four spellings of two ideas.
          facets={translatedFacets("accounts", t, {})}
          fetchPage={(query, cursor) =>
            tenancy
              .accounts({ ...query, cursor })
              .then((r) => ({ rows: r.accounts, nextCursor: r.nextCursor, total: r.total }))
          }
          // THE TABS, ALONE — no action beside them any more (client ruling,
          // 2026-08-31), and no ReactNode shape for one to hide inside: `tabs`
          // is a `FolderTabStrip`, drawn by the slot itself. The row's own
          // buttons moved to `actions` below, inside the toolbar `wrap` boxes
          // with the rows.
          tabs={{
            config: { ...defaultTabsConfig, tabs: accountTabs },
            value: accountTab,
            // Companies is the bare URL now, so `?tab=` names only the one
            // you have to ask for.
            onValueChange: (v) => go(sectionPath, v === "companies" ? {} : { tab: v }),
          }}
          // NEW/IMPORT/EXPORT, AT THE RIGHT OF THE TOOLBAR — PagedFind's own
          // `actions` slot, handed the same `queryString` the export href
          // always carried, so moving the button here does not cost the
          // "export what I'm looking at" narrowing (R16's own total, not the
          // loaded page, decides whether Export shows at all — correct even
          // before the first page answers).
          actions={({ queryString }) => (
            <>
              {/* Parity, in the direction nobody checks. `export_accounts_csv`
                  has been on the machine surface — and a declared import
                  target — while this screen offered no way to do it: a
                  machine could export the customer book and a person could
                  not. Export needs READ, which is implied by seeing the
                  list at all. */}
              {(totals.accounts ?? 0) > 0 && (
                <a
                  href={`/api/tenancy/accounts/export${queryString}`}
                  className={cn(buttonVariants({ variant: "secondary" }), "gap-1")}
                >
                  <Download className="size-4" />
                  {t("Export CSV")}
                </a>
              )}
              {canCreateAccount && (
                <Button
                  variant="secondary"
                  onClick={() => go(`/t/${teamId}/import/accounts`)}
                  className="gap-1"
                >
                  <UploadSimple className="size-4" />
                  {t("Import CSV")}
                </Button>
              )}
              {canCreateAccount && (
                <AddButton
                  label={t("New account")}
                  onClick={() => go(sectionPath, { panel: "add", module: "accounts" })}
                />
              )}
            </>
          )}
          // THE ONE CARD — toolbar, then rows, exactly the reference's
          // [panel: toolbar, body]. Zero gap to the tabs above (this file's
          // `tabs` slot, not the outer column's `gap-4`), the same join
          // `SectionWithCreate`'s own `folderTabs` slot draws.
          wrap={(inner) => <CollectionCard>{inner}</CollectionCard>}
        >
          {(found) => {
            const rows = found.active ? found.rows : loaded
            if (rows === null) return <Skeleton variant="list" lines={4} />
            const data = shapeAccountsList(rows)
            const accountsRecipe = withDataDrivenCollection(recipe, data.rows ?? [], found.emptyText)
            return (
              // THE SAME ACTION, PUBLISHED DOWNWARDS (screen-bits.tsx's own
              // `SectionWithCreate` does this identically) — the create button
              // now lives in the toolbar above, but the engine's zero-state
              // still needs to name the next act.
              <CollectionCreateActionProvider
                action={
                  canCreateAccount
                    ? {
                        label: t("New account"),
                        icon: <Plus className="size-4" />,
                        onCreate: () => go(sectionPath, { panel: "add", module: "accounts" }),
                      }
                    : null
                }
              >
                {/* No `useKitPanel`: `CollectionCard` above is the ONE box now
                    (the "broken combination" screen-bits.tsx's own doc warns
                    against is a card drawn twice, kit panel and CollectionCard
                    both). */}
                <ScreenRenderer
                  recipe={accountsRecipe}
                  data={data}
                  rights={rights}
                  onAction={onAction}
                  onIntent={onIntent}
                />
                {/* R14: every company AND every person is a row here — the list
                    pages, and so do the matches when a find is on. */}
                <LoadMore
                  listKey={found.listKey ?? accountsKey(teamId as string)}
                  label={t("Load more accounts")}
                  fetchPage={found.fetchPage}
                />
              </CollectionCreateActionProvider>
            )
          }}
        </PagedFind>
      </div>
      </CountedAbove>
    )
  }
  // CONTACTS — its own file (`@/components/contacts-screen`), not a branch
  // drawn out here — see that file's own header for why: `web/test/
  // rules.test.ts`'s tab-nesting census counts how many times the TabsView
  // element appears PER FILE, and Accounts (above) already carries one in
  // this switch.
  if (module === "contacts") {
    return (
      <ContactsScreen
        teamId={teamId as string}
        t={t}
        go={go}
        sectionPath={sectionPath}
        tab={ctx.query.tab}
        accountsQ={accountsQ}
        total={totals.accountsIndividual}
        recipe={recipe}
        rights={rights}
        onAction={onAction}
        onIntent={onIntent}
      />
    )
  }
  if (module === "knowledge") {
    if (knowledgeQ.error) return <LoadError what="the knowledge base" />
    if (knowledgeQ.data === undefined) return <Skeleton variant="list" lines={4} />
    // The account NAMES a source is filed under — the list says "Bergman S.A.",
    // never `account:01J…`. `accountsQ` is gated to the accounts/contacts
    // screens (use-screen-data.ts), so it is empty on THIS one; `companiesQ`
    // asks the door directly (2026-08-31 — the same "A client" bug app-detail
    // had, here because the fallback map was never populated at all rather
    // than paged past). Merged with whatever `accountsQ` happens to already
    // hold (a warm cache from a recent visit to Accounts costs nothing extra).
    const names = new Map([
      ...(accountsQ.data ?? []).map((a) => [a.id, a.name] as const),
      ...(companiesQ.data ?? []).map((a) => [a.id, a.name] as const),
    ])
    const loadedSources = knowledgeQ.data
    // R16: the count lives in the heading (a sidebar page has no tab strip to
    // badge), and it is the door's exact COUNT(*) — never the loaded page's
    // length, which on a paged list is just "50" forever.
    return (
      <div className="flex flex-col gap-6">
        {/* THE HEADING AND THE SYNC AFFORDANCE ARE ONE BAND, not two blocks.
            The owner asked for the sync button "everywhere, wherever we're
            showing data coming from Google sources", and it stays exactly that
            visible — it has simply stopped being a block of its own between the
            heading and the ask box (N2 counts blocks before the primary content,
            and this screen was at five). A heading names the collection and this
            button refreshes the same collection, so they answer one question and
            belong on one band (N4). `CollectionHeading` renders nothing when a
            counted tab strip wins the arbitration, which leaves the button on
            the band by itself and is still correct. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CollectionHeading sectionKey="knowledge" total={totals.knowledge} />
          {/* Inline on the heading band, so no caption: a toolbar control that
              explains itself in two lines pushes the heading it sits beside out
              of alignment, and this screen's own title already says what the
              collection is. The Meetings foot is where the sentence belongs. */}
          <GoogleSyncButton
            teamId={teamId as string}
            scope="knowledge"
            describe={false}
            onSynced={() => invalidate(knowledgeKey(teamId as string))}
          />
        </div>
        {/* ASK IT, HERE. The list answers "what does it know?"; this answers
            "what does it know about X?", which is the question somebody actually
            came with. It sits ABOVE the list because a page whose first control
            is a question box is a page people ask questions on. The answer
            arrives in the assistant, with its sources marked at the claims and
            room to ask the follow-up — see ask-the-assistant.tsx. */}
        <AskTheAssistant />
        {/* R14's other half: the sweep only ever adds, so the search box is
            answered by the door — over every source, not the newest fifty. */}
        <PagedFind<KnowledgeSource>
          sorts={translatedSorts("knowledge", t)}
          defaultSort={COLLECTION_SORTS.knowledge.defaultSort}
          // R50 — the resting read's own row count.
          restingEmpty={loadedSources.length === 0}
          listKey={knowledgeKey(teamId as string)}
          placeholder={t("Search")}
          matches={{
            none: t("No sources match"),
            one: t("1 source matches"),
            many: t("{count} sources match"),
          }}
          // THE FILTERS, asked of the DOOR. They were the frame's until 18 Aug
          // 2026, which meant "From a meeting" narrowed the loaded fifty and
          // answered TWO over a base holding 170 — page one happened to have two
          // meetings on it. `kind` and `active` are closed vocabularies the door
          // allow-lists; `compartment` is rows, so it is filled in from the
          // accounts the team area has already loaded.
          facets={translatedFacets("knowledge", t, {
            compartment: [
              { value: "agency", label: t("The agency") },
              ...[...names].map(([id, name]) => ({ value: `account:${id}`, label: name })),
            ],
          })}
          fetchPage={(query, cursor) =>
            contentApi
              // The whole question, spread — `listQuery` forwards every key of
              // it, so a filter cannot be dropped between this control and the
              // door.
              .knowledge({ ...query, cursor })
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
                  useKitPanel
                >
                  <ScreenRenderer
                    recipe={knowledgeRecipe}
                    data={data}
                    rights={rights}
                    onAction={onAction}
                    onIntent={onIntent}
                    useKitPanel
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
    // A TAB STRIP AND A QUEUE (CHECKLIST 5.1 + 5.11), which is state — and this
    // switch is deliberately pure (no hooks, no effects). So the screen is a
    // component of its own now; the host still owns the recipe, the rights and
    // the two callbacks, and hands them over. The screen owns its own scope
    // (Archived is a toolbar filter now, not lifted host state) — see
    // tickets-collection.tsx's own header comment for 2026-08-31's redesign.
    return (
      <TicketsCollection
        teamId={teamId as string}
        recipe={recipe}
        rights={rights}
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
