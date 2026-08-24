"use client"

// THE ONLY WAY TO WRITE A LINK TO A PLACE INSIDE THE APP.
//
// THE BUG IT EXISTS FOR. The whole post-auth app is ONE shell that mounts once
// and never unmounts (deep-link-screen.tsx), and every move inside it is a
// History-API push through `softNavigate` — no reload, warm cache, a running
// agent left alone. A plain `<a href="/t/…">` opts out of all of that: the
// browser throws the document away and fetches a new one, every module re-runs
// from nothing, the in-memory session cache resets, and the boot mark plays
// again because "no session yet" has become true a second time.
//
// It happened three times. First to the knowledge base, which was missing from
// TOP_LEVEL_MODULES so every tap on it left the History API (the note is still
// in web/components/deep-link/route.ts). Then to "Manage dropdowns", which the
// owner could reproduce on demand — "I can see the app reload because I see the
// boot loading animation". Then to the internal rate card, whose own comment
// says it copied the dropdowns link. Three occurrences, one class.
//
// WHY THE EXISTING CHECK MISSED TWO OF THEM. `web/test/shell-nav.test.ts` reads
// six HAND-LISTED files for one spelling of the mistake, `router.push`. A bare
// anchor is a different spelling, and two hundred components are not on the
// list. That is R21's lesson in a different module: enumerate by what NAVIGATES,
// never by a list somebody maintains.
//
// SO THE SHAPE IS THE FIX. There is now one component to write an in-app link
// with, and a rule (`web/test/shell-nav.test.ts`, in-app-anchors) that reads
// EVERY component off disk and fails on any raw anchor whose href points inside
// the app. A new link is either this component or a red build.
//
// IT IS A REAL ANCHOR, deliberately. A button cannot be middle-clicked into a
// new tab, cannot be copied as an address, and tells a screen reader the wrong
// thing. So the href is real and only a plain left click is taken — a modified
// click is the browser's, exactly as it would be on any other link.

import * as React from "react"

import { softNavigate } from "@/lib/nav"
import { safeHref } from "@shared/web/rich-text"

export function InAppLink({
  href,
  className,
  children,
  onNavigate,
}: {
  /** A path inside the app — "/t/<teamId>/…" or a top-level module page. */
  href: string
  className?: string
  children: React.ReactNode
  /** The host's own `go()`, when the caller has one. Falls back to the shared
   * bus, which resolves to the same function once the shell has registered it. */
  onNavigate?: (path: string) => void
}) {
  // THROUGH THE URL SEAM, even though every caller builds this from a literal
  // and a ULID. The rule is positional on purpose (web/test/rich-text.test.ts):
  // a URL that reaches an href without passing the checker is the shape that
  // eventually carries one somebody typed, and this component is now the single
  // place every in-app link is written — so it is the single place that would
  // carry it everywhere. The fallback is Home rather than nothing, because a
  // link that renders with no destination is a dead control.
  const safe = safeHref(href) ?? "/home"
  return (
    <a
      href={safe}
      onClick={(e) => {
        // A modified click (new tab, new window, download) belongs to the
        // browser — only a plain left click is ours to intercept.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        ;(onNavigate ?? softNavigate)(safe)
      }}
      className={className}
    >
      {children}
    </a>
  )
}
