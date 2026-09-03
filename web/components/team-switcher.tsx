"use client"

// The team switcher (one team at a time; tap to hop) — used in both the desktop
// sidebar and the mobile top bar. Extracted from the app shell so each stays
// small. Menu opacity is handled by the library dropdown now (UI-GAPS row 5).
//
// HIDDEN, NOT REMOVED. `TEAM_SCREENS_HIDDEN` (shared/product.ts) turns the
// dropdown into a plain nameplate: the same avatar and the same team name, with
// nothing to press. Kwapso runs one team and a second one would be an empty
// world (TEAM_CREATION_CLOSED), so the menu was offering a choice with one
// option in it — but the multi-team plumbing underneath is the thing that gets
// forked for a paying client, so not one line of it was touched. Flip that
// constant to false and the menu is back, whole.

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/components/avatar/avatar"
import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/components/dropdown-menu/dropdown-menu"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Check, CaretUpDown, ClipboardText, Plus } from "@shared/ui/foundations/icons"

import { useReceivedInvites } from "@/components/invitations"
import { letterMark } from "@/lib/identity"
import { TEAM_CREATION_CLOSED, TEAM_SCREENS_HIDDEN } from "@shared/product"
import { softNavigate } from "@/lib/nav"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function TeamSwitcher({
  active,
  onCreateTeam,
  collapsed,
}: {
  active: ActiveTeam
  onCreateTeam: () => void
  /** icon-only trigger (collapsed sidebar) */
  collapsed?: boolean
}) {
  const t = useT()
  const { ctx } = active
  const pendingInvites = useReceivedInvites().data?.length ?? 0
  const name = ctx?.team?.name ?? "No team"
  async function handleSwitch(teamId: string) {
    if (teamId === ctx?.team?.id) return
    const to = ctx?.teams.find((t) => t.id === teamId)?.name
    await active.switchTeam(teamId)
    toast.success(to ? `Switched to ${to}` : t("Team switched"))
  }

  // THE NAMEPLATE. Same avatar, same name, no control — a heading rather than a
  // button, because a menu you cannot go anywhere from is worse than no menu.
  if (TEAM_SCREENS_HIDDEN)
    return collapsed ? (
      <Avatar className="size-8" title={name}>
        {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
        <AvatarFallback className="text-xs">{letterMark(ctx?.team?.name)}</AvatarFallback>
      </Avatar>
    ) : (
      <div className="flex h-auto w-full items-center gap-2 px-2 py-1.5">
        <Avatar className="size-7">
          {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
          <AvatarFallback className="text-xs">{letterMark(ctx?.team?.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{name}</span>
      </div>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-[var(--radius)] p-0"
            title={name}
            aria-label={t("Switch team")}
          >
            <Avatar className="size-8">
              {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
              <AvatarFallback className="text-xs">{letterMark(ctx?.team?.name)}</AvatarFallback>
            </Avatar>
          </Button>
        ) : (
          <Button
            variant="ghost"
            // `ghost`'s own root ink (`text-ink-tertiary` idle / `text-foreground`
            // hover) is THEME-scoped; this trigger paints inside `railContent`,
            // which is SPINE-scoped (`bg-[var(--spine-fill)]`). That measured
            // 2.67:1 on ink/light and 1.34:1 on mango/dark — both under the 3:1
            // UI-boundary floor. Overridden to the spine's own ink (idle and
            // hover alike, same as `StandaloneNavItem`'s identical fix in
            // app-shell.tsx: once a row rests at full `--spine-ink`, a hover
            // step to the same value is a no-op, so both states are named here
            // to beat the variant's hover class outright rather than leave it
            // to win on `:hover` specificity).
            className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-[var(--spine-ink)] enabled:hover:text-[var(--spine-ink)]"
          >
            <Avatar className="size-7">
              {ctx?.team?.logoUrl && <AvatarImage src={ctx.team.logoUrl} alt={ctx.team.name} />}
              <AvatarFallback className="text-xs">{letterMark(ctx?.team?.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {name}
            </span>
            {/* No colour of its own any more — inherits the button's own
                `--spine-ink` above (same fix, same reason). */}
            <CaretUpDown className="size-4 shrink-0" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* Invitations you've received — reachable from anywhere, so a missed
         * invite email is never a dead end. */}
        {pendingInvites > 0 && (
          <>
            <DropdownMenuItem onSelect={() => softNavigate("/invitations")} className="gap-2">
              <ClipboardText className="size-4" />
              <span className="min-w-0 flex-1">{t("Invites")}</span>
              <Badge variant="secondary" className="text-badge">
                {pendingInvites}
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>{t("Your teams")}</DropdownMenuLabel>
        {ctx?.teams.map((team) => (
          <DropdownMenuItem key={team.id} onSelect={() => void handleSwitch(team.id)} className="gap-2">
            <Avatar className="size-6">
              {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
              <AvatarFallback className="text-badge">{letterMark(team.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate">{team.name}</span>
            {team.id === ctx.team?.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        {/* One team, so there is nothing to create (shared/product.ts). The
            menu keeps its switch list — a person can still be in more than one
            team by invitation, and the base is still multi-team underneath. */}
        {!TEAM_CREATION_CLOSED && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateTeam} className="gap-2">
              <Plus className="size-4" />
              {t("Create team")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
