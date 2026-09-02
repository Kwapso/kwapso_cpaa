"use client"

// THE SIDEBAR'S COLOUR — two cards, shown not described, exactly the shape
// the kit's own Appearance panel draws Theme in (26.05, "a choice that
// changes how the app looks is never a row of pills … one card per option: a
// small picture of the thing itself, the option's name, one line of prose,
// and a mango badge on the one that is set"). Mode and Scale, on either side
// of this section, are the same cards now too — `theme-section.tsx` and
// `scale-section.tsx` copy this file's shape rather than reinventing it.
//
// THREE BECAME TWO, v1.2.28. Client ruling, 2026-09-02, verbatim (it overturns
// the count in D3, "offer teh threee!"): "default spine to mango, but everyone
// can change it during the onboarding or anytime at settings" — the kit cut
// `ink` and `paper` the same day and shipped ONE muted rail, `quiet`, in their
// place. The two cards below are `SpinePicture`'s own `"quiet" | "mango"`
// union now, and the copy is the kit's, verbatim, from
// `compositions/screens/settings.tsx`'s `SPINES` — new words, not the old
// three trimmed to two: with the choice down to a name and its opposite, the
// caption stopped describing a FILL ("Charcoal spine, mango active row.") and
// started describing what the choice is like to live with.
//
// THE CARDS ARE THE KIT'S OWN, not reinvented. `AppearanceOptionGroup` and
// `SpinePicture` are `compositions/screens/settings.tsx`'s own sub-primitives
// — COMPOSITION-MISMATCHES.md names both reusable standalone (`options`, a
// sub-primitive, not the route itself"): the ROUTE around them (`SettingsRoute`,
// its six-tab shape) is what this app has deliberately not adopted, never
// these two parts. The two cards below read exactly as they would inside
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
// browser. MANGO is the fallback (shared/spine.ts) since the client's ruling
// of 2026-09-02 — this section used to say paper here, on the argument that a
// person who had never opened it should keep seeing exactly the rail they
// always had, and that argument was overruled; spine.ts keeps it in full.
//
// THE CARDS ARE DRAWN IN TWO PLACES NOW, FROM ONE `SpineChoice`. The other is
// the onboarding screen, which is the "during the onboarding" half of the same
// ruling. Two copies of two labels and two descriptions is exactly the
// drift R34 exists to stop and that no law catches inside a component, so the
// group is exported and the SECTION around it — heading, prose, save-on-press
// — is what stays here. Onboarding wants none of those: it has no room
// for a heading of its own, and its choice rides the form's one submit rather
// than saving on press.

import * as React from "react"

import { toast } from "@shared/ui/components/sonner/sonner"
import {
  AppearanceOptionGroup,
  SpinePicture,
  type AppearanceOption,
} from "@shared/ui/compositions/screens/settings"

import { toSpine, type Spine } from "../spine"
import { useLanguage } from "./language"

/** THE THREE CARDS AND NOTHING ELSE — no heading, no prose, no save.
 *
 * Both places a person picks a spine draw this: Settings · Appearance through
 * `SpineSection` below, and the onboarding screen
 * (`web/app/onboarding/page.tsx`), which is the "during the onboarding" half of
 * the client's 2026-09-02 ruling. It is a CONTROLLED control and it persists
 * nothing, because the two callers disagree about when the choice is saved —
 * Settings saves on press and can revert a failure, onboarding folds it into
 * the one submit that also writes the name. What they must NOT disagree about
 * is the words and the pictures, which is why they live here once. */
export function SpineChoice({
  /** the spine the cards show as set */
  value,
  /** a different card was pressed */
  onChange,
  /** nothing may be changed (a save in flight, a form busy) */
  disabled = false,
  /** 26.05 draws "In use" on the set card; 27.14 draws "Picked" in onboarding */
  badgeLabel,
  className,
}: {
  value: Spine
  onChange: (spine: Spine) => void
  disabled?: boolean
  badgeLabel: React.ReactNode
  className?: string
}) {
  const { t } = useLanguage()

  /* settings.tsx's own Sidebar cards, verbatim — transcribed from its
     SPINES, the words this app has not adopted the route to draw itself. */
  const options: readonly AppearanceOption[] = [
    {
      value: "mango",
      label: t("Mango"),
      description: t("Warm colour down the sidebar. Easy to find your place."),
      picture: <SpinePicture spine="mango" />,
    },
    {
      value: "quiet",
      label: t("Quiet"),
      description: t("A calm sidebar that lets the work stand out."),
      picture: <SpinePicture spine="quiet" />,
    },
  ]

  return (
    <AppearanceOptionGroup
      className={className}
      options={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(toSpine(next))}
      badgeLabel={badgeLabel}
    />
  )
}

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

  // Local, exactly as ScaleSection keeps its own: the card answers instantly,
  // the session row catches up when `me` is re-read.
  const [chosen, setChosen] = React.useState<Spine>(toSpine(value))
  const [saving, setSaving] = React.useState<Spine | null>(null)
  React.useEffect(() => setChosen(toSpine(value)), [value])

  async function choose(nextSpine: Spine) {
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
        {t("The spine can be mango or quiet. The rest of the app does not change.")}
      </p>
      <SpineChoice
        className="mt-4"
        value={chosen}
        disabled={saving !== null}
        onChange={(next) => void choose(next)}
        badgeLabel={t("In use")}
      />
    </section>
  )
}
