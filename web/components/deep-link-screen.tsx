"use client"

// The deep-link resolver — ONE static shell backs the whole /t/* tree. It reads
// /t/<teamId>/<module>/<id>?panel|confirm from the URL (client-side — static
// export can't prerender ids), switches to that team if the link came from
// elsewhere, fetches each module's data + the caller's rights through the
// permission-checked endpoints, shapes it for the recipe, and renders the
// library ScreenRenderer. The engine emits open/close intents and named actions;
// the host maps intents to URL changes and dispatches actions to the API.
//
// This file is the SPINE — where are we, whose team is it, what did we load, and
// what does the screen look like. The parts each live next door, so you can open
// the one you need:
//   deep-link/use-host-nav      the URL: read it, and change it without a reload
//   deep-link/use-route-team    which team the screen runs against, and may you
//   deep-link/use-trace-ring    the assistant's "here's what I changed" glance
//   deep-link/crumbs            the breadcrumb trail
//   deep-link/module-content    the render half — which screen for which module
//   deep-link/write-panels      the write half — the ?panel / ?confirm dialogs
//
// Write UI is URL-driven (?panel / ?confirm) so Back closes it and links are
// shareable; it reuses the existing tested dialogs. The role permission grid has
// no engine block, so its detail is host-composed (role-detail.tsx).

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import { type ScreenRights } from "@kwapso/ui/lib/recipe"

import { AppShell, ShellLoading } from "@/components/app-shell"
import { TeamSectionNav } from "@/components/team-section-nav"
import { CountedTabs } from "@/components/counted-tabs"
import { buildCrumbs } from "@/components/deep-link/crumbs"
import { renderModuleContent } from "@/components/deep-link/module-content"
import { ACCOUNT_MODULES, type SectionKey } from "@/components/deep-link/route"
import { useHostNav, useUrlRoute } from "@/components/deep-link/use-host-nav"
import { useRouteTeam } from "@/components/deep-link/use-route-team"
import { useTraceRing } from "@/components/deep-link/use-trace-ring"
import { WritePanels } from "@/components/deep-link/write-panels"
import { HomeScreen } from "@/components/screens/home-screen"
import { SettingsScreen } from "@/components/screens/settings-screen"
import { InvitationsScreen } from "@/components/screens/invitations-screen"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"

import { ApiFailure } from "@/lib/api"
import type { HelpScope, TaskView } from "@/lib/live-resources"
import { registerHostGo } from "@/lib/nav"
import { usePermissions } from "@/lib/perms"
import { useScreenData } from "@/lib/use-screen-data"
import { useScreenActions } from "@/lib/use-screen-actions"
import { useActiveTeam } from "@/lib/use-active-team"
import { TEAM_SECTIONS, type Crumb } from "@/lib/pages"
import { useT } from "@shared/web/language"

