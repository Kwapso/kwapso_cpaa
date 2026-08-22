"use client"

// Detail view — shows ONE record as labelled fields (a profile panel, an
// item's "details" pane, etc.). You choose which fields appear, their labels,
// how each is formatted, and whether to lay them out in one or two columns.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Badge } from "../../primitives/badge/badge"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

export type DetailFieldType = "text" | "number" | "badge" | "date"

export interface DetailField {
  key: string
  label: string
  type: DetailFieldType
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface DetailViewConfig extends BaseConfig {
  fields: DetailField[]
  /** 1 = stacked, 2 = two-column grid. */
  columns: 1 | 2
}

export const defaultDetailViewConfig: DetailViewConfig = {
  ...defaultBaseConfig,
  fields: [],
  columns: 2,
}

/* ------------------------------ component ------------------------------ */

export interface DetailViewProps<T extends Record<string, unknown>> {
  record: T
  config: DetailViewConfig
  className?: string
}

function DetailView<T extends Record<string, unknown>>({
  record,
  config,
  className,
}: DetailViewProps<T>) {
  if (!useIsVisible(config)) return null
  return (
    <dl
      className={cn(
        "grid w-full gap-x-6 gap-y-4",
        config.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        className
      )}
    >
      {config.fields.map((f) => {
        const value = record[f.key]
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {f.label}
            </dt>
            <dd
              className={cn("text-sm", f.type === "number" && "tabular-nums")}
            >
              {f.type === "badge" ? (
                <Badge variant="secondary">{String(value ?? "")}</Badge>
              ) : (
                String(value ?? "")
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export { DetailView }
