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
// What is left is one page rather than a tab strip, because a strip with one tab
// in it is a control that decides nothing: the invitations waiting for you, the
// tokens a machine holds, and the Google account kwapso may act through. All
// three are the same sentence said three ways — something outside this app has
// been given a way in, and this is where you take it back.
//
// THE TEAM'S OWN ADMIN MOVED HERE ON 17 AUG 2026 (CHECKLIST 10.4 and 10.5), and
// the reason is that its front door had quietly closed. Users, member roles,
// invites and dropdown values are a tab strip on the TEAM, one level down at
// /t/<teamId> — and the team switcher that used to be the way to that level was
// hidden when the app became single-team. The screens were all still there and
// there was no longer a link to any of them.
//
// So Settings now carries the list. The screens themselves did not move: each
// row is a link to the page that already existed, gated by the same read right
// the tab strip gates on, so a role that cannot see roles sees no row rather
// than a row that refuses. Two places to reach one screen is fine; nowhere to
// reach it is not.
//
// A content component rendered inside the one deep-link shell (the shell provides
// the AppShell chrome).

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/components/avatar/avatar"
import { Badge } from "@shared/ui/components/badge/badge"
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
import { useT } from "@shared/web/language"

export function SettingsScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const { ctx } = active
  const pendingInvites = useReceivedInvites().data ?? []
  const teamId = ctx?.team?.id ?? null
  const { can } = usePermissions(teamId)

  // THE TEAM'S ADMIN SCREENS, DERIVED rather than hand-listed. A `placement:
  // "tab"` section IS one of them by definition, so a section added to the
  // registry appears here the day it is added and one removed disappears the
  // same day — the failure this list exists to fix was a screen with no way in,
  // and a hand-written list is exactly how that happens again. Overview is left
  // out because it is the team record itself rather than a setting.
  const adminSections = TEAM_SECTIONS.filter(
    (s) => s.placement === "tab" && s.key !== "overview" && can(s.module, "read")
  )

  async function openTeam(teamId: string) {
    if (teamId !== ctx?.team?.id) await active.switchTeam(teamId)
    softNavigate(`/t/${teamId}`)
  }

  if (!ctx) return null

  return (
    <div className="flex w-full flex-col gap-12">
      {/* Invitations sit at the top: an invitation is something waiting for you,
          and a thing waiting for you should not be below the housekeeping. It
          disappears when there is none, which is nearly always. */}
      {pendingInvites.length > 0 && (
        <section className="motion-panel-in flex flex-col gap-4">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Invites waiting for you")}</h2>
          <InvitationsPanel refresh={active.refresh} />
        </section>
      )}

      {/* HOW BIG THE APP IS (CHECKLIST 10.3). One root font size moves text and
          spacing together, and because the viewport is locked against pinch to
          zoom this is the only way anybody can make this app bigger. */}
      <ScaleSection
        value={active.user?.scale ?? null}
        save={(scale) => auth.setScale(scale)}
        className="motion-panel-in"
      />

      {/* LIGHT / DARK / SYSTEM, directly under the size and nowhere else on this
          page. The owner's own instruction, and it is the right shape: two
          preferences about how the app looks, side by side, in the one place a
          person goes to change how the app looks. */}
      <AppearanceSection className="motion-panel-in" />

      {/* THE TEAM'S OWN ADMIN — see the header for why these rows are here. */}
      {teamId && adminSections.length > 0 && (
        <section className="motion-panel-in flex flex-col gap-4">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t("This team")}
          </h2>
          <List
            surface="none"
            className="rounded-[var(--radius)] border"
            onItemClick={(item) => softNavigate(`/t/${teamId}/${item.id}`)}
            items={adminSections.map((s) => ({
              id: s.segment,
              title: t(s.title),
              trailing: <ChevronRight className="text-muted-foreground size-4" />,
            }))}
          />
        </section>
      )}

      <AccessTokensSection teamName={ctx.team?.name ?? null} />

      {/* Beside Access tokens on purpose: both are things a PERSON connects to
       * their own account, and both hand something the power to act as them. */}
      <GoogleConnectionsSection teamId={ctx.team?.id ?? null} />

      {/* THE TEAMS YOU ARE IN. Hidden, not deleted: the constant is the whole of
          the switch, the list below is exactly what it was, and flipping
          TEAM_SCREENS_HIDDEN to false in shared/product.ts brings it back whole.
          web/test/one-team.test.ts holds both halves of that decision. */}
      {!TEAM_SCREENS_HIDDEN && (
        <section className="motion-panel-in flex flex-col gap-4">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Teams")}</h2>
          <List
            surface="none"
            className="rounded-[var(--radius)] border"
            onItemClick={(item) => void openTeam(item.id)}
            items={ctx.teams.map((team) => ({
              id: team.id,
              leading: (
                <Avatar className="size-9">
                  {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
                  <AvatarFallback className="text-xs">{letterMark(team.name)}</AvatarFallback>
                </Avatar>
              ),
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
