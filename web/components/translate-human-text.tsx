"use client"

// READING WHAT SOMEBODY ELSE TYPED, IN YOUR OWN LANGUAGE — one hook, one button,
// every screen that shows words a person wrote.
//
// THE LINE, AND WHY THIS IS THE ONLY PLACE IT IS CROSSED. shared/i18n.ts states
// the whole design in two sentences: what WE wrote is translated at build time
// and costs nothing to show, and what a PERSON typed is never translated,
// because those are somebody else's words. Nothing in this file changes that.
// It is the one place a READER may cross the line, for themselves, on purpose,
// by pressing a button — and what comes back is never written to the row. A
// German client's ticket stays a German client's ticket; Aurora simply gets to
// read it.
//
// ONE PRESS IS ONE REQUEST, FOR THE WHOLE SCREEN. The hook takes every piece of
// human-typed text the screen shows — the ticket AND every reply on it, not one
// field — and sends them as one array. A request per paragraph would be the same
// answer at four times the price, and it would make the cost of opening a ticket
// depend on how long the conversation on it got.
//
// AND IT IS PAID FOR ONCE. Every translation lands in a cache keyed by the
// language and the exact words, shared by the whole app for as long as the tab
// is open — so putting the original back and asking again is free, a re-render
// is free, and coming back to the ticket after looking at something else is
// free. Only the first press ever spends anything.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Languages } from "lucide-react"

import { ApiFailure, dataOps } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { useLanguage } from "@shared/web/language"
import { TRANSLATE_MAX_TEXTS } from "@shared/workers/limits"

/** Everything already translated this session: the language and the exact words
 * asked about → the words in that language.
 *
 * Module-level rather than component state on purpose — the same person walks
 * back into the same ticket ten times a day, and a cache that died with the
 * component would charge them for each of those. A language code is two letters
 * and never contains a pipe, so the key cannot be ambiguous.
 *
 * BOUNDED, because it holds whole paragraphs and a long day is a lot of them. A
 * Map keeps its insertion order, so the oldest entry is the first key. */
const CACHE = new Map<string, string>()
const CACHE_MAX = 500

const cacheKey = (lang: string, text: string) => `${lang}|${text}`

function remember(lang: string, original: string, translated: string): void {
  CACHE.set(cacheKey(lang, original), translated)
  while (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value
    if (oldest === undefined) break
    CACHE.delete(oldest)
  }
}

export type HumanTranslation = {
  /** Whether to offer the button at all: there are words, and the reader holds
   * the right the door itself gates on. */
  offered: boolean
  /** Showing the translation rather than what was typed. */
  showing: boolean
  busy: boolean
  /** Press. Off → on costs one unit the first time and nothing after it; on →
   * off is always free. */
  toggle: () => void
  /** The words to render: the translation while `showing`, otherwise exactly
   * what the person typed. Safe to call with null — it answers an empty string. */
  of: (text: string | null | undefined) => string
}

/**
 * @param teamId whose AI allowance the press would spend
 * @param texts  every piece of human-typed text ON THIS SCREEN, in any order.
 *               Nulls and blanks are ignored, so a caller can hand over optional
 *               fields without filtering them first.
 */
export function useHumanTranslation(
  teamId: string,
  texts: (string | null | undefined)[]
): HumanTranslation {
  const { lang, t } = useLanguage()
  const { can } = usePermissions(teamId)
  const [showing, setShowing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // Bumped when the cache gains entries, so the screen re-renders with them. The
  // cache itself is not React state — it outlives every component that reads it.
  const [, bumpCache] = React.useReducer((n: number) => n + 1, 0)

  // `texts` is a fresh array on every render, so the memo hangs off the WORDS
  // rather than the array's identity — and it reads them back out of that same
  // string, so there is no second copy to disagree with the first.
  const key = JSON.stringify(texts)
  const pieces = React.useMemo(() => {
    const parsed = JSON.parse(key) as (string | null | undefined)[]
    const trimmed = parsed.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
    return [...new Set(trimmed)]
  }, [key])

  // A LANGUAGE CHANGE IS A DIFFERENT QUESTION. Somebody who switches to Spanish
  // while looking at a translation should not keep reading the German one, so
  // the view goes back to what was typed and they can ask again.
  React.useEffect(() => setShowing(false), [lang])

  const of = React.useCallback(
    (text: string | null | undefined): string => {
      if (!text) return ""
      if (!showing) return text
      return CACHE.get(cacheKey(lang, text.trim())) ?? text
    },
    [lang, showing]
  )

  const toggle = React.useCallback(() => {
    if (busy) return
    if (showing) {
      setShowing(false)
      return
    }
    // Everything this screen still needs. Nothing already answered is sent
    // again, so a second look at the same ticket is free.
    const missing = pieces
      .filter((piece) => !CACHE.has(cacheKey(lang, piece)))
      .slice(0, TRANSLATE_MAX_TEXTS)
    if (missing.length === 0) {
      setShowing(true)
      return
    }
    setBusy(true)
    void dataOps
      .translateText(missing, lang)
      .then(({ translations, partial }) => {
        missing.forEach((piece, i) => {
          const got = translations[i]
          if (typeof got === "string" && got !== "") remember(lang, piece, got)
        })
        bumpCache()
        setShowing(true)
        // WHAT IT COULD NOT DO IS SAID, not hidden. The door hands back the
        // original for anything it could not translate, which is the right thing
        // to SHOW and the wrong thing to show SILENTLY — a reader looking at a
        // paragraph of German after pressing Translate would otherwise conclude
        // the button is broken rather than that this piece was too long.
        if (partial) toast.info(t("Some of this couldn't be translated, so it's showing as it was written."))
      })
      .catch((err: unknown) => {
        toast.error(err instanceof ApiFailure ? err.message : "Couldn't translate that.")
      })
      .finally(() => setBusy(false))
  }, [busy, lang, pieces, showing, t])

  return {
    // `agent:create` is what the door gates on, so the button offers exactly
    // what the server would accept rather than a refusal one press later.
    offered: pieces.length > 0 && can("agent", "create"),
    showing,
    busy,
    toggle,
    of,
  }
}

/** The button, wherever the screen has room for it. Small and quiet: this is an
 * aid, not the point of the screen. */
export function TranslateAction({
  translation,
  className,
}: {
  translation: HumanTranslation
  className?: string
}) {
  const { t } = useLanguage()
  if (!translation.offered) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={translation.busy}
      onClick={translation.toggle}
    >
      <Languages className="size-3.5" />
      {translation.busy
        ? t("Translating…")
        : translation.showing
          ? t("Show original")
          : t("Translate")}
    </Button>
  )
}
