"use client"

// Kanban — a board of columns (e.g. To do / In progress / Done). Drag a card
// into another column to change its status. Which field defines the columns,
// and what each card shows, are all driven by `config`.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Badge } from "../../primitives/badge/badge"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

export interface KanbanColumnDef {
  /** The value of `groupBy` that lands a card in this column. */
  value: string
  /** The column heading shown to the user. */
  label: string
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration".
 * For the optional card slots, use an empty string ("") to hide them. */
export interface KanbanConfig extends BaseConfig {
  /** Record field whose value sorts a card into a column (e.g. "status"). */
  groupBy: string
  /** The columns, in display order. */
  columns: KanbanColumnDef[]
  /** Record field used as the card's title. */
  titleField: string
  /** Record field for the card's subtitle ("" = none). */
  subtitleField: string
  /** Record field shown as a badge on the card ("" = none). */
  badgeField: string
  /** Show a count badge next to each column heading. */
  showCount: boolean
  /** Placeholder shown in an empty column. */
  emptyColumnText: string
}

export const defaultKanbanConfig: KanbanConfig = {
  ...defaultBaseConfig,
  groupBy: "status",
  columns: [],
  titleField: "title",
  subtitleField: "",
  badgeField: "",
  showCount: true,
  emptyColumnText: "Drop here",
}

/* ------------------------------ component ------------------------------ */

export interface KanbanProps<
  T extends { id: string } & Record<string, unknown>,
> {
  data: T[]
  /** Called with the next data after a card is dragged to a new column. */
  onDataChange: (next: T[]) => void
  config: KanbanConfig
  className?: string
}

function Kanban<T extends { id: string } & Record<string, unknown>>({
  data,
  onDataChange,
  config,
  className,
}: KanbanProps<T>) {
  // Which card is currently being dragged (for the drop target + dim effect).
  const [draggingId, setDraggingId] = React.useState<string | null>(null)

  function moveTo(id: string, columnValue: string) {
    onDataChange(
      data.map((row) =>
        row.id === id ? { ...row, [config.groupBy]: columnValue } : row
      )
    )
  }

  if (!useIsVisible(config)) return null

  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-2", className)}>
      {config.columns.map((col) => {
        const cards = data.filter(
          (row) => String(row[config.groupBy]) === col.value
        )
        return (
          <div
            key={col.value}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggingId) moveTo(draggingId, col.value)
              setDraggingId(null)
            }}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2"
          >
            <div className="flex items-center justify-between px-1 py-1 text-sm font-medium">
              <span>{col.label}</span>
              {config.showCount && (
                <Badge variant="secondary">{cards.length}</Badge>
              )}
            </div>

            {cards.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDraggingId(card.id)}
                onDragEnd={() => setDraggingId(null)}
                className={cn(
                  "cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-ring active:cursor-grabbing",
                  draggingId === card.id && "opacity-50"
                )}
              >
                <div className="text-sm font-medium">
                  {String(card[config.titleField] ?? "")}
                </div>
                {config.subtitleField !== "" && (
                  <div className="text-xs text-muted-foreground">
                    {String(card[config.subtitleField] ?? "")}
                  </div>
                )}
                {config.badgeField !== "" &&
                  card[config.badgeField] != null && (
                    <div className="mt-2">
                      <Badge variant="secondary">
                        {String(card[config.badgeField])}
                      </Badge>
                    </div>
                  )}
              </div>
            ))}

            {cards.length === 0 && (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                {config.emptyColumnText}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { Kanban }
