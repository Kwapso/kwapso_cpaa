"use client"

// THE SWITCHER — one component, shown in both apps' Settings.
//
// Four languages, four buttons, no dropdown. A dropdown hides three of the four
// choices behind a click and makes somebody who cannot read the current language
// hunt for the control that fixes that. Everything here is legible to a person
// who does not yet understand a word on the screen: the flag, the language's own
// name for itself, and a tick on the one in force.
//
// OPTIMISTIC, THEN PERSISTED. The click re-renders the app instantly and the
// save follows. If the save fails the language snaps back and says so, in the
// language they were reading a moment ago rather than the one they asked for —
// because the one they asked for is precisely what did not happen.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "sonner"

import { coverage, LANGUAGES, translate, type Language } from "../i18n"
import { useLanguage } from "./language"

export function LanguageSection({
  /** Persist the choice. Both apps pass their own `auth.setLanguage`. */
  save,
  /** Heading style differs slightly between the two Settings screens. */
  className,
}: {
  save: (lang: Language) => Promise<unknown>
  className?: string
}) {
  const { lang, setLang, t } = useLanguage()
  const [saving, setSaving] = React.useState<Language | null>(null)
  const done = React.useMemo(() => coverage(), [])

  async function choose(next: Language) {
    if (next === lang || saving) return
    const previous = lang
    setLang(next) // instant: the screen is already in the new language
    setSaving(next)
    try {
      await save(next)
      // In the language they JUST CHOSE, not the one `t` was bound to when this
      // component rendered. `t` is captured before the optimistic switch, so
      // using it here confirms a change to German in English — which is a small
      // thing that says the feature is skin deep.
      toast.success(translate("Language changed.", next))
    } catch {
      // Back to what they could read. The message is deliberately composed in
      // `previous`, not through the `t` above — telling somebody in Catalan that
      // Catalan failed to load is a joke at their expense.
      setLang(previous)
      toast.error(translate("That didn't save. Try again.", previous))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className={className ?? "animate-rise flex flex-col gap-3"}>
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {t("Language")}
      </h2>
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-muted-foreground text-sm">
          {t("Choose the language you want kwapso in.")}{" "}
          {t("What people type stays in the language they typed it.")}
        </p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const active = l.code === lang
            // English is the source, so it is always complete by definition and
            // saying "100% translated" under it would be noise.
            const pct = l.code === "en" ? null : Math.round((done[l.code] ?? 0) * 100)
            return (
              <Button
                key={l.code}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                disabled={saving !== null}
                aria-pressed={active}
                onClick={() => void choose(l.code as Language)}
                className="gap-2"
              >
                <span aria-hidden>{l.flag}</span>
                <span>{l.native}</span>
                {pct !== null && pct < 100 && (
                  <span className="text-muted-foreground text-xs">{pct}%</span>
                )}
              </Button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
