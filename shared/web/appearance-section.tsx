"use client"

// LIGHT, DARK OR WHATEVER THE PHONE IS DOING — a settings section, and the same
// shape as the Size section directly above it.
//
// WHY IT IS HERE AND NOT IN THE CHROME. It is a three-segment control the kit
// will not collapse to an icon (its glyph set has no sun and no moon), so
// wherever it sat in the frame it was the widest thing there. In the desktop
// rail it was wider than the rail. In the mobile header it pushed the avatar off
// the edge and took the whole PAGE sideways with it — which is the horizontal
// scroll the owner kept reporting, and the reason it kept coming back: a
// whole-page symptom with one local cause.
//
// It is also, plainly, a preference. It belongs where the other preference is:
// "just show it under size, nowhere else on the settings page" — the owner, and
// he is right. It stays in the profile menu as well, because that is where a
// person reaches for it mid-task without wanting to leave the screen they are on.
//
// IT OWNS NO STATE. The kit's ModeToggle writes `data-theme` and remembers the
// choice itself; this is a heading, a sentence and a place to put it.

import * as React from "react"

import { ModeToggle } from "@shared/ui/components/mode-toggle/mode-toggle"

import { useLanguage } from "./language"

export function AppearanceSection({ className }: { className?: string }) {
  const { t } = useLanguage()
  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Appearance")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("Light, dark, or whatever this device is set to. It is remembered on this device.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ModeToggle />
      </div>
    </section>
  )
}
