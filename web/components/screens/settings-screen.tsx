"use client"

// SETTINGS — one page with THREE TABS: Account, Teams, Access.
//
// The owner's ruling folded the old system's separate Admin / System / Kwapso
// sections in here rather than giving each a rail entry: they are all the same
// kind of thing (the app's own housekeeping, opened rarely and on purpose) and a
// nav rail that lists three of them reads as three destinations. What was a
// stack of five headings you scrolled past is now a strip you choose from —
// through the library TabsView, like every other tab strip in the app (R3).
//
// The team's own admin (members, roles, invites, dropdown values) stays where it
// was: a tab strip on the TEAM, reached by tapping the team here. That is one
// level down, not a fourth tab — a team is a record, and its sections belong to
// it.
//
// A content component rendered inside the one deep-link shell (the shell provides
// AppShell chrome). Tapping a team makes it active and opens its detail;
// team-switch navigation is soft (softNavigate), no reload.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@kwapso/ui/registry/primitives/avatar/avatar"
import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { List } from "@kwapso/ui/registry/collections/list/list"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { ChevronRight, Mail } from "lucide-react"

import { AccessTokensSection } from "@/components/access-tokens"
import { EmailChangeDialog } from "@/components/email-change-dialog"
import { GoogleConnectionsSection } from "@/components/google-connections"
import { InvitationsPanel, useReceivedInvites } from "@/components/invitations"
import { ProfileDialog } from "@/components/profile-dialog"
import { auth } from "@/lib/api"
import { formatDateTime } from "@shared/web/format"
import { personName, personInitials, letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { useCached } from "@shared/web/store"
import type { ActiveTeam } from "@/lib/use-active-team"

export function SettingsScreen({ active }: { active: ActiveTeam }) {
  const [tab, setTab] = React.useState("account")
  const [editing, setEditing] = React.useState(false)
  const [changingEmail, setChangingEmail] = React.useState(false)
  const { ctx, user } = active
  const pendingInvites = useReceivedInvites().data ?? []
  const accountActivityQ = useCached("account-activity", () => auth.activity().then((r) => r.activity))

  async function openTeam(teamId: string) {
    if (teamId !== ctx?.team?.id) await active.switchTeam(teamId)
    softNavigate(`/t/${teamId}`)
  }

  if (!ctx) return null
  const name = personName({ firstName: user?.firstName, lastName: user?.lastName }) || "You"

  // NO COUNT ON THE TEAMS TAB, and that is R16 doing its job rather than an
  // omission. The only number available here is `ctx.teams.length` — the length
  // of a list the session-bootstrap door returns with no COUNT(*) beside it —
  // and a list's length is a ceiling, not a total. Badging it would be exactly
  // the mistake that once had a 24,011-row catalogue advertising "1000". If this
  // tab is ever to carry a number, the door has to answer with one first.
  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "account", label: "Account", icon: "user", badge: "", badgeVariant: "" as const },
      { value: "teams", label: "Teams", icon: "building", badge: "", badgeVariant: "" as const },
      { value: "access", label: "Access", icon: "key-round", badge: "", badgeVariant: "" as const },
    ],
  }

  const accountPanel = (
    <div className="flex flex-col gap-8">
      <section className="animate-rise flex flex-col gap-3">
        <List
          surface="none"
          className="rounded-xl border"
          items={[
            {
              id: "profile",
              leading: (
                <Avatar className="size-9">
                  {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={name} />}
                  <AvatarFallback>{personInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                </Avatar>
              ),
              title: name,
              trailing: (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
              ),
            },
            {
              id: "email",
              leading: (
                <div className="text-muted-foreground flex size-9 items-center justify-center">
                  <Mail className="size-4" />
                </div>
              ),
              title: user?.email,
              trailing: (
                <Button variant="outline" size="sm" onClick={() => setChangingEmail(true)}>
                  Change email
                </Button>
              ),
            },
          ]}
        />
      </section>

      <section className="animate-rise flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Account activity</h2>
        {accountActivityQ.error ? (
          <p className="text-destructive text-sm">Couldn&apos;t load your activity.</p>
        ) : accountActivityQ.data === undefined ? (
          <Skeleton variant="list" lines={3} />
        ) : (
          <ActivityFeed
            config={{ ...defaultActivityFeedConfig, newestFirst: false, emptyText: "No account activity yet." }}
            items={accountActivityQ.data.map((a) => ({
              id: a.id,
              description: a.description,
              timestamp: formatDateTime(a.createdAt),
            }))}
          />
        )}
      </section>
    </div>
  )

  const teamsPanel = (
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
                Active
              </Badge>
            )}
          </span>
        ),
        trailing: <ChevronRight className="text-muted-foreground size-4" />,
      }))}
    />
  )

  return (
    <>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {/* Invitations sit ABOVE the strip, not inside a tab: an invitation is
            something waiting for you, and a thing waiting for you should not be
            behind a tab you have to think to open. It disappears when there is
            none, which is nearly always. */}
        {pendingInvites.length > 0 && (
          <section className="animate-rise flex flex-col gap-3">
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invitations</h2>
            <InvitationsPanel active={active} />
          </section>
        )}

        <TabsView
          config={tabsConfig}
          value={tab}
          onValueChange={setTab}
          renderPanel={(t) => {
            if (t.value === "teams") return teamsPanel
            if (t.value === "access") return <AccessTokensSection teamName={ctx.team?.name ?? null} />
            return accountPanel
          }}
        />
        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Account</h2>
          <List
            surface="none"
            className="rounded-xl border"
            items={[
              {
                id: "profile",
                leading: (
                  <Avatar className="size-9">
                    {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={name} />}
                    <AvatarFallback>{personInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                  </Avatar>
                ),
                title: name,
                trailing: (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Edit profile
                  </Button>
                ),
              },
              {
                id: "email",
                leading: (
                  <div className="text-muted-foreground flex size-9 items-center justify-center">
                    <Mail className="size-4" />
                  </div>
                ),
                title: user?.email,
                trailing: (
                  <Button variant="outline" size="sm" onClick={() => setChangingEmail(true)}>
                    Change email
                  </Button>
                ),
              },
            ]}
          />
        </section>

        <AccessTokensSection teamName={ctx.team?.name ?? null} />

        {/* Beside Access tokens on purpose: both are things a PERSON connects to
         * their own account, and both hand something the power to act as them. */}
        <GoogleConnectionsSection teamId={ctx.team?.id ?? null} />

        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Account activity</h2>
          {accountActivityQ.error ? (
            <p className="text-destructive text-sm">Couldn&apos;t load your activity.</p>
          ) : accountActivityQ.data === undefined ? (
            <Skeleton variant="list" lines={3} />
          ) : (
            <ActivityFeed
              config={{ ...defaultActivityFeedConfig, newestFirst: false, emptyText: "No account activity yet." }}
              items={accountActivityQ.data.map((a) => ({
                id: a.id,
                description: a.description,
                timestamp: formatDateTime(a.createdAt),
              }))}
            />
          )}
        </section>

        <section className="animate-rise flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Teams</h2>
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
                      Active
                    </Badge>
                  )}
                </span>
              ),
              trailing: <ChevronRight className="text-muted-foreground size-4" />,
            }))}
          />
        </section>
      </div>

      <ProfileDialog open={editing} onOpenChange={setEditing} user={user} onSaved={active.refresh} />
      <EmailChangeDialog
        open={changingEmail}
        onOpenChange={setChangingEmail}
        currentEmail={user?.email ?? ""}
        onSaved={active.refresh}
      />
    </>
  )
}
