"use client"

// StatGrid — a row of "big number" metric cards (Revenue, Active Users…),
// each with an optional up/down/flat delta. Glide calls this "Big Numbers".

import * as React from "react"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Card } from "../../primitives/card/card"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface StatGridConfig extends BaseConfig {
  /** Cards per row at the widest breakpoint (responsive below). */
  columns: 2 | 3 | 4
  /** Show the delta line under each value. */
  showDelta: boolean
}

export const defaultStatGridConfig: StatGridConfig = {
  ...defaultBaseConfig,
  columns: 3,
  showDelta: true,
}

/* ------------------------------ component ------------------------------ */

export interface StatItem {
  id: string
  label: string
  value: string
  delta: string
  trend: "up" | "down" | "flat"
  /** Optional glyph for the card's top-right — a lucide icon, a type mark, a
   *  logo. Decorative: the label always says what the number is, so pass a node
   *  that is already `aria-hidden` and the card adds no label of its own.
   *  Omit and the card is exactly as it was. */
  icon?: React.ReactNode
}

const columnClass: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
}

const trendUI = {
  up: { Icon: TrendingUp, className: "text-success" },
  down: { Icon: TrendingDown, className: "text-destructive" },
  flat: { Icon: Minus, className: "text-muted-foreground" },
}

function StatGrid({
  items,
  config,
  className,
}: {
  items: StatItem[]
  config: StatGridConfig
  className?: string
}) {
  if (!useIsVisible(config)) return null
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        columnClass[config.columns],
        className
      )}
    >
      {items.map((s) => {
        const { Icon, className: trendClass } = trendUI[s.trend]
        return (
          <Card key={s.id} className="min-w-0 p-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              {/* The glyph sits BESIDE the label, not above the number: the
                  label truncates and the glyph never shrinks, so a long label
                  can't push it out of the card. */}
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs tracking-wide text-muted-foreground uppercase">
                  {s.label}
                </span>
                {s.icon != null && (
                  <span className="shrink-0 text-muted-foreground [&_svg]:size-4">
                    {s.icon}
                  </span>
                )}
              </div>
              {/* never overflow: shrink + ellipsis if the value is too wide */}
              <span
                className="truncate text-2xl font-medium tabular-nums"
                title={s.value}
              >
                {s.value}
              </span>
              {config.showDelta && (
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1 text-xs",
                    trendClass
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{s.delta}</span>
                </span>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export { StatGrid }
