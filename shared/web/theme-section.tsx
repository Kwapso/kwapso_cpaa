"use client"

// LIGHT, DARK OR THE MACHINE'S OWN — three cards, shown not described, the
// same visual treatment `SpineSection` and `ScaleSection` give their own
// choices. This REPLACES `AppearanceSection`'s plain `<ModeToggle />` on the
// Settings page only — the profile menu keeps the plain segmented control,
// because that context wants the compact toggle, not a three-card grid.
//
// THE CARDS ARE THE KIT'S OWN. `AppearanceOptionGroup` and `ThemePicture` are
// `compositions/screens/settings.tsx`'s own sub-primitives, lifted standalone
// exactly as `SpineSection` lifts `AppearanceOptionGroup` and `SpinePicture`
// — see that file's own header for the fuller reasoning.
//
// DEVICE-LOCAL, NOT ON THE PERSON'S ROW. `AppearanceSection`'s own header
// said it plainly: "It is remembered on this device." So unlike
// `SpineSection` and `ScaleSection` there is no `value`/`save` pair here —
// this component owns its own state, seeded from `localStorage` and applied
// straight to the document, using exactly the mechanism `ModeToggle` itself
// documents as its public contract: the `data-theme` attribute on
// `document.documentElement`, values `"light"` / `"dark"` (system removes
// the attribute entirely), `documentElement.style.colorScheme` set
// alongside it, and the `"theme"` `localStorage` key. Applying that
// mechanism directly here — rather than steering a hidden `<ModeToggle
// mode={...} />` through its controlled props — does not fork it: the file's
// own comments state these exact tokens as the contract `tokens.css` §6/§7
// depend on, so anything that keeps to them is a legal second writer, not a
// second mechanism.
//
// SSR-GUARDED THE SAME WAY `ModeToggle` GUARDS ITSELF. Its own
// `getServerSnapshot` answers "system" for the server render and the
// hydrating first paint, and only reads storage afterwards. This component
// does the same: `chosen` starts at `"system"`, and the real stored value is
// read in a `useEffect` — after mount, never during render — so there is
// nothing for React to flag as a hydration mismatch.

import * as React from "react"

import {
  AppearanceOptionGroup,
  ThemePicture,
  type AppearanceOption,
} from "@shared/ui/compositions/screens/settings"
import { type ThemeMode } from "@shared/ui/components/mode-toggle/mode-toggle"

import { useLanguage } from "./language"

/** The one attribute name `ModeToggle`'s own header states tokens.css §6 and
 * §7 are written against. Transcribed rather than imported: the kit exports
 * the component, not this constant. */
const THEME_ATTRIBUTE = "data-theme"

/** The `localStorage` key `ModeToggle` itself reads and writes by default,
 * and the one the head-script snippet in its header comment agrees with. */
const STORAGE_KEY = "theme"

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

/** What is stored, guarded for SSR exactly as `ModeToggle`'s own
 * `readStoredMode` guards it: no `window`, an unreadable key, or a value the
 * code does not recognise all read as "system" — the same discipline that
 * lets clearing site data return a reader to system rather than to a guess. */
function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    return "system"
  }
}

/** Put the choice on the document. `light`/`dark` write the attribute and the
 * matching `colorScheme`; `system` removes both, so the media query in
 * tokens.css keeps deciding, including when the machine flips at dusk. */
function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (mode === "system") {
    root.removeAttribute(THEME_ATTRIBUTE)
    root.style.colorScheme = "light dark"
  } else {
    root.setAttribute(THEME_ATTRIBUTE, mode)
    root.style.colorScheme = mode
  }
}

export function ThemeSection({ className }: { className?: string }) {
  const { t } = useLanguage()

  /* 26.05's own Appearance cards, verbatim — transcribed from settings.tsx's
     THEMES, the words this app has not adopted the route to draw itself. */
  const options: readonly AppearanceOption[] = [
    {
      value: "light",
      label: t("Light"),
      description: t("Off-beige paper, charcoal ink."),
      picture: <ThemePicture tone="light" />,
    },
    {
      value: "dark",
      label: t("Dark"),
      description: t("Unlit paper, off-beige type."),
      picture: <ThemePicture tone="dark" />,
    },
    {
      value: "system",
      label: t("System"),
      description: t("Follow the machine, switch at dusk."),
      picture: <ThemePicture tone="system" />,
    },
  ]

  // Seeded "system" for the server render and the hydrating first paint —
  // the same value `ModeToggle`'s own `getServerSnapshot` answers with —
  // and only ever read from storage afterwards, in an effect.
  const [chosen, setChosen] = React.useState<ThemeMode>("system")
  React.useEffect(() => {
    setChosen(readStoredMode())
  }, [])

  // Applies immediately: there is no server round trip for a device-local
  // preference, so the card's own selection state IS the source of truth
  // the moment it is pressed — no `saving` state to hold in between.
  function choose(next: string) {
    if (!isThemeMode(next) || next === chosen) return
    setChosen(next)
    applyThemeMode(next)
    if (typeof window !== "undefined") {
      try {
        if (next === "system") window.localStorage.removeItem(STORAGE_KEY)
        else window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storage refused (private mode, blocked storage). The attribute
        // above still landed, so the choice holds for this page view; it
        // just will not survive a reload — the same trade `ModeToggle`
        // itself makes, and swallows the same way.
      }
    }
  }

  return (
    <section className={className}>
      <h2 className="text-lg font-medium">{t("Appearance")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {t("Light, dark, or whatever this device is set to. It is remembered on this device.")}
      </p>
      <AppearanceOptionGroup
        className="mt-4"
        options={options}
        value={chosen}
        onValueChange={choose}
        badgeLabel={t("In use")}
      />
    </section>
  )
}
