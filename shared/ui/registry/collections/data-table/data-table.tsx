"use client"

// DataTable — a sortable, searchable table. It renders THROUGH CollectionFrame,
// so it shares the one search/filter/sort/limit/pagination engine (lib/collection
// selectRows) with every other collection — no parallel system. DataTable keeps
// its own interactive column-sort (click a header) by threading that choice into
// the config it hands the frame; everything else (search box, filter facets,
// pagination, "Showing X of Y", empty state) is the frame's.

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react"

import {
  type CollectionConfig,
  defaultCollectionConfig,
} from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Badge } from "../../primitives/badge/badge"
import { Button } from "../../primitives/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../primitives/dropdown-menu/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../primitives/table/table"
import {
  SPACER_ATTR,
  useVirtualRows,
} from "../../primitives/use-virtual-rows/use-virtual-rows"
import { CollectionFrame } from "../collection-frame/collection-frame"

/* ------------------------------- config ------------------------------- */

export type ColumnType = "text" | "number" | "badge" | "date"
export type DataTableDensity = "comfortable" | "compact"
export type Align = "left" | "center" | "right"

export interface DataTableColumn {
  /** Key into each row object. */
  key: string
  header: string
  /** Drives rendering + sort behavior. */
  type: ColumnType
  sortable: boolean
  align: Align
}

/** Extends CollectionConfig so the table inherits the shared collection knobs
 * (searchable, searchPlaceholder, filter, userFilter, filterFacets, limit,
 * itemsPerPage, showCount, emptyText…) on top of its own table-specific ones.
 * Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface DataTableConfig extends CollectionConfig {
  columns: DataTableColumn[]
  /** Zebra-striped rows. */
  striped: boolean
  density: DataTableDensity
  /** Trailing actions (⋯) column — supply `actions` to populate it. */
  rowActions: boolean
  /** "card" = rounded, bordered surface (default); "none" = flat, no
   *  border/background — for apps whose design language has no card surfaces. */
  surface: "card" | "none"
}

export const defaultDataTableConfig: DataTableConfig = {
  ...defaultCollectionConfig,
  columns: [],
  striped: true,
  density: "comfortable",
  rowActions: false,
  surface: "card",
  // table-friendly default; CollectionConfig's is "Nothing here yet."
  emptyText: "No results.",
}

/* ------------------------------ component ------------------------------ */

export interface RowAction<T> {
  label: string
  onSelect: (row: T) => void
}

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[]
  config: DataTableConfig
  actions?: RowAction<T>[]
  /** Opt-in: makes each row an activatable, keyboard-accessible control
   *  (click / Enter / Space) for "tap row → open detail". The trailing actions
   *  menu and any interactive cell stop propagation, so tapping ⋯ never also
   *  fires this. Mirrors the List collection's `onItemClick`. */
  onRowClick?: (row: T) => void
  /** Windowed rendering — only the rows near the viewport go in the DOM. Turns
   *  itself on past 100 rows. Note this applies to the rows the frame HANDS the
   *  table: with `itemsPerPage` set, pagination has already bounded them and
   *  windowing simply never engages. */
  virtualize?: boolean
  className?: string
}

const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

/** The rows, windowed.
 *
 * Its own component because the frame hands rows to a render callback, and a
 * hook cannot be called from inside one. Two things table layout forces here
 * that the list and grid don't need:
 *   • SPACER ROWS, not padding — padding on a `tbody` is not rendered in table
 *     layout, so the empty space has to be a real `<tr>` with a height.
 *   • The ABSOLUTE row index for striping. Using the sliced index would restart
 *     the zebra pattern at every window, so stripes would visibly flip as you
 *     scroll.
 */
