"use client"

// Activity feed — a flat, newest-first timeline of events (who did what, when).
// The "recent activity" block apps hand-build on a record-detail screen. Flat by
// default (no card surface), config-driven, built from tokens only, and it wraps
// long text rather than scrolling sideways.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

export interface ActivityItem {
  id: string
  description: React.ReactNode
  /** Who did it (optional). */
  actor?: string
  /** When it happened (optional). An ISO/sortable string for newest-first order. */
  timestamp?: string
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface ActivityFeedConfig extends BaseConfig {
  /** Sort newest-first by `timestamp` (descending). */
  newestFirst: boolean
  /** "none" = flat (default, no card); "card" = wrap in a bordered surface. */
  surface: "card" | "none"
  /** Shown when there's no activity. */
  emptyText: string
}

export const defaultActivityFeedConfig: ActivityFeedConfig = {
  ...defaultBaseConfig,
  newestFirst: true,
  surface: "none",
  emptyText: "No activity yet.",
}

/* ------------------------------ component ------------------------------ */

function ActivityFeed({
  items,
  config,
  className,
}: {
  items: ActivityItem[]
  config: ActivityFeedConfig
  className?: string
}) {
  if (!useIsVisible(config)) return null

  const rows = config.newestFirst
    ? [...items].sort((a, b) =>
        String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""))
      )
    : items

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "py-8 text-center text-sm text-muted-foreground",
          config.surface === "card" && "rounded-xl border bg-card",
          className
        )}
      >
        {config.emptyText}
      </div>
    )
  }

  return (
    <ol
      className={cn(
        "flex w-full flex-col",
        config.surface === "card" && "rounded-xl border bg-card p-4",
        className
      )}
    >
      {rows.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {/* timeline rail: a dot + a connecting line down to the next item */}
          <div className="flex flex-col items-center">
            <span
              className="mt-1 size-2 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            {i < rows.length - 1 && (
              <span className="w-px flex-1 bg-border" aria-hidden />
            )}
          </div>
          <div className="-mt-0.5 min-w-0 flex-1">
            <div className="text-sm break-words">{item.description}</div>
            {(item.actor || item.timestamp) && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.actor}
                {item.actor && item.timestamp ? " · " : ""}
                {item.timestamp}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export { ActivityFeed }
