"use client"

// THE LANGUAGE, ON THE CLIENT — one provider, both front doors.
//
// It lives in shared/web/ beside BrandTheme for the same reason that does: the
// agency app and the client portal are two views of one system, and a person who
// reads Spanish reads Spanish in whichever one they open. Two copies of this
// would be two chances for the two apps to disagree about what a word means.
//
// WHERE THE LANGUAGE COMES FROM. `SessionUser.language`, which arrives with
// `/api/auth/me` and is therefore already in hand before the first screen paints
// — no extra request, no flash of English, nothing to wait on. A person who has
// never chosen has `null`, which `toLanguage` reads as English.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not touch `document.lang`, it does
// not re-route, and it does not re-mount the tree. Changing language is a React
// state change and the screen simply re-renders in the new words, which is why a
// switcher can be instant and why a mid-form change does not lose the form.

import * as React from "react"

import { DEFAULT_LANGUAGE, translator, toLanguage, type Language, type Vars } from "../i18n"

type Ctx = {
  /** The language in force right now. */
  lang: Language
  /** Translate. `t("Save")`, or `t("Invited {email}.", { email })`. */
  t: (english: string, vars?: Vars) => string
  /** Switch, optimistically. The caller persists it; this is the instant part. */
  setLang: (next: Language) => void
}

// The default is a WORKING translator rather than a throw. A component rendered
// outside the provider (a test, a storybook, an error boundary that unmounted
// its parent) shows English instead of crashing — the whole design of this seam
// is that a missing translation degrades to a sentence.
const LanguageContext = React.createContext<Ctx>({
  lang: DEFAULT_LANGUAGE,
  t: translator(DEFAULT_LANGUAGE),
  setLang: () => {},
})

export function LanguageProvider({
  /** `SessionUser.language` — null for somebody who never chose. */
  value,
  children,
}: {
  value: string | null | undefined
  children: React.ReactNode
}) {
  const fromSession = toLanguage(value)
  const [lang, setLang] = React.useState<Language>(fromSession)

  // The session is the truth. When `me` is re-pulled — after the switcher saves,
  // or after the person changed it on their phone and the profile ping brought
  // it here — the provider follows it. Guarded on inequality so an ordinary
  // re-render does not fight the optimistic state a click just set.
  React.useEffect(() => {
    setLang((current) => (current === fromSession ? current : fromSession))
  }, [fromSession])

  const ctx = React.useMemo<Ctx>(
    () => ({ lang, setLang, t: translator(lang) }),
    [lang]
  )

  return <LanguageContext.Provider value={ctx}>{children}</LanguageContext.Provider>
}

/** What every screen calls. `const { t } = useLanguage()`. */
export function useLanguage(): Ctx {
  return React.useContext(LanguageContext)
}

/** The shorthand, for a component that only translates and never switches. */
export function useT(): (english: string, vars?: Vars) => string {
  return React.useContext(LanguageContext).t
}
