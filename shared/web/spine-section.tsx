"use client"

// THE SIDEBAR'S COLOUR — three cards, shown not described, exactly the shape
// the kit's own Appearance panel draws Theme in (26.05, "a choice that
// changes how the app looks is never a row of pills … one card per option: a
// small picture of the thing itself, the option's name, one line of prose,
// and a mango badge on the one that is set"). Scale, directly above this
// section, is words instead of pictures because a root font size has no
// picture worth drawing; a rail's fill does, and the kit already drew one.
//
// THE CARDS ARE THE KIT'S OWN, not reinvented. `AppearanceOptionGroup` and
// `SpinePicture` are `compositions/screens/settings.tsx`'s own sub-primitives
// — COMPOSITION-MISMATCHES.md names both reusable standalone (`options`, a
// sub-primitive, not the route itself"): the ROUTE around them (`SettingsRoute`,
// its six-tab shape) is what this app has deliberately not adopted, never
// these two parts. The three cards below read exactly as they would inside
// the kit's own Settings composition, words and pictures both.
//
// OPTIMISTIC, THEN PERSISTED — `ScaleSection`'s own shape, directly above
// this section, copied rather than reinvented. A card presses, the choice is
// live immediately (app-shell.tsx reads this same preference off
// `active.user.spine` and repaints the rail on its next render — there is no
// document-level side effect to fire here, unlike `applyScale`, because the
// spine is an ordinary React prop, not a CSS variable), and the save follows;
// if it fails the choice reverts and says so. It lives on the person's own
// row for the same reason scale does (UI-RULEBOOK S4's argument, one
// preference along): it should follow them between devices, not live in one
// browser. PAPER is the fallback (shared/spine.ts) so a person who has never
// opened this section keeps seeing exactly the rail they always had.

import * as React from "react"

import { toast } from "@shared/ui/components/sonner/sonner"
import {
  AppearanceOptionGroup,
  SpinePicture,
  type AppearanceOption,
} from "@shared/ui/compositions/screens/settings"

import { toSpine, type Spine } from "../spine"
import { useLanguage } from "./language"

export function SpineSection({
  /** what the rail paints today, from the person's own session row */
  value,
  /** Persist the choice. The agency app passes its own `auth.setSpine`. */
  save,
  className,
}: {
  value: string | null
  save: (spine: Spine) => Promise<unknown>
  className?: string
}) {
  const { t } = useLanguage()

  /* 26.05's own Sidebar cards, verbatim — transcribed from settings.tsx's
     SPINES, the words this app has not adopted the route to draw itself. */
  const options: readonly AppearanceOption[] = [
    {
      value: "ink",
      label: t("Ink"),
      description: t("Charcoal spine, mango active row."),
      picture: <SpinePicture spine="ink" />,
    },
    {
      value: "paper",
      label: t("Paper"),
      description: t("Soft-paper spine, the quiet one."),
      picture: <SpinePicture spine="paper" />,
    },
    {
      value: "mango",
      label: t("Mango"),
      description: t("Full brand spine, charcoal active row."),
      picture: <SpinePicture spine="mango" />,
    },
  ]

  // Local, exactly as ScaleSection keeps its own: the card answers instantly,
  // the session row catches up when `me` is re-read.
  const [chosen, setChosen] = React.useState<Spine>(toSpine(value))
  const [saving, setSaving] = React.useState<Spine | null>(null)
  React.useEffect(() => setChosen(toSpine(value)), [value])

  async function choose(next: string) {
    const nextSpine = toSpine(next)
    if (nextSpine === chosen || saving) return
    const previous = chosen
    setChosen(nextSpine)
    setSaving(nextSpine)
    try {
      await save(nextSpine)
      toast.success(t("Sidebar changed."))
    } catch {
      setChosen(previous)
      toast.error(t("That didn't save. Try again."))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Sidebar")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("The spine can be ink, paper or mango. The rest of the app does not change.")}
      </p>
      <AppearanceOptionGroup
        className="mt-4"
        options={options}
        value={chosen}
        disabled={saving !== null}
        onValueChange={(next) => void choose(next)}
        badgeLabel={t("In use")}
      />
    </section>
  )
}
