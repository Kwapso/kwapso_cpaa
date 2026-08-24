"use client"

// APP TILES — one system, as a thing you recognise rather than a line you read.
//
// UI-RULEBOOK K9 allows a card grid exactly where a record carries an image, and
// G3 says the type mark sits in a rounded square where a logo would. An app has
// both, and since 0037_app_logo it has the second one for real: the client's own
// mark where they have one, the stage mark where they do not. So the square is
// the tile's subject and the words underneath are two lines at most — the name,
// and the client (K1).
//
// FLAT FILL, NO BORDER, NO HOVER LIFT (C2): the separation between a tile and
// the page is three per cent of lightness, which is the brand's whole surface
// system. The one motion is the 200ms house curve on the background, which is
// the interaction feedback UI-RULEBOOK C11 permits on an interactive control.
//
// It is a real <a> so the browser's own affordances work (open in a new tab,
// copy the address), with softNavigate on click so the History API move stays
// a soft one. Extracted from the apps screen because the account record shows
// the same tiles for one client's systems.

import * as React from "react"
import { ChevronRight, Lock } from "@shared/ui/icons"

import { softNavigate } from "@/lib/nav"
import { safeHref } from "@shared/web/rich-text"
import { RecordMark } from "@shared/web/record-mark"
import { appStageMark } from "@shared/app-stages"
import type { AppRow } from "@shared/types"
import { useT } from "@shared/web/language"

/** THE SQUARE AN APP IS KNOWN BY — its logo, or the stage mark it has always
 * drawn. It reads the two things an APP has that no other record does (its stage
 * mark, and its logo column) and hands them to the ONE mark every record on both
 * front doors is drawn with (`shared/web/record-mark.tsx`).
 *
 * It was that component first, alone, and everything the header there says about
 * a stored path outliving its bytes was learned here (web/test/app-mark.test.tsx,
 * which still holds this signature to it). What changed on 19 Aug 2026 is that
 * every OTHER record got the same treatment instead of one of thirteen others, so
 * the state, the `safeSrc` call and the `onError` fallback moved to where they
 * are shared and this became the two lines that are actually about an app. */
export function AppMark({
  app,
  size = "tile",
}: {
  app: AppRow
  size?: React.ComponentProps<typeof RecordMark>["size"]
}) {
  return <RecordMark picture={app.logoUrl} mark={appStageMark(app.stage)} name={app.name} size={size} />
}

export function AppTiles({
  apps,
  accountNames,
  /** the URL prefix we are standing in — "" at the top level, "/t/<teamId>"
   * inside a team, so a tile keeps the shape the reader arrived through */
  base = "",
}: {
  apps: AppRow[]
  accountNames: Map<string, string>
  base?: string
}) {
  const t = useT()
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {apps.map((app) => {
        const client = app.accountId ? (accountNames.get(app.accountId) ?? t("A client")) : t("Ours")
        // Through the seam even though every part of it is ours: `base` is a
        // literal or "/t/<teamId>" and the id is a ULID, so nothing here is
        // typed by anybody. The rule is positional on purpose — a URL that
        // reaches an attribute without passing the checker is the shape that
        // eventually carries one that WAS typed.
        const href = safeHref(`${base}/apps/${app.id}`) ?? "/apps"
        return (
          <a
            key={app.id}
            href={href}
            onClick={(e) => {
              // Let the browser take a modified click (new tab, new window) —
              // only a plain left click is ours to intercept.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              softNavigate(href)
            }}
            className="bg-card hover:bg-muted flex items-center gap-2 rounded-xl p-4 transition-colors duration-200"
          >
            {/* The mark is aria-hidden and the stage WORD is on the heading above
                it, which is the pair UI-CONVENTIONS §5 requires of a type mark.
                A logo carries no meaning the name does not already say, so it is
                hidden from a screen reader for exactly the same reason. */}
            <AppMark app={app} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{app.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {app.active ? client : `${client} · ${t("archived")}`}
              </span>
            </span>
            {/* THE CHEVRON IS A PROMISE THAT THIS OPENS. On an app the reader is
                not on, it opens onto a refusal — so the tile says so before the
                click rather than after it. Four bugs this month were controls
                that looked like they worked and did not; this is the same shape
                caught early. An admin and anybody on the app see the chevron,
                which is nearly everyone, so the lock is rare by design. */}
            {app.canOpen ? (
              <ChevronRight className="text-muted-foreground size-4 shrink-0" />
            ) : (
              <Lock
                className="text-muted-foreground size-4 shrink-0"
                aria-label={t("You're not on this app")}
              />
            )}
          </a>
        )
      })}
    </div>
  )
}
