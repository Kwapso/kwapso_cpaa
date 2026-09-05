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
import { Briefcase, Chat, CaretRight, PuzzlePiece, Tray, CheckSquare, Gear, Timer, UploadSimple, Users } from "@shared/ui/foundations/icons"
import { Headline } from "@shared/ui/components/typography/typography"

import { PulseBand, pulseIsQuiet, usePulse } from "@/components/pulse"
import { letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { usePermissions, type Can } from "@/lib/perms"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

/** START HERE — the three acts a team with nothing in it can actually do next.
 *
 * WHY THIS EXISTS. Home answered "where is everything" and never "what do I do
 * first". On a team created five seconds ago the whole screen was a name, a
 * role badge, "1 member", three cards politely saying nothing is happening, and
 * eight navigation links — so the only way to find out what to do was to open
 * each of the eight and read it, which is exactly the navigating this screen's
 * own header says it stopped doing for the POPULATED case. The empty case never
 * got the same treatment.
 *
 * WHEN IT DRAWS, AND WHY IT IS NOT ALWAYS ON. It is gated on `pulseIsQuiet`
 * (components/pulse.tsx) — nothing open, nothing due, no hours in eight weeks,
 * nothing in the diary — read off the SAME cache key the band below already
 * holds, so it costs no request. The moment the team has anything at all this
 * block is gone for good, because a permanent getting-started panel on the
 * screen the owner opens every morning is clutter, and clutter is what the
 * pulse replaced.
 *
 * EACH STEP IS GATED, and an ungrantable one is ABSENT rather than dimmed (the
 * rule the whole app follows) — so a Viewer who can create nothing sees no
 * block at all rather than three doors that refuse them.
 *
 * THE MIDDLE STEP IS ALSO A FIX OF ITS OWN. `/t/<team>/import` — the screen
 * that lists ALL seven import targets and hands out the sample file for each —
 * was linked from nowhere in either front door: every route in was an "Import
 * CSV" button scoped to one table, and two of the seven tables had no button at
 * all. The owner's own first useful outcome is "the customer has imported their
 * first real records", so the generic importer belongs on the first screen
 * somebody with no data ever sees. */
function FirstSteps({ teamId, can, canImport }: { teamId: string; can: Can; canImport: boolean }) {
  const t = useT()
  const { data } = usePulse(teamId)
  const steps = [
    {
      show: can("accounts", "create"),
      title: t("Add your first account"),
      desc: t("A company or a person you work with. Everything else hangs off one."),
      icon: Briefcase,
      href: "/accounts",
    },
    {
      show: canImport,
      title: t("Bring a spreadsheet in"),
      desc: t("Import a CSV instead of typing. Download a sample file first to see what a good one looks like."),
      icon: UploadSimple,
      href: `/t/${teamId}/import`,
    },
    {
      show: can("help", "create"),
      title: t("Raise the first ticket"),
      desc: t("Something someone has asked us for. This is where the work usually starts."),
      icon: Tray,
      href: "/tickets",
    },
  ].filter((s) => s.show)

  if (!pulseIsQuiet(data) || steps.length === 0) return null

  return (
    <section className="motion-panel-in flex flex-col gap-3 rounded-[var(--radius)] bg-surface-panel p-4">
      <div className="flex flex-col gap-1">
        <Headline as="h2" size="h3">
          {t("Start here")}
        </Headline>
        <p className="text-muted-foreground text-sm">
          {/* TRUE WHENEVER THE BLOCK DRAWS, which is a narrower promise than
              "there's nothing in here yet" — `pulseIsQuiet` answers "nothing
              open, nothing due, no hours in eight weeks, nothing in the diary",
              and a team that has simply gone quiet for a fortnight satisfies
              that as squarely as a team created this morning. The three acts
              below are the right offer either way; the sentence above them must
              not claim something about the team's history that this screen did
              not ask. */}
          {t("Nothing's on the go right now. Any one of these is a good place to start.")}
        </p>
      </div>
      <List
        surface="none"
        onItemClick={(item) => softNavigate(item.id)}
        items={steps.map((s) => {
          const Icon = s.icon
          return {
            id: s.href,
            leading: (
              <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-[var(--radius)]">
                <Icon className="size-5" />
              </span>
            ),
            title: s.title,
            subtitle: s.desc,
            trailing: <CaretRight className="text-muted-foreground size-4" />,
          }
        })}
      />
    </section>
  )
}

export function HomeScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const ctx = active.ctx
  const teamId = ctx?.team?.id ?? null
  // Called ABOVE the early return — the hook order is fixed whether or not the
  // team context has landed (web/test/hooks-order.test.ts).
  const { can, perms } = usePermissions(teamId)
  // THE IMPORT SCREEN'S OWN GATE, asked here rather than restated: `canImport`
  // is character-for-character the predicate `ImportScreen` uses to decide
  // whether to draw the wizard at all (web/components/import-screen.tsx), so
  // the link on this screen and the screen it lands on can never disagree
  // about who may import.
  const canImport = perms ? Object.values(perms).some((m) => m?.create) : false
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

      {/* START HERE, above the pulse and above the links — on a team with
          nothing in it the pulse has nothing to say and the links are the
          eight questions this block answers in one. It renders nothing the
          moment the team has anything at all (see FirstSteps above). */}
      {teamId && <FirstSteps teamId={teamId} can={can} canImport={canImport} />}

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
