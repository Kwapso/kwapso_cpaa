"use client"

// SETTINGS — the APP's own housekeeping, and nothing about a person.
//
// The owner's ruling folded the old system's separate Admin / System / Kwapso
// sections in here rather than giving each a rail entry: they are all the same
// kind of thing (opened rarely and on purpose) and a nav rail that lists three
// of them reads as three destinations.
//
// TWO THINGS LEFT IT ON 17 AUG 2026, and the reason is the same for both.
//   • YOUR PROFILE AND YOUR EMAIL moved to a page of their own
//     (screens/profile-screen.tsx, reached from the profile menu). Everything
//     here is about the APP; those are about a PERSON, and a tester looking for
//     "change my name" should not have to guess which of three tabs holds it.
//   • THE TEAMS LIST is hidden rather than removed — shared/product.ts explains
//     at length why nothing underneath it was touched.
//
// REBUILT INTO FOUR TABS, 2026-09-01 — the flat one-page-with-headings shape
// above gave way to a real tab strip once the design kit's own Settings
// composition (shared/ui/compositions/screens/settings.tsx, ch26.05) named
// the shape: "a plain page-title header followed by the same underline tab
// strip used on every detail page's sub-tabs". Four tabs, in this order:
//
//   1. Appearance     — unchanged: Mode, Sidebar and Scale, exactly as they
//                        were on the flat page.
//   2. Members & roles — the team area's own Members and Member-roles lists
//                        (web/components/deep-link/collection-content.tsx),
//                        reused rather than rebuilt, stacked as two sections
//                        on one scrolling tab instead of two destinations one
//                        level down. Invites and Internal rates — the rest of
//                        "This team" — stay reachable as plain links here,
//                        since neither earned a tab of its own; the Teams
//                        list (hidden by TEAM_SCREENS_HIDDEN) rides along
//                        beside them, exactly as it always has.
//   3. Integrations   — Access tokens and the Google connection: both are a
//                        PERSON connecting something outside the app to their
//                        own account, which is what the word means here.
//   4. Choices        — formerly "Dropdown values", formerly its own tab on
//                        the team area's strip (web/components/selectable-
//                        screen.tsx explains the rename and the move). This
//                        is the one door to it now; ManageDropdownsLink and
//                        every other in-app shortcut open straight to it via
//                        `?tab=choices`.
//
// NOTIFICATIONS IS GONE, on purpose (client ruling, 2026-09-01) — it was never
// live content in this app, only a tab named in the design kit's own reference
// composition, and dropping it was confirmed rather than an oversight.
//
// LINE TABS, A DELIBERATE EXCEPTION FOR THIS SCREEN. Every OTHER main/
// collection screen in the app takes the FOLDER variant (tabs-view.tsx's own
// default) because its strip switches between records or between
// collections; Settings' four tabs switch between SETTINGS SECTIONS instead,
// which is the exact carve-out that file's own doc already states for the
// line variant. Rather than naming that variant literally a second time (the
// thing web/test/rules.test.ts's "tab shape is decided in one place" census
// exists to catch), this spreads `RECORD_TABS_CONFIG` — the one constant
// record-chrome.tsx already declares for exactly this override — so the
// line strip's visual spec (underline weight, rounded ends, label colour,
// all fixed the same night as this rebuild) can only ever be tuned in the
// one place it already lives.
//
// A content component rendered inside the one deep-link shell (the shell
// provides the AppShell chrome).

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Headline } from "@shared/ui/components/typography/typography"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { List } from "@shared/web/list-compat"
import { ChevronRight } from "@shared/ui/foundations/icons"

import { AccessTokensSection } from "@/components/access-tokens"
import { GoogleConnectionsSection } from "@/components/google-connections"
import { InvitationsPanel, useReceivedInvites } from "@/components/invitations"
import { letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { TEAM_SECTIONS } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { auth } from "@/lib/api"
import { TEAM_SCREENS_HIDDEN } from "@shared/product"
import type { ActiveTeam } from "@/lib/use-active-team"
import { AppearanceSection } from "@shared/web/appearance-section"
import { ScaleSection } from "@shared/web/scale-section"
import { SpineSection } from "@shared/web/spine-section"
import { useLanguage } from "@shared/web/language"
import { useRemembered } from "@shared/web/remembered"

import { RECORD_TABS_CONFIG } from "@/components/record-chrome"
import { TabsView } from "@shared/web/screen-engine/tabs-view"
import { ScreenRenderer, type ScreenIntent } from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRights } from "@shared/web/screen-engine/recipe"
import { NoAccess, SectionWithCreate } from "@/components/deep-link/screen-bits"
import { shapeMembersList, shapeRolesList } from "@/components/deep-link/shape"
import { resolveRecipe, withDataDrivenCollection } from "@/lib/screens"
import { useScreenData } from "@/lib/use-screen-data"
import { SelectableScreen } from "@/components/selectable-screen"

