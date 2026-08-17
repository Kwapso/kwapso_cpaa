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
// The team's own admin (members, roles, invites, dropdown values) stays where it
// was: a tab strip on the TEAM. That is one level down, not a fourth thing here
// — a team is a record, and its sections belong to it.
//
// A content component rendered inside the one deep-link shell (the shell provides
// the AppShell chrome).

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@kwapso/ui/registry/primitives/avatar/avatar"
import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { List } from "@kwapso/ui/registry/collections/list/list"
import { ChevronRight } from "lucide-react"

import { AccessTokensSection } from "@/components/access-tokens"
import { GoogleConnectionsSection } from "@/components/google-connections"
import { InvitationsPanel, useReceivedInvites } from "@/components/invitations"
import { letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { TEAM_SCREENS_HIDDEN } from "@shared/product"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function SettingsScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const { ctx } = active
  const pendingInvites = useReceivedInvites().data ?? []

  async function openTeam(teamId: string) {
    if (teamId !== ctx?.team?.id) await active.switchTeam(teamId)
    softNavigate(`/t/${teamId}`)
  }

  if (!ctx) return null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      {/* Invitations sit at the top: an invitation is something waiting for you,
          and a thing waiting for you should not be below the housekeeping. It
          disappears when there is none, which is nearly always. */}
      {pendingInvites.length > 0 && (
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Invitations")}</h2>
          <InvitationsPanel active={active} />
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
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Teams")}</h2>
          <List
            surface="none"
            className="rounded-xl border"
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
                    <Badge variant="secondary" className="text-[10px]">
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
