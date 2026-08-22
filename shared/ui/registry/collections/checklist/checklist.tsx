"use client"

// Checklist — a list of items you can tick off, with an optional progress bar.
// Hand it items + an onChange and it manages the checked state for you.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Checkbox } from "../../primitives/checkbox/checkbox"
import { useIsVisible } from "../../primitives/visibility/visibility"
import { Progress } from "../../primitives/progress/progress"

/* ------------------------------- config ------------------------------- */

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface ChecklistConfig extends BaseConfig {
  /** Show a progress bar with the done/total count. */
  showProgress: boolean
  /** Strike through and mute items once completed. */
  strikeCompleted: boolean
}

export const defaultChecklistConfig: ChecklistConfig = {
  ...defaultBaseConfig,
  showProgress: true,
  strikeCompleted: true,
}

/* ------------------------------ component ------------------------------ */

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

function Checklist({
  items,
  onChange,
  config,
  className,
}: {
  items: ChecklistItem[]
  onChange: (next: ChecklistItem[]) => void
  config: ChecklistConfig
  className?: string
}) {
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  function toggle(id: string, checked: boolean) {
    onChange(items.map((i) => (i.id === id ? { ...i, done: checked } : i)))
  }

  if (!useIsVisible(config)) return null

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {config.showProgress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {done}/{items.length} done
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      )}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
              <Checkbox
                checked={item.done}
                onCheckedChange={(c) => toggle(item.id, c === true)}
              />
              <span
                className={cn(
                  "text-sm",
                  config.strikeCompleted &&
                    item.done &&
                    "text-muted-foreground line-through"
                )}
              >
                {item.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

export { Checklist }
