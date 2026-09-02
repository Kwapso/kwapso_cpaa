"use client"

// HOW BIG THE APP IS — three cards, shown not described, and one number
// behind them.
//
// PICTURE CARDS, NOT BUTTONS. This section drew a plain row of buttons for a
// while, on the reasoning that a root font size has no picture worth
// drawing — but the client asked for the same visual treatment `SpineSection`
// already gives Sidebar, which overrides that reasoning outright. The cards
// below are `SpineSection`'s own shape: `AppearanceOptionGroup` +
// `compositions/screens/settings.tsx`'s own `ScalePicture`, a sibling of
// `SpinePicture` drawn for exactly this and never wired up outside the kit's
// own demo until now. This is a RENDER-ONLY change — see below, every piece
// of `chosen`/`saving`/`choose()` is untouched.
//
// OPTIMISTIC, THEN PERSISTED, exactly as the language switcher is. A card
// presses, the size resizes instantly and the save follows; if the save
// fails the size snaps back and says so. The preference lives on the
// person's own row, so it follows them between devices rather than living
// in one browser (UI-RULEBOOK S4), and it is the ONLY way to make this app
// bigger, because the viewport is locked against pinch-zoom (S5).
//
// It sets one CSS variable and nothing else. Every size token in the theme is in
// `rem` and every spacing class is a Tailwind `rem` step, so text and spacing
// move together from one number — which is what the owner asked for, and what
// the iPhone's own setting does.

import * as React from "react"

import { toast } from "@shared/ui/components/sonner/sonner"
import {
  AppearanceOptionGroup,
  ScalePicture,
  type AppearanceOption,
} from "@shared/ui/compositions/screens/settings"

import { SCALE_STEPS, scaleFontSize } from "../scale"
import { useLanguage } from "./language"

/** Put the size on the document. One place, called by the provider on load and
 * by a click before the save, so the screen and the stored preference can never
 * be two different sizes for longer than one request. */
export function applyScale(value: string | null | undefined, door: "agency" | "portal"): void {
  if (typeof document === "undefined") return
  document.documentElement.style.fontSize = `${scaleFontSize(value, door)}px`
}

export function ScaleSection({
  /** what the person currently reads at, from their own session row */
  value,
  /** Persist the choice. The agency app passes its own `auth.setScale`. */
  save,
  /** which front door's baseline the steps mean */
  door = "agency",
  className,
}: {
  value: string | null
  save: (scale: string) => Promise<unknown>
  door?: "agency" | "portal"
  className?: string
}) {
  const { t } = useLanguage()
  // The chosen step is local so the buttons answer instantly; the session row
  // catches up when `me` is re-read. Seeded from the session, and re-seeded if
  // another device changes it while this tab is open.
  const [chosen, setChosen] = React.useState(value)
  const [saving, setSaving] = React.useState<string | null>(null)
  React.useEffect(() => setChosen(value), [value])

  async function choose(next: string) {
    if (next === chosen || saving) return
    const previous = chosen
    setChosen(next)
    applyScale(next, door)
    setSaving(next)
    try {
      await save(next)
      toast.success(t("Size changed."))
    } catch {
      setChosen(previous)
      applyScale(previous, door)
      toast.error(t("That didn't save. Try again."))
    } finally {
      setSaving(null)
    }
  }

  /* 26.05's own Appearance cards, verbatim — transcribed from settings.tsx's
     SCALES, the words this app has not adopted the route to draw itself.
     The kit's own array keys its middle step "default" and calls it
     "Regular"; this app's own middle step has always been stored as
     `"comfortable"` (`shared/scale.ts`, `db/core/0026_user_scale.sql`) — the
     SAME step, a different key, because the column shipped long before this
     card row did. Only the WORD and the picture move: `value` below is
     still `SCALE_STEPS[*].value`, which is what `choose()`, `applyScale` and
     the session row all key off. */
  const options: readonly AppearanceOption[] = [
    {
      value: SCALE_STEPS[0].value,
      label: t("Compact"),
      description: t("13px root, tight rows."),
      picture: <ScalePicture step="compact" />,
    },
    {
      value: SCALE_STEPS[1].value,
      label: t("Regular"),
      description: t("15px root, the default in both doors."),
      picture: <ScalePicture step="default" />,
    },
    {
      value: SCALE_STEPS[2].value,
      label: t("Large"),
      description: t("17px root, roomy rows."),
      picture: <ScalePicture step="large" />,
    },
  ]

  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Size")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("Text and spacing together. It follows you to every device you sign in on.")}
      </p>
      <AppearanceOptionGroup
        className="mt-4"
        options={options}
        value={chosen ?? SCALE_STEPS[1].value}
        disabled={saving !== null}
        onValueChange={(next) => void choose(next)}
        badgeLabel={t("In use")}
      />
    </section>
  )
}
