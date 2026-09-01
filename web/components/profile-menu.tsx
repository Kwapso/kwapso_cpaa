"use client"

// The profile menu — your name/email, links to your profile, Settings and
// Kwapso (the agency itself), appearance, and sign out. Extracted from the
// app shell so each stays small. Menu opacity is handled by the library
// dropdown now (UI-GAPS row 5).

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@shared/ui/components/button/button"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@shared/ui/components/tooltip/tooltip"
import { BadgeCheck, LogOut, MoreHorizontal, Palette, Settings, UserRound } from "@shared/ui/foundations/icons"

import { auth } from "@/lib/api"
import { personName, personInitials } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { clearAllFormDrafts } from "@shared/web/use-form-draft"
import { forgetEverything } from "@/lib/nav-memory"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function ProfileMenu({
  active,
  compact = false,
  trigger,
  tooltip,
}: {
  active: ActiveTeam
  /** An icon trigger rather than the avatar — for a spot where the real face
   * is already shown elsewhere (the kit's `Rail` member chip, app-shell.tsx),
   * so a second avatar beside it would read as two people rather than one
   * menu. Same content either way; only the trigger changes. Ignored when
   * `trigger` is supplied. */
  compact?: boolean
  /** A caller-supplied trigger element, for a spot needing its OWN exact
   * avatar treatment neither built-in trigger covers — the collapsed rail's
   * branded, `--avatar-md` chip (app-shell.tsx): `compact`'s glyph carries no
   * photo at all, and the default trigger above is a plain `size-8` avatar,
   * not the rail's active-fill tinted one. The menu itself is identical
   * either way; only the trigger swaps, same as `compact` already did. */
  trigger?: React.ReactNode
  /** Wraps `trigger` in the kit's own `Tooltip`, showing this label on
   * hover/focus — for an icon-only trigger with no visible name beside it,
   * the same treatment every other collapsed-rail control already gets
   * (`StandaloneNavItem`, the collapse toggle). Ignored without `trigger`. */
  tooltip?: string
}) {
  const t = useT()
  const router = useRouter()
  const { user } = active
  const menuTrigger =
    trigger ??
    (compact ? (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-pill"
        aria-label={t("Account menu")}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    ) : (
      <Button variant="ghost" size="icon" className="size-8 rounded-pill p-0">
        <Avatar className="size-8">
          {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={t("You")} />}
          <AvatarFallback className="text-xs">
            {personInitials(user?.firstName, user?.lastName)}
          </AvatarFallback>
        </Avatar>
      </Button>
    ))
  // THE NESTED-TRIGGER COMPOSITION, ONLY WHEN A TOOLTIP IS ASKED FOR. Radix's
  // `asChild` clones onto its single child, and that child may itself be
  // another `asChild` trigger — the standard "Tooltip wrapping a menu
  // trigger" shape — but only in THIS order: `TooltipTrigger` outermost,
  // `DropdownMenuTrigger` innermost, both wrapping the one real button. A
  // `<Tooltip>` handed in as `DropdownMenuTrigger`'s own child (the other
  // order) would not work: `Tooltip`'s own root renders no DOM node of its
  // own for the click props to land on.
  const dropdownTrigger = <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
  return (
    <DropdownMenu>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{dropdownTrigger}</TooltipTrigger>
          <TooltipContent side="right">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        dropdownTrigger
      )}
      <DropdownMenuContent align="end" className="w-56">
        {/* THE KIT'S OWN DropdownMenuLabel IS AN EYEBROW — micro, uppercase,
            tertiary ink (shared/ui/components/dropdown-menu/dropdown-menu.tsx),
            built for a section heading like "Account", not a person's own
            name and address. `shared/ui/` is vendored and pinned (a hand-edit
            fails web/test/vendored-kit.test.ts), so the two spans below
            override the inherited properties on THEMSELVES rather than on the
            label: `normal-case` cancels the inherited uppercase transform
            (client, 31 Aug 2026: "my name and email should not be all caps"),
            and the name additionally reaches for `--ink-secondary` — the same
            darker-than-muted tier the rail's own chip text uses
            (app-shell.tsx's `RAIL_CONTENT_OVERRIDES`) — instead of the
            eyebrow's `--ink-tertiary` (client, same day: "make the name on
            this menu darker also"). The email keeps its own
            `text-muted-foreground`, already an explicit override and already
            the tone asked for. */}
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-[var(--ink-secondary)] normal-case truncate">
            {personName({ firstName: user?.firstName, lastName: user?.lastName })}
          </span>
          <span className="text-muted-foreground normal-case truncate text-xs font-normal">
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
        {/* THE AGENCY ITSELF — a rail SECTION for part of one day (client, 31
            Aug 2026: "create a new section called kwapso...") and then not:
            "remove the whole kwapso section from the sidebar and move with
            your profile and settings," the same day. One entry, not three —
            `KwapsoScreen`'s own tab strip (Details · The team · Brand
            library) is how the section's other two rows stay reachable
            without a second and third row here, the same shape `Settings`
            above already has for its own page. */}
        <DropdownMenuItem onSelect={() => softNavigate("/kwapso")} className="gap-2">
          <BadgeCheck className="size-4" />
          {t("Kwapso")}
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
              // …and neither do their places. Signing out is a client-side route
              // change, not a reload, so the nav memory would otherwise still be
              // in this document when the next person signs in and would hand
              // them somebody else's trail. Same sentence as the line above it.
              forgetEverything()
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