export function SettingsScreen({
  active,
  initialTab,
}: {
  active: ActiveTeam
  /** From the URL's `?tab=` (deep-link-screen.tsx) — the same mechanism
   * `KwapsoScreen`'s own `initialTab` uses, so a link can open Settings
   * straight onto one tab (`ManageDropdownsLink` → `?tab=choices`). An
   * explicit link always wins over whatever tab a previous visit remembered. */
  initialTab?: string
}) {
  const { t, lang } = useLanguage()
  const { ctx } = active
  const pendingInvites = useReceivedInvites().data ?? []
  const teamId = ctx?.team?.id ?? null
  const { can, perms } = usePermissions(teamId)
  const rights: ScreenRights = perms ?? {}

  // Remembered with the screen (web/lib/nav-memory.ts) — reopening Settings
  // lands back on whichever tab was open, unless the URL names one.
  const [tab, setTab] = useRemembered("tab", initialTab ?? "appearance", (remembered) =>
    initialTab ? initialTab : typeof remembered === "string" ? remembered : undefined
  )

  // MEMBERS + MEMBER ROLES — the SAME recipes, shapers and ScreenRenderer the
  // team area's own /t/<teamId>/members and /roles routes draw through (see
  // collection-content.tsx's "members"/"roles" branches), reused rather than
  // rebuilt so the lists are genuinely unchanged, just mounted from this
  // second call site. `useScreenData` loads members only "on its own module"
  // (its own doc), which `module: "members"` turns on; roles and the recipe
  // overrides load across the whole team area regardless, so this one call
  // is enough for both sections below.
  const { membersQ, rolesQ, overridesQ } = useScreenData({
    teamId,
    enabled: !!teamId,
    module: "members",
    recordId: null,
    ancestorModules: [],
  })
  const roles = rolesQ.data ?? []
  const membersData = membersQ.data ? shapeMembersList(membersQ.data, lang) : null
  const membersRecipeBase = resolveRecipe("members.list", overridesQ.data, t)
  const membersRecipe =
    membersData && membersRecipeBase
      ? withDataDrivenCollection(membersRecipeBase, membersData.rows ?? [])
      : null
  const rolesData = shapeRolesList(roles)
  const rolesRecipeBase = resolveRecipe("roles.list", overridesQ.data, t)
  const rolesRecipe = rolesRecipeBase
    ? withDataDrivenCollection(rolesRecipeBase, rolesData.rows ?? [])
    : null

  // Neither list recipe declares a row ACTION (`actions: []` on both —
  // "mutating actions live on the detail"), so this is never actually called;
  // ScreenRenderer requires the prop regardless.
  function onAction() {
    // no-op — see above.
  }

  // The one intent a plain list fires: opening a row. Both lists' rows carry
  // the record's OWN address, the same one the team area's own strip opens
  // (`/t/<teamId>/members/<id>`, `/t/<teamId>/roles/<id>`) — so "manage"
  // (change a role, remove a member, edit a permission grid) still happens
  // exactly where it always has, on the record's own detail screen.
  function onIntent(intent: ScreenIntent) {
    if (intent.kind === "open" && teamId) softNavigate(`/t/${teamId}/${intent.module}/${intent.id}`)
  }

  // THE TEAM'S OWN ADMIN NOT GIVEN A TAB OF ITS OWN — Invites (the team's own
  // sent invites) and Internal rates. Members, Member roles and Choices each
  // moved to a real tab; DERIVED rather than hand-listed for the same reason
  // this list always was: a section added to the registry appears here the
  // day it is added. Overview is left out because it is the team record
  // itself rather than a setting.
  const adminSections = TEAM_SECTIONS.filter(
    (s) =>
      s.placement === "tab" &&
      !["overview", "members", "roles"].includes(s.key) &&
      can(s.module, "read")
  )

  async function openTeam(teamId: string) {
    if (teamId !== ctx?.team?.id) await active.switchTeam(teamId)
    softNavigate(`/t/${teamId}`)
  }

  if (!ctx) return null

  const tabsConfig = {
    ...RECORD_TABS_CONFIG,
    tabs: [
      { value: "appearance", label: t("Appearance"), icon: "palette", badge: "", badgeVariant: "" as const },
      { value: "members", label: t("Members & roles"), icon: "users-round", badge: "", badgeVariant: "" as const },
      { value: "integrations", label: t("Integrations"), icon: "key-round", badge: "", badgeVariant: "" as const },
      { value: "choices", label: t("Choices"), icon: "list-checks", badge: "", badgeVariant: "" as const },
    ],
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* MAIN-SCREEN TITLE — the kit's own named "Page title" step (56/500,
          collection-heading.tsx's own note has the full ruling), no eyebrow,
          no chips/pills, no black activity footer: Settings is a MAIN screen
          (it's in the navbar, it has no breadcrumb record, no identity chip),
          never a detail screen, so it takes exactly the title treatment every
          other main screen does. */}
      <Headline as="h1" size="display-m">{t("Settings")}</Headline>

      {/* Invitations sit above the tabs, not inside one: something waiting
          for YOU is not a settings section to click into, it's the reason
          you might be here at all. Disappears when there is none, which is
          nearly always. */}
      {pendingInvites.length > 0 && (
        <section className="motion-panel-in flex flex-col gap-4">
          <h2 className="text-muted-foreground text-micro uppercase">{t("Invites waiting for you")}</h2>
          <InvitationsPanel refresh={active.refresh} />
        </section>
      )}

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "appearance") {
            return (
              <div className="flex flex-col gap-8">
                {/* HOW BIG THE APP IS (CHECKLIST 10.3). One root font size moves
                    text and spacing together, and because the viewport is
                    locked against pinch to zoom this is the only way anybody
                    can make this app bigger. */}
                <ScaleSection value={active.user?.scale ?? null} save={(scale) => auth.setScale(scale)} />

                {/* LIGHT / DARK / SYSTEM. The owner's own instruction: a
                    preference about how the app looks, in the one place a
                    person goes to change how the app looks. */}
                <AppearanceSection />

                {/* THE SIDEBAR'S COLOUR — ink, paper or mango (client ruling
                    D3). Persisted the same way Scale is, on the person's own
                    row, so it follows them between devices. `app-shell.tsx`
                    reads this same field to paint the real rail. */}
                <SpineSection
                  value={active.user?.spine ?? null}
                  save={async (spine) => {
                    // Unlike Scale, applying the choice has no document-level
                    // side effect to fire optimistically (app-shell.tsx reads
                    // the rail's spine off `active.user`, not off a DOM
                    // attribute this component could set itself) — so the
                    // live update this tab sees comes from `active.refresh()`
                    // rather than from realtime, which local dev doesn't even
                    // proxy. Awaited: the section's own `saving` state should
                    // cover the whole round trip, card press to rail repaint.
                    await auth.setSpine(spine)
                    await active.refresh()
                  }}
                />
              </div>
            )
          }

          if (panel.value === "members") {
            return (
              <div className="flex flex-col gap-8">
                {/* MEMBERS — read-only here in the sense that a member is
                    never CREATED directly (they arrive by accepting an
                    invite); change-role and remove both live on the row's
                    own detail screen, exactly as they do at
                    /t/<teamId>/members. */}
                <section className="flex flex-col gap-3">
                  <Headline as="h2" size="h4">{t("Members")}</Headline>
                  {!can("team_members", "read") ? (
                    <NoAccess />
                  ) : membersQ.error ? (
                    <p className="text-destructive text-sm">{t("Couldn't load members.")}</p>
                  ) : !membersData || !membersRecipe ? (
                    <Skeleton variant="list" lines={4} />
                  ) : (
                    <ScreenRenderer
                      recipe={membersRecipe}
                      data={membersData}
                      rights={rights}
                      onAction={onAction}
                      onIntent={onIntent}
                      useKitPanel
                    />
                  )}
                </section>

                {/* MEMBER ROLES — same New/Import/Export row the team area's
                    own Roles tab draws; New and Import both open the real
                    /t/<teamId>/roles screen with its own dialog already open,
                    since that dialog machinery lives on the team-scoped
                    route and Settings has no address to hand it a panel of
                    its own. */}
                <section className="flex flex-col gap-3">
                  <Headline as="h2" size="h4">{t("Member roles")}</Headline>
                  {!can("member_roles", "read") ? (
                    <NoAccess />
                  ) : rolesQ.error ? (
                    <p className="text-destructive text-sm">{t("Couldn't load roles.")}</p>
                  ) : !rolesRecipe ? (
                    <Skeleton variant="list" lines={4} />
                  ) : (
                    <SectionWithCreate
                      show={can("member_roles", "create")}
                      label={t("New role")}
                      icon="plus"
                      secondary={{
                        show: can("member_roles", "create"),
                        label: t("Import CSV"),
                        onClick: () => teamId && softNavigate(`/t/${teamId}/import/member_roles`),
                      }}
                      download={{
                        show: roles.length > 0,
                        label: t("Export CSV"),
                        href: "/api/tenancy/roles/export",
                      }}
                      onCreate={() => teamId && softNavigate(`/t/${teamId}/roles?panel=add&module=roles`)}
                      useKitPanel
                    >
                      <ScreenRenderer
                        recipe={rolesRecipe}
                        data={rolesData}
                        rights={rights}
                        onAction={onAction}
                        onIntent={onIntent}
                        useKitPanel
                      />
                    </SectionWithCreate>
                  )}
                </section>

                {/* WHAT ELSE IS ON THIS TEAM'S OWN ADMIN — see the note on
                    `adminSections` above for why Invites and Internal rates
                    are still plain links rather than sections of their own. */}
                {teamId && adminSections.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <Headline as="h2" size="h4">{t("This team")}</Headline>
                    <List
                      surface="none"
                      className="rounded-[var(--radius)] bg-surface-panel"
                      onItemClick={(item) => softNavigate(`/t/${teamId}/${item.id}`)}
                      items={adminSections.map((s) => ({
                        id: s.segment,
                        title: t(s.title),
                        trailing: <ChevronRight className="text-muted-foreground size-4" />,
                      }))}
                    />
                  </section>
                )}

                {/* THE TEAMS YOU ARE IN. Hidden, not deleted: the constant is
                    the whole of the switch, the list below is exactly what it
                    was, and flipping TEAM_SCREENS_HIDDEN to false in
                    shared/product.ts brings it back whole.
                    web/test/one-team.test.ts holds both halves of that
                    decision. */}
                {!TEAM_SCREENS_HIDDEN && (
                  <section className="flex flex-col gap-3">
                    <Headline as="h2" size="h4">{t("Teams")}</Headline>
                    <List
                      surface="none"
                      className="rounded-[var(--radius)] bg-surface-panel"
                      onItemClick={(item) => void openTeam(item.id)}
                      items={ctx.teams.map((team) => ({
                        id: team.id,
                        image: team.logoUrl,
                        imageAlt: team.name,
                        initials: letterMark(team.name),
                        title: (
                          <span className="flex items-center gap-2">
                            <span className="truncate">{team.name}</span>
                            {team.id === ctx.team?.id && (
                              <Badge variant="secondary" className="text-badge">
                                {t("Active")}
                              </Badge>
                            )}
                          </span>
                        ),
                        trailing: <ChevronRight className="text-muted-foreground size-4" />,
                      }))}
                    />
                  </section>
                )}
              </div>
            )
          }

          if (panel.value === "integrations") {
            return (
              <div className="flex flex-col gap-8">
                <AccessTokensSection teamName={ctx.team?.name ?? null} />
                {/* Beside Access tokens on purpose: both are things a PERSON
                 * connects to their own account, and both hand something the
                 * power to act as them. */}
                <GoogleConnectionsSection teamId={ctx.team?.id ?? null} />
              </div>
            )
          }

          if (panel.value === "choices") {
            if (!can("selectable_data", "read")) return <NoAccess />
            if (!teamId) return null
            return (
              <SelectableScreen
                teamId={teamId}
                onImport={() => softNavigate(`/t/${teamId}/import/selectable_data`)}
                onOpen={(id) => softNavigate(`/t/${teamId}/dropdowns/${id}`)}
                standalone={false}
              />
            )
          }

          return null
        }}
      />
    </div>
  )
}
