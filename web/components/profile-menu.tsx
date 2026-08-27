"use client"

// The profile menu — your name/email, a link to Account, and sign out. Extracted
// from the app shell so each stays small. Menu opacity is handled by the library
// dropdown now (UI-GAPS row 5).

import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/components/avatar/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/components/dropdown-menu/dropdown-menu"
import { ModeToggle } from "@shared/ui/components/mode-toggle/mode-toggle"
import { LogOut, Palette, Settings, UserRound } from "@shared/ui/foundations/icons"

import { auth } from "@/lib/api"
import { personName, personInitials } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { clearAllFormDrafts } from "@shared/web/use-form-draft"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function ProfileMenu({ active }: { active: ActiveTeam }) {
  const t = useT()
  const router = useRouter()
  const { user } = active
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-pill ring-offset-2">
          <Avatar className="size-8">
            {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={t("You")} />}
            <AvatarFallback className="text-xs">
              {personInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">
            {personName({ firstName: user?.firstName, lastName: user?.lastName })}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* YOUR OWN PAGE, not Settings. Your name, your email address, the
            language you read kwapso in and what you have done are about a
            PERSON; Settings is about the app. They were one screen until 17 Aug
            2026, and a tester looking for "change my name" had to guess. */}
        <DropdownMenuItem onSelect={() => softNavigate("/profile")} className="gap-2">
          <UserRound className="size-4" />
          {t("Your profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => softNavigate("/settings")} className="gap-2">
          <Settings className="size-4" />
          {t("Settings")}
        </DropdownMenuItem>
        {/* LIGHT / DARK / SYSTEM, HERE RATHER THAN IN THE RAIL.
            It is a three-segment pill, and the kit does not collapse it to an
            icon on purpose — its icon set has no sun and no moon. So in the
            sidebar's bottom row it was the widest thing in a 240px rail,
            sitting beside the profile and the collapse control as though
            choosing a theme were a peer of signing out. It is a personal
            preference, so it lives with the person's other ones. `onSelect`
            is stopped because the segments ARE the control: letting the item
            close the menu would shut it on the first click, before anybody
            could see what they had picked. */}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2 font-normal">
          <Palette className="size-4" aria-hidden />
          {t("Appearance")}
        </DropdownMenuLabel>
        <div className="px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
          <ModeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            void auth.logout().then(() => {
              clearAllFormDrafts() // one user's unsaved drafts never leak to the next
              router.replace("/login")
            })
          }
          className="gap-2"
        >
          <LogOut className="size-4" />
          {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
