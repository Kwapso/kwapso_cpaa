"use client"

// LIGHT / DARK / SYSTEM, behind one icon.
//
// The kit's ModeToggle is a three-segment pill it will not collapse to an icon
// (its glyph set has no sun and no moon), so anywhere it sits in a frame it is
// the widest control there. In the portal's header — beside the account
// switcher, the language flag and sign out — it did not fit a 375px phone, and
// a header that does not fit takes the whole PAGE sideways with it.
//
// So the pill goes in a menu, exactly the shape `LanguageMenu` next door
// already uses for the same class of thing: a personal display preference,
// wanted from every screen, about nothing in the client's own data. One icon,
// same size as its neighbours, and the three choices are all still visible the
// moment it opens — which is the trade a dropdown normally gets wrong and does
// not here, because the segments come with it.
//
// The AGENCY app does not use this: its theme control lives in the profile menu
// beside the person's other preferences, and in Settings under the text size.
// The portal has no profile menu and no settings screen, so this is its one place.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@shared/ui/controls/dropdown-menu/dropdown-menu"
import { ModeToggle } from "@shared/ui/controls/mode-toggle/mode-toggle"
import { Palette } from "@shared/ui/icons"

import { useLanguage } from "./language"

export function AppearanceMenu() {
  const { t } = useLanguage()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("Appearance")}>
          <Palette className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-muted-foreground font-normal">
          {t("Appearance")}
        </DropdownMenuLabel>
        {/* The segments ARE the control, so the item must not close the menu on
            the first click — a person would never see what they picked. */}
        <div className="px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
          <ModeToggle />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
