"use client"

// APP TILES — one system, as a thing you recognise rather than a line you read.
//
// UI-RULEBOOK K9 allows a card grid exactly where a record carries an image, and
// G3 says the type mark sits in a rounded square where a logo would. An app has
// both: its stage mark today, and a real logo the day the column exists. So the
// square is the tile's subject and the words underneath are two lines at most —
// the name, and the client (K1).
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

import { ChevronRight } from "lucide-react"

import { softNavigate } from "@/lib/nav"
import { safeHref } from "@shared/web/rich-text"
import { appStageMark } from "@shared/app-stages"
import type { AppRow } from "@shared/types"
import { useT } from "@shared/web/language"

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
            className="bg-card hover:bg-muted flex items-center gap-3 rounded-xl p-4 transition-colors duration-200"
          >
            {/* The mark is aria-hidden and the stage WORD is on the heading above
                it, which is the pair UI-CONVENTIONS §5 requires of a type mark. */}
            <span
              aria-hidden
              className="bg-muted grid size-12 shrink-0 place-items-center rounded-xl text-2xl leading-none"
            >
              {appStageMark(app.stage) || app.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{app.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {app.active ? client : `${client} · ${t("archived")}`}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </a>
        )
      })}
    </div>
  )
}
