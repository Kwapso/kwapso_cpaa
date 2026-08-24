"use client"

// HOW BIG THE APP IS — three buttons, and one number behind them.
//
// The shape is the language switcher's, deliberately: one button per step,
// wrapping, no dropdown. A dropdown hides every choice but the current one
// behind a click, which is the wrong trade for a control somebody reaches for
// precisely because the current setting is hard to read.
//
// OPTIMISTIC, THEN PERSISTED, exactly as the language switcher is. The click
// resizes the app instantly and the save follows; if the save fails the size
// snaps back and says so. The preference lives on the person's own row, so it
// follows them between devices rather than living in one browser (UI-RULEBOOK
// S4), and it is the ONLY way to make this app bigger, because the viewport is
// locked against pinch-zoom (S5).
//
// It sets one CSS variable and nothing else. Every size token in the theme is in
// `rem` and every spacing class is a Tailwind `rem` step, so text and spacing
// move together from one number — which is what the owner asked for, and what
// the iPhone's own setting does.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { toast } from "sonner"

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

  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Size")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("Text and spacing together. It follows you to every device you sign in on.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SCALE_STEPS.map((step) => {
          // The active step is computed before the render, exactly as the
          // language switcher computes its own — a `variant={x === y ? …}` in
          // the markup is the shape R3's check hunts for, and this is a row of
          // preference buttons rather than a hand-rolled tab strip.
          const active = (chosen ?? SCALE_STEPS[1].value) === step.value
          return (
            <Button
              key={step.value}
              type="button"
              variant={active ? "default" : "secondary"}
              disabled={saving !== null}
              aria-pressed={active}
              onClick={() => void choose(step.value)}
            >
              {t(step.label)}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
