"use client"

// Home — the active team's landing, and the screen this app's owner opens most.
//
// It used to be a name, a role badge and two links. That is a correct screen and
// an empty one: everything the team actually did that week lived one tap away on
// five other pages, so the first thing anybody saw every morning was navigation.
//
// Now it opens with THE PULSE (components/pulse.tsx): the handful of numbers
// worth aggregating and the two things worth drawing — where requests are
// sitting, and how the hours went. One read, gated section by section, so a
// person sees exactly the parts their role can read and nothing is reserved for
// the parts it cannot.
//
// The links stay, underneath, and they now go to the four places the numbers are
// ABOUT rather than to two admin screens — a number a person cannot click
// through to is a number they have to go and look for.
//
// A content component rendered INSIDE the one deep-link shell (so navigating
// in/out is soft, no reload); the shell provides the AppShell chrome. Links go
// through softNavigate (History-API), never router.push.

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/components/avatar/avatar"
import { Badge } from "@shared/ui/components/badge/badge"
import { List } from "@shared/web/list-compat"
import { Briefcase, Chat, CaretRight, PuzzlePiece, Tray, CheckSquare, Gear, Timer, Users } from "@shared/ui/foundations/icons"
import { Headline } from "@shared/ui/components/typography/typography"

import { PulseBand } from "@/components/pulse"
import { letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { usePermissions } from "@/lib/perms"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function HomeScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const ctx = active.ctx
  const teamId = ctx?.team?.id ?? null
  // Called ABOVE the early return — the hook order is fixed whether or not the
  // team context has landed (web/test/hooks-order.test.ts).
  const { can } = usePermissions(teamId)
  if (!ctx) return null

  // WHERE THE NUMBERS GO. Each line is the destination the pulse card above it
  // is about, and each one carries the SAME lucide icon that page wears on the
  // rail (CONCEPT_ICON, via app-shell's SECTION_ICONS) — so a glyph means one
  // thing wherever somebody meets it. A line for a page the caller cannot open
  // is not drawn: a link to a 403 is worse than no link.
  const LINKS = [
    { need: "help", title: t("Tickets"), desc: t("What clients have asked us for"), icon: Tray, href: "/tickets" },
    { need: "work", title: t("Stories"), desc: t("The work in hand"), icon: PuzzlePiece, href: "/stories" },
    { need: "work", title: t("Tasks"), desc: t("Our own admin"), icon: CheckSquare, href: "/tasks" },
    { need: "work", title: t("Work logs"), desc: t("Time logged, and the timers running"), icon: Timer, href: "/time" },
    { need: "meetings", title: t("Meetings"), desc: t("The meetings list"), icon: Chat, href: "/meetings" },
    { need: "accounts", title: t("Accounts"), desc: t("The companies and contacts we work with"), icon: Briefcase, href: "/accounts" },
  ].filter((l) => can(l.need, "read"))

  const ADMIN = [
    { title: t("Team"), desc: t("Members, roles and invites"), icon: Users, href: ctx.team ? `/t/${ctx.team.id}` : "/settings" },
    { title: t("Settings"), desc: t("Your account and teams"), icon: Gear, href: "/settings" },
  ]

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="motion-panel-in flex flex-wrap items-center gap-4">
        <Avatar className="size-14">
          {ctx.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
          <AvatarFallback className="text-xl">{letterMark(ctx.team?.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {/* display-m — CLIENT CORRECTION, 2026-08-31: a main screen's title
              is the kit's own named "Page title" step (56/500), see
              collection-heading.tsx's own note for the full ruling. */}
          <Headline as="h1" size="display-m" className="truncate">{ctx.team?.name}</Headline>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            {ctx.role && <Badge variant="secondary">{ctx.role.title}</Badge>}
            <span>
              {ctx.memberCount} {t("member")}{ctx.memberCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* THE PULSE, above everything a person navigates to — the whole point of
          it is that the answer is on the screen before the click. It renders
          nothing at all for a role that can read none of the three modules. */}
      {teamId && <PulseBand teamId={teamId} />}

      <List
        surface="none"
        className="motion-panel-in rounded-[var(--radius)] bg-surface-panel"
        onItemClick={(item) => softNavigate(item.id)}
        items={[...LINKS, ...ADMIN].map((l) => {
          const Icon = l.icon
          return {
            id: l.href,
            leading: (
              <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-[var(--radius)]">
                <Icon className="size-5" />
              </span>
            ),
            title: l.title,
            subtitle: l.desc,
            trailing: <CaretRight className="text-muted-foreground size-4" />,
          }
        })}
      />
    </div>
  )
}