export function DeepLinkScreen() {
  const active = useActiveTeam()
  const t = useT()
  const router = useRouter()

  /* -------------------------------- where am I ------------------------------- */

  const { route, setRoute } = useUrlRoute()
  const urlTeamId = route?.teamId || null
  const module = route?.module ?? null
  const recordId = route?.recordId ?? null
  const query = route?.query ?? {}
  const topLevel = route?.topLevel ?? false

  // Top-level pages (/learning, /tickets) run against the ACTIVE team (like /home);
  // /t/<id> URLs name their team explicitly, so only those switch teams.
  const { teamId, onTeam, enabled, isMemberOfUrlTeam, teamCount, noAccess } = useRouteTeam({
    active,
    urlTeamId,
    router,
  })
  const { perms, can } = usePermissions(enabled ? teamId : null)

  /* --------------------------------- the data -------------------------------- */

  // Which ticket set the Tickets screen shows. It is a SERVER scope (R14: the list
  // is paged, so the door filters by raiser — not a client filter over a page),
  // so it must be declared ABOVE the reads that key off it.
  const [helpScope, setHelpScope] = React.useState<HelpScope>("all")

  // Which pile of our own admin the Tasks screen shows. A SERVER view for the
  // same reason (the list is capped, so "the done ones" is a question for the
  // door, not a sieve over the rows already loaded), so it is declared here too.
  const [taskView, setTaskView] = React.useState<TaskView>("open")

  // Per-module data — cache-first + null-keyed (a screen fetches only the modules
  // it shows). Lifted into one hook so the host reads as "fetch, then render".
  const {
    overridesQ,
    accountsQ,
    knowledgeQ,
    membersQ,
    rolesQ,
    invitesQ,
    metaQ,
    learningQ,
    helpQ,
    helpMineQ,
    helpArchivedQ,
    marketingQ,
    brandQ,
    programmesQ,
    purposesQ,
    storiesQ,
    sprintsQ,
    appsQ,
    tasksOpenQ,
    tasksAllQ,
    workLogsQ,
    meetingsQ,
    marketingChannelOptions,
    marketingStatusOptions,
    brandCategoryOptions,
    departmentOptions,
    internalActivity,
    totals,
    helpTypeOptions,
    learningCategoryOptions,
    contentTypeOptions,
    activityScope,
    activityKey,
    activityQ,
    activityTotal,
    inviteAuditQ,
  } = useScreenData({ teamId, enabled, module, recordId, helpScope, taskView })

  const roles = rolesQ.data ?? []
  const activeRoles = roles.filter((r) => r.active)
  const rights: ScreenRights = perms ?? {}

  /* ------------------------------- navigation ------------------------------- */

  // The base URL for the current screen — a clean top-level path (/learning) or the
  // team-scoped form (/t/<teamId>/<module>). go() / breadcrumbs / closePanel build
  // off these, so intra-screen nav stays in whichever form you arrived through.
  const teamPath = teamId ? `/t/${teamId}` : "/"
  const moduleBase = topLevel
    ? `/${module}`
    : module && module !== "team"
      ? `/t/${teamId}/${module}`
      : teamPath
  const sectionPath = moduleBase
  const currentPath = recordId ? `${moduleBase}/${recordId}` : moduleBase

  const { go, replace, closePanel } = useHostNav({ router, setRoute, currentPath })

  // Register THIS host's soft go() so deep components (the profile menu, team switcher,
  // invite inbox) navigate through the History API instead of router.push — no reload.
  React.useEffect(() => registerHostGo(go), [go])

  // A CSS selector the agent asked us to ring briefly (the traced control).
  const traceHighlight = useTraceRing({ teamId, onTeam, go })

  /* -------------------------------- mutations ------------------------------- */

  // The write layer (named-action dispatcher + the rich-payload creators), lifted
  // into one hook. Each action calls the permission-checked endpoint, primes the
  // actor's cache and invalidates any changed sibling count; runAction throws on
  // failure so the calling dialog / confirm surfaces it.
  const {
    runAction,
    createLearning,
    createHelp,
    createAccount,
    createKnowledge,
    uploadKnowledgeFile,
    saveInternalRecord,
    setInternalActive,
  } = useScreenActions(teamId)

  /* -------------------------- engine intent + action ------------------------- */

  function onIntent(intent: ScreenIntent) {
    if (intent.kind === "open")
      // Open a record in the SAME URL form we're in (clean top-level or /t-scoped).
      go(topLevel ? `/${intent.module}/${intent.id}` : `/t/${teamId}/${intent.module}/${intent.id}`)
    else if (intent.kind === "close") {
      if (query.panel || query.confirm) closePanel()
      else router.back()
    }
    // tab intent: TabsView keeps its own state; URL-tab sync is a later milestone.
  }

  // An engine action → host. Confirming / input-gathering actions route to the
  // URL (?panel / ?confirm); the dialog or confirm there does the mutation.
  function onAction(actionId: string, ctx: ScreenActionContext) {
    const id = ctx.id ?? ""
    switch (actionId) {
      case "members.changeRole":
        go(currentPath, { panel: "edit", module: "members", id })
        break
      case "members.remove":
        go(currentPath, { confirm: "members.remove", id })
        break
      case "invites.revoke":
        go(currentPath, { confirm: "invites.revoke", id })
        break
      case "team.edit":
        go(currentPath, { panel: "edit", module: "team" })
        break
      // The agency's own housekeeping. Four modules, two actions each, and the
      // same routing every other write in this host uses: the action opens a
      // URL (?panel / ?confirm) and the dialog behind it does the mutation, so
      // Back closes it and the link is shareable.
      case "marketing.edit":
      case "brand.edit":
      case "programme.edit":
      case "purpose.edit":
        go(currentPath, { panel: "edit", module: module as string, id })
        break
      // OUR OWN ADMIN, ticked off. The one action in this host that does NOT go
      // through the ?panel / ?confirm route, and deliberately: those exist for
      // writes that need input or a decision, and a tick needs neither. It is
      // also reversible, which is what makes a confirm on it pure ceremony.
      case "tasks.done": {
        const done = ctx.record?.status !== "Done"
        void runAction("tasks.done", { id, done: String(done) }).catch((err: unknown) => {
          toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that task.")
        })
        break
      }
      case "marketing.archive":
      case "brand.archive":
      case "programme.archive":
      case "purpose.archive":
        go(currentPath, { confirm: `${module}.archive`, id })
        break
    }
  }

  /* --------------------------------- render -------------------------------- */

  if (active.loading || !active.ctx || !route) return <ShellLoading />

  // Account screens (/home, /settings, /invitations) render DIRECTLY in the shell — they
  // aren't team-scoped module content, so they skip the team tabs / queries / membership
  // gate below. Because they live inside this one never-unmounting shell, moving in and
  // out of them (and into /t) is soft History-API nav — no reload anywhere.
  if (ACCOUNT_MODULES.includes(module ?? "")) {
    const accountCrumbs: Crumb[] =
      module === "settings"
        ? [{ label: t("Settings") }]
        : module === "invitations"
          ? [{ label: t("Invitations") }]
          : []
    return (
      <AppShell active={active} breadcrumbs={accountCrumbs} onNavigate={go} activePath={currentPath}>
        {module === "home" && <HomeScreen active={active} />}
        {module === "settings" && <SettingsScreen active={active} />}
        {module === "invitations" && <InvitationsScreen active={active} />}
      </AppShell>
    )
  }

  // About to be redirected: the membership guard sends us to /home when the URL
  // points at a team we're no longer in (we still have others). Show the loading
  // frame — NOT the shell bound to the auto-fallback team — so we never flash the
  // wrong team's name/logo in the header/breadcrumb during the hop.
  if (teamId && !isMemberOfUrlTeam && teamCount > 0) return <ShellLoading />

  const teamName = active.ctx.team?.name ?? "Team"
  const myUserId = active.user?.id ?? null
  // Import has no read-right of its own — it's gated per-target. You can reach it
  // if you can CREATE into any supported target (member roles, learning, accounts).
  const canImport =
    can("member_roles", "create") || can("learning", "create") || can("accounts", "create")

  // The team tab strip. The NUMBER on each badge is an exact server total (LAW
  // R16): members from the active context's COUNT(*), everything else from the
  // `total:` sidecar each list door returns — NEVER a loaded list's length (a
  // capped list's length is a ceiling, not a total).
  const { section, showTabs, sectionCounts } = teamTabStrip(module, {
    members: active.ctx.memberCount ?? undefined,
    member_roles: totals.member_roles,
    invites: totals.invites,
    selectable: totals.selectable,
    internal_rates: totals.internal_rates,
    learning: totals.learning,
    help: totals.help,
    accounts: totals.accounts,
    knowledge: totals.knowledge,
    stories: totals.stories,
    sprints: totals.sprints,
    apps: totals.apps,
    tasks: totals.tasks,
    meetings: totals.meetings,
    marketing: totals.marketing,
    brand_assets: totals.brand_assets,
    programmes: totals.programmes,
    purposes: totals.purposes,
  })

  const crumbs = buildCrumbs({
    t,
    topLevel,
    module,
    recordId,
    teamName,
    teamPath,
    sectionPath,
    records: {
      accounts: accountsQ.data,
      members: membersQ.data,
      roles,
      invites: invitesQ.data,
      learning: learningQ.data,
      knowledge: knowledgeQ.data,
      apps: appsQ.data,
      sprints: sprintsQ.data,
      stories: storiesQ.data,
      // The ALL list, so a FINISHED task's breadcrumb still says its name rather
      // than falling back to an id — it loads whenever a record is open.
      tasks: tasksAllQ.data ?? tasksOpenQ.data,
      meetings: meetingsQ.data,
    },
  })

  return (
    <AppShell active={active} breadcrumbs={crumbs} onNavigate={go} activePath={currentPath}>
      {/* data-trace marks the screen the agent just drove; the ring is a short-lived
       * glance cue (auto-cleared) so the user sees WHERE a traced change landed. It
       * rings the content region — a just-opened dialog draws the eye on its own. */}
      <div
        data-trace={traceHighlight ?? undefined}
        className={`mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-xl transition-shadow ${
          traceHighlight ? "ring-primary/60 ring-2 ring-offset-2 ring-offset-background" : ""
        }`}
      >
        {showTabs && (
          <TeamSectionNav
            teamId={teamId as string}
            current={section}
            perms={perms}
            counts={sectionCounts}
            onNavigate={(href) => go(href)}
          />
        )}
        {/* ARBITRATION (R16 iii): when the team tab strip above carries this
            section's count badge, mark the panel — any CollectionHeading inside
            stands down, so a screen can never show the same number twice. The
            badged flag is per-permission (the strip may hide for this viewer). */}
        <CountedTabs badged={showTabs && sectionCounts[section] !== undefined}>
          {renderModuleContent({
            noAccess, enabled, perms, can, module, recordId, teamId, canImport, go,
            overridesQ, metaQ, membersQ, rolesQ, roles, invitesQ, learningQ, helpQ, accountsQ, knowledgeQ, totals,
            marketingQ, brandQ, programmesQ, purposesQ, internalActivity,
            storiesQ, sprintsQ, appsQ, tasksOpenQ, tasksAllQ, workLogsQ, meetingsQ,
            activityQ, activityTotal, activityKey, activityScope, inviteAuditQ, teamName, active,
            rights, onAction, onIntent,
            sectionPath, helpScope, setHelpScope, myUserId, query, helpMineQ, helpArchivedQ,
            taskView, setTaskView, t,
          })}
        </CountedTabs>
      </div>

      <WritePanels
        query={query}
        can={can}
        teamId={teamId}
        activeRoles={activeRoles}
        active={active}
        membersQ={membersQ}
        accountsQ={accountsQ}
        learningCategoryOptions={learningCategoryOptions}
        contentTypeOptions={contentTypeOptions}
        marketingChannelOptions={marketingChannelOptions}
        marketingStatusOptions={marketingStatusOptions}
        brandCategoryOptions={brandCategoryOptions}
        departmentOptions={departmentOptions}
        marketingQ={marketingQ}
        brandQ={brandQ}
        programmesQ={programmesQ}
        purposesQ={purposesQ}
        helpTypeOptions={helpTypeOptions}
        runAction={runAction}
        createLearning={createLearning}
        createHelp={createHelp}
        createAccount={createAccount}
        createKnowledge={createKnowledge}
        uploadKnowledgeFile={uploadKnowledgeFile}
        saveInternalRecord={saveInternalRecord}
        setInternalActive={setInternalActive}
        closePanel={closePanel}
        onRecordGone={() => replace(sectionPath)}
      />
    </AppShell>
  )
}

