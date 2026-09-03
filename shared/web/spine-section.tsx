"use client"

// THE APP'S BACKGROUND — three cards, shown not described, exactly the shape
// the kit's own Appearance panel draws Theme in (26.05, "a choice that
// changes how the app looks is never a row of pills … one card per option: a
// small picture of the thing itself, the option's name, one line of prose,
// and a mango badge on the one that is set"). Mode and Scale, on either side
// of this section, are the same cards now too — `theme-section.tsx` and
// `scale-section.tsx` copy this file's shape rather than reinventing it.
//
// THREE, CUT TO TWO, THEN REVERSED BACK TO THREE. v1.2.28 (2026-09-02) cut
// `ink` and `paper` to one muted rail, `quiet`, the same day the client ruled
// "default spine to mango, but everyone can change it during the onboarding
// or anytime at settings" (that half of the ruling is untouched — see
// shared/spine.ts). The client then reversed the cut, verbatim, 2026-09-03:
// "you know, i changed my mind. i want to go back to the 3 options (sorry)"
// — and explained why, which is the point of the reversal: "my goal is that
// in light i can choose to have a 'dark' background option". Appearance
// decides light or dark; Background decides the colour behind everything;
// Ink is how a person running a LIGHT app gets a dark window. The three
// cards below are `SpinePicture`'s own `"ink" | "paper" | "mango"` union
// again, and the copy is the kit's, verbatim, from
// `compositions/screens/settings.tsx`'s `SPINES` — unchanged from before
// v1.2.28, because the cut never touched what the surviving option (mango)
// said about itself.
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
// browser. MANGO is the fallback (shared/spine.ts) since the client's ruling
// of 2026-09-02 — this section used to say paper here, on the argument that a
// person who had never opened it should keep seeing exactly the rail they
// always had, and that argument was overruled; spine.ts keeps it in full.
//
// RENAMED FROM "Sidebar" TO "Background", client instruction (verbatim: "on
// settings, we need to rename that last section — it's no longer the sidebar
// but the ground/background (you choose the word)"). The fill this section
// picks paints the rail, the ground around the floating content card, and
// everything else behind the app — not one rail any more — so the heading,
// the helper line and both card captions below said "sidebar" for a scope the
// choice had already outgrown. The word is checked against `shared/glossary.ts`
// (R34) and does not collide with an existing term. The kit's own copy
// (`compositions/screens/settings.tsx`'s `FIELD_LABELS`/`FIELD_HELP`/`SPINES`)
// carries the same words now, verbatim, per the note above.
//
// THE CARDS ARE DRAWN IN TWO PLACES NOW, FROM ONE `SpineChoice`. The other is
// the onboarding screen, which is the "during the onboarding" half of the same
// ruling. The group is exported and the SECTION around it — heading, prose,
// save-on-press — is what stays here. Onboarding wants none of those: it has
// no room for a heading of its own, and its choice rides the form's one
// submit rather than saving on press.
//
// AND ONBOARDING WANTS SHORTER WORDS, WHICH IS THE KIT'S OWN SPLIT, NOT ONE
// INVENTED HERE. `compositions/screens/settings.tsx` and
// `compositions/screens/onboarding.tsx` each carry their own `SPINES` array —
// the same three names, two different lengths of caption — because a
// one-screen sign-up has less room than a settings panel does; the kit's own
// onboarding composition already draws the shorter three. `SpineChoice`'s
// `short` prop switches between the two verbatim transcriptions below, so the
// two callers can disagree about caption LENGTH (the kit's own choice) while
// staying unable to disagree about the NAMES, the pictures, or the order —
// the drift R34 exists to stop, and the only drift no law catches inside a
// component.

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
 * is the names, the pictures and the order, which is why those live here
 * once; the caption LENGTH is the one thing the kit itself lets differ (see
 * `short` below), so this file carries both of the kit's own transcriptions
 * rather than picking one. */
export function SpineChoice({
  /** the spine the cards show as set */
  value,
  /** a different card was pressed */
  onChange,
  /** nothing may be changed (a save in flight, a form busy) */
  disabled = false,
  /** 26.05 draws "In use" on the set card; 27.14 draws "Picked" in onboarding */
  badgeLabel,
  /** onboarding's captions — `compositions/screens/onboarding.tsx`'s own
   * shorter SPINES, verbatim, not settings.tsx's longer ones truncated here. */
  short = false,
  className,
}: {
  value: Spine
  onChange: (spine: Spine) => void
  disabled?: boolean
  badgeLabel: React.ReactNode
  short?: boolean
  className?: string
}) {
  const { t } = useLanguage()

  /* settings.tsx's own Background cards, verbatim — transcribed from its
     SPINES, the words this app has not adopted the route to draw itself. */
  const settingsOptions: readonly AppearanceOption[] = [
    {
      value: "ink",
      label: t("Ink"),
      description: t("A dark background of its own, whatever your light or dark setting is."),
      picture: <SpinePicture spine="ink" />,
    },
    {
      value: "paper",
      label: t("Paper"),
      description: t("A calm, light background that lets the work stand out."),
      picture: <SpinePicture spine="paper" />,
    },
    {
      value: "mango",
      label: t("Mango"),
      description: t("Warm colour behind the whole app. Easy to find your place."),
      picture: <SpinePicture spine="mango" />,
    },
  ]

  /* onboarding.tsx's own shorter Background cards, verbatim — transcribed
     from its own SPINES, same names and pictures, fewer words. */
  const onboardingOptions: readonly AppearanceOption[] = [
    {
      value: "ink",
      label: t("Ink"),
      description: t("Dark, whatever your theme."),
      picture: <SpinePicture spine="ink" />,
    },
    {
      value: "paper",
      label: t("Paper"),
      description: t("Calm, and out of the way."),
      picture: <SpinePicture spine="paper" />,
    },
    {
      value: "mango",
      label: t("Mango"),
      description: t("Warm, and easy to find."),
      picture: <SpinePicture spine="mango" />,
    },
  ]

  return (
    <AppearanceOptionGroup
      className={className}
      options={short ? onboardingOptions : settingsOptions}
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
      toast.success(t("Background changed."))
    } catch {
      setChosen(previous)
      toast.error(t("That didn't save. Try again."))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Background")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("Three looks for the whole app, not just the rail.")}
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