function DataTableRows<T extends Record<string, unknown>>({
  rows,
  config,
  actions,
  onRowClick,
  virtualize,
}: {
  rows: T[]
  config: DataTableConfig
  actions: RowAction<T>[]
  onRowClick?: (row: T) => void
  virtualize?: boolean
}) {
  const pad = config.density === "compact" ? "py-1.5" : "py-3"
  const rowInteractive = Boolean(onRowClick)
  // A comfortable row is ~48px, a compact one ~30px. First paint only.
  const v = useVirtualRows({
    count: rows.length,
    estimatePitch: config.density === "compact" ? 30 : 48,
    enabled: virtualize,
  })
  const span = config.columns.length + (config.rowActions ? 1 : 0)
  const spacer = (height: number, key: string) => (
    <tr key={key} {...{ [SPACER_ATTR]: "" }} aria-hidden>
      <td colSpan={span} style={{ height, padding: 0, border: 0 }} />
    </tr>
  )

  return (
    <TableBody ref={v.containerRef}>
      {v.active && v.padTop > 0 && spacer(v.padTop, "pad-top")}
      {rows.slice(v.start, v.end).map((row, sliceIndex) => {
        const i = v.start + sliceIndex
        return (
          <TableRow
            key={i}
            // Link-like row: a keyboard-accessible control when onRowClick is set.
            role={rowInteractive ? "button" : undefined}
            tabIndex={rowInteractive ? 0 : undefined}
            onClick={rowInteractive ? () => onRowClick?.(row) : undefined}
            onKeyDown={
              rowInteractive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onRowClick?.(row)
                    }
                  }
                : undefined
            }
            className={cn(
              config.striped && i % 2 === 1 && "bg-muted/40",
              rowInteractive &&
                "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            {config.columns.map((c) => (
              <TableCell
                key={c.key}
                className={cn(
                  pad,
                  alignClass[c.align],
                  c.type === "number" && "tabular-nums"
                )}
              >
                {c.type === "badge" ? (
                  <Badge variant="secondary">{String(row[c.key] ?? "")}</Badge>
                ) : (
                  (row[c.key] as React.ReactNode)
                )}
              </TableCell>
            ))}
            {config.rowActions && (
              // stopPropagation: tapping/keying the ⋯ menu must NOT also
              // fire the row-open. Covers click + keyboard activation.
              <TableCell
                className={cn(pad, "text-right")}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {actions.map((a) => (
                      <DropdownMenuItem
                        key={a.label}
                        onSelect={() => a.onSelect(row)}
                      >
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            )}
          </TableRow>
        )
      })}
      {v.active && v.padBottom > 0 && spacer(v.padBottom, "pad-bottom")}
    </TableBody>
  )
}

function DataTable<T extends Record<string, unknown>>({
  data,
  config,
  actions = [],
  onRowClick,
  virtualize,
  className,
}: DataTableProps<T>) {
  // Interactive column-sort lives here; we feed it into the frame's config so
  // selectRows does the sort BEFORE pagination (clicking a header re-runs it).
  const [sort, setSort] = React.useState<{
    key: string
    dir: "asc" | "desc"
  } | null>(null)

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key === key
        ? s.dir === "asc"
          ? { key, dir: "desc" }
          : null // asc → desc → off (back to config default)
        : { key, dir: "asc" }
    )
  }

  // The config the frame runs: our interactive sort overrides the config's.
  const frameConfig = {
    ...config,
    sortBy: sort?.key ?? config.sortBy,
    sortDir: sort?.dir ?? config.sortDir,
  }

  return (
    <CollectionFrame
      config={frameConfig as CollectionConfig}
      data={data}
      searchKeys={config.columns.map((c) => c.key) as (keyof T)[]}
      className={className}
      renderItems={(rows) => (
        <div
          className={cn(
            "overflow-hidden",
            config.surface === "card" && "rounded-xl border"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {config.columns.map((c) => {
                  const active = sort?.key === c.key
                  return (
                    <TableHead key={c.key} className={alignClass[c.align]}>
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {c.header}
                          {active ? (
                            sort?.dir === "asc" ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  )
                })}
                {config.rowActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <DataTableRows
              rows={rows}
              config={config}
              actions={actions}
              onRowClick={onRowClick}
              virtualize={virtualize}
            />
          </Table>
        </div>
      )}
    />
  )
}

export { DataTable }