/** The team tab strip for a module: which section is current, whether the strip
 * shows at all, and the badge on each tab. Learning/Tickets are sidebar PAGES and
 * Import is contextual, so the strip shows only on the "tab" sections (Overview /
 * Members / Roles / Invites). The badges are DERIVED from each section's own
 * countCacheKey (LAW R8) — never hand-listed — and a total that hasn't loaded
 * yet is simply left out, so the badge renders nothing. */
function teamTabStrip(
  module: string | null,
  totalByCacheKey: Record<string, number | undefined>
): { section: SectionKey; showTabs: boolean; sectionCounts: Partial<Record<SectionKey, number>> } {
  const section: SectionKey =
    module === "members" ||
    module === "roles" ||
    module === "invites" ||
    module === "dropdowns" ||
    module === "internal-rates" ||
    module === "accounts" ||
    module === "learning" ||
    module === "tickets" ||
    module === "knowledge" ||
    module === "processes" ||
    module === "stories" ||
    module === "sprints" ||
    module === "apps" ||
    module === "tasks" ||
    module === "meetings" ||
    module === "marketing" ||
    module === "brand" ||
    module === "delivery" ||
    module === "purposes" ||
    module === "import"
      ? module
      : "overview"
  const showTabs = (TEAM_SECTIONS.find((s) => s.key === section)?.placement ?? "tab") === "tab"
  const sectionCounts: Partial<Record<SectionKey, number>> = {}
  for (const s of TEAM_SECTIONS) {
    if (!s.countCacheKey) continue
    const total = totalByCacheKey[s.countCacheKey]
    if (total !== undefined) sectionCounts[s.key] = total
  }
  return { section, showTabs, sectionCounts }
}
