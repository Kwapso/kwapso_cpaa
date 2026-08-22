"use client"

// Description list — a flat label/value block for an Overview / metadata panel
// (the kind apps hand-build on a record-detail screen). Empty rows drop out, so
// you can pass the full field set and only the populated ones render. Flat by
// default (no card surface), config-driven, built from tokens only.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

export interface DescriptionItem {
  label: string
  /** Any node. Rows whose value is empty ("" / null / undefined / false) drop. */
  value: React.ReactNode
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface DescriptionListConfig extends BaseConfig {
  /** 1 = stacked, 2 = two-column grid. */
  columns: 1 | 2
  /** Drop rows whose value is empty. */
  hideEmpty: boolean
  /** "none" = flat (default, no card); "card" = wrap in a bordered surface. */
  surface: "card" | "none"
}

export const defaultDescriptionListConfig: DescriptionListConfig = {
  ...defaultBaseConfig,
  columns: 2,
  hideEmpty: true,
  surface: "none",
}

function isEmptyValue(v: React.ReactNode): boolean {
  return v == null || v === "" || v === false
}

/* ------------------------------ component ------------------------------ */

function DescriptionList({
  items,
  config,
  className,
}: {
  items: DescriptionItem[]
  config: DescriptionListConfig
  className?: string
}) {
  if (!useIsVisible(config)) return null

  const rows = config.hideEmpty
    ? items.filter((i) => !isEmptyValue(i.value))
    : items

  return (
    <dl
      className={cn(
        "grid w-full gap-x-6 gap-y-4",
        config.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        config.surface === "card" && "rounded-xl border bg-card p-4",
        className
      )}
    >
      {rows.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          {/* break-words keeps long values from forcing horizontal scroll. */}
          <dd className="text-sm break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export { DescriptionList }
