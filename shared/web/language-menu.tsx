"use client"

// THE COMPACT SWITCHER — one control in a header, for a shell that has no
// Settings screen to put a panel on.
//
// The client portal is three screens and a header. Its nav comment is explicit
// that the three destinations never grow and that nothing hides in a menu, so a
// fourth entry called Settings, existing solely to hold one preference, would
// break the rule the shell was designed around. A language belongs beside the
// light/dark toggle instead: both are personal display preferences, neither is
// about the client's own data, and both should be reachable from every screen
// without leaving it.
//
// The behaviour is identical to LanguageSection — optimistic, then persisted,
// and a failure snaps back and says so in the language they could still read.
// The two share the engine and the door; only the shape differs.

import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kwapso/ui/registry/primitives/dropdown-menu/dropdown-menu"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { LANGUAGES, translate, type Language } from "../i18n"
import { useLanguage } from "./language"

export function LanguageMenu({ save }: { save: (lang: Language) => Promise<unknown> }) {
  const { lang, setLang, t } = useLanguage()
  const [saving, setSaving] = React.useState(false)
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  async function choose(next: Language) {
    if (next === lang || saving) return
    const previous = lang
    setLang(next)
    setSaving(true)
    try {
      await save(next)
      toast.success(t("Language changed."))
    } catch {
      setLang(previous)
      toast.error(translate("That didn't save. Try again.", previous))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("Language")} disabled={saving}>
          <span aria-hidden className="text-base leading-none">
            {current.flag}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => void choose(l.code as Language)}
            className="gap-2"
          >
            <span aria-hidden>{l.flag}</span>
            <span className="flex-1">{l.native}</span>
            {l.code === lang && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
