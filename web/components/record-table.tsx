"use client"

// A TABLE WHOSE COLUMN HEADERS ACTUALLY ORDER IT.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
//
// The library can draw this table; it cannot sort it, and the failure is silent
// in the worst possible way — the header lights up and the rows do not move.
//
// `DataTable` keeps the header's choice in its OWN state and pushes it down to
// `CollectionFrame` as a config prop (`sortBy: sort?.key ?? config.sortBy`). The
// frame seeds its sort from that prop ONCE, at mount — `React.useState(config.sortBy)`
// — and from then on orders by its own state and ignores the prop entirely. So
// the value the header writes is read by nobody. Every column of a `display:
// "table"` recipe is `sortable: true` (the engine hard-codes it), so both tables
// in the agency app drew five and six live-looking controls that changed nothing.
//
// That is worse than having no control: a person who sorts by Deadline and sees
// the rows sit still does not conclude the button is broken, they conclude the
// DATA is wrong. Reported from the deployed build: "the sort actually doesn't
// work… I don't see the order changing, even though I can see that there are
// different values." UI-GAPS #22(b) has the library's half of the fix (a
// `serverSide` + `onSortChange` seam on `DataTable`, the same shape #15 asks for
// about search); this is the host's half, and it is a composition of shipped
// primitives, not a fork — the same category as `paged-find.tsx`,
// `record-picker.tsx` and `record-calendar.tsx`, each of which exists because a
// library component owns a decision the host has to make.
//
// The CHROME is still the library's. `CollectionFrame` keeps doing the search
// box, the facets, the count and the pager exactly as before; the only thing
// taken off it is the ORDER, which it was not doing. The rows are ordered before
// the frame ever sees them, and the frame's own sort stays at its default (`""`),
// so `selectRows` leaves the sequence alone. Filtering and searching preserve
// order, so "sort then narrow" and "narrow then sort" are the same list.
//
// ── A HEADER REPLACES THE ORDER, IT DOES NOT REFINE IT ────────────────────────
//
// The doors order deliberately — tasks come back priority-first, the meetings
// list comes back newest-first — and the question was whether a column header
// should sort WITHIN that or instead of it. It replaces it, and the bug report is the
// argument: what the owner was looking at when he said the sort was broken was
// 80 tasks ascending by deadline with one priority-4 row pinned above them,
// which is exactly what "sort within the door's order" looks like from a chair.
// A column header is an instruction about that column and nothing else.
//
// The default is not lost, it is one press away: asc → desc → off, and "off" is
// the order the door handed us. Both tables behave identically.
//
// ── WHO DECIDES THE ORDER ─────────────────────────────────────────────────────
//
// The same split SEARCH.md draws for the search box, one control along:
//
//   • BOUNDED (Tasks) — the whole collection is in the browser, so ordering it
//     here is honest and free. Pass no `order` and this owns it.
//   • PAGED (the meetings list's All) — the browser holds page one, so ordering it here
//     would arrange fifty of 254 rows and call the result sorted. Pass the
//     `order` off `<PagedFind>` and a header click becomes a question for the
//     DOOR, landing in its own cache key at page one like every other one.
//     A column the door has no name for carries no `sort` and is not clickable:
//     a plain header is honest, and a live-looking one is what this file exists
//     to stop.

import * as React from "react"

import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "@shared/ui/foundations/icons"

import { CollectionFrame } from "@shared/web/screen-engine/collection-frame"
import type { ScreenActionContext } from "@shared/web/screen-engine/screen-renderer"
import type { CollectionConfig } from "@shared/web/screen-engine/config"
import { gateState, type ScreenRecipe, type ScreenRights } from "@shared/web/screen-engine/recipe"
import { Button } from "@shared/ui/components/button/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shared/ui/components/dropdown-menu/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shared/ui/components/table/table"

import type { CollectionOrder } from "@/lib/collection-sorts"

export type TableRowData = Record<string, unknown>

/** One column. `label` is already in the reader's language (the recipe's own,
 * through `translateRecipe`), so a header costs the catalogue nothing (R28).
 *
 * `sort` is the name to order by, and its ABSENCE is a decision: this column
 * draws a plain header. On a bounded table it is the row key, because the
 * browser is doing the comparing; on a paged one it is the door's own menu name
 * (`COLLECTION_SORTS`), because the door is.
 *
 * `defaultDir` is where the FIRST press lands, the same knob a `SortOption`
 * carries and for the same reason: "most recent first" is what somebody means by
 * a date column, and opening on the oldest row reads as broken. */
export type TableColumn = {
  key: string
  label: string
  sort?: string
  defaultDir?: "asc" | "desc"
}

/** Blanks go LAST, whichever way the column is pointing.
 *
 * Every cell here is a shaped string and an absent value is rendered "—", so
 * without this a descending sort on a column that is mostly empty opens with a
 * screen of em-dashes — the sort worked and the answer is useless. Sorting is
 * for finding the extremes of what you HAVE. */
const isBlank = (v: unknown) => v == null || v === "" || v === "—"

/** The comparison. Text, numerically aware — `numeric: true` is what makes
 * "10 · Do it now" fall after "9 · …" and costs nothing on the columns that are
 * already lexical (a date spelled `2026-04-14` compares segment by segment, and
 * correctly, which is the whole reason `formatDateSortable` exists). */
function compare(a: unknown, b: unknown): number {
  if (isBlank(a)) return isBlank(b) ? 0 : 1
  if (isBlank(b)) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** The rows, in the asked-for order. A COPY — the caller's array is the shaped
 * list other things on the screen read. */
function ordered<T extends TableRowData>(rows: T[], by: string, dir: "asc" | "desc"): T[] {
  if (!by) return rows
  const sign = dir === "desc" ? -1 : 1
  // Blanks stay last in BOTH directions, so they are pushed out of the reversal.
  return rows
    .slice()
    .sort((x, y) =>
      isBlank(x[by]) || isBlank(y[by]) ? compare(x[by], y[by]) : compare(x[by], y[by]) * sign
    )
}

/** A trailing ⋯ entry. */
export type TableAction<T> = { label: string; onSelect: (row: T) => void }

/** The recipe's own actions, minus the ones this caller may not see — the same
 * two lines `ScreenRenderer` runs before it builds the ⋯ column, kept because a
 * recipe's actions are what a TEAM may OVERRIDE (`POST /api/tenancy/config/screens`).
 * A table that simply dropped them would quietly un-ship something somebody
 * configured, and nothing would say so. */
export function visibleActions<T extends TableRowData>(
  recipe: ScreenRecipe,
  rights: ScreenRights,
  onAction: (actionId: string, ctx: ScreenActionContext) => void
): TableAction<T>[] {
  return recipe.actions
    .filter((a) => gateState(rights, a.gate) !== "hidden")
    .map((a) => ({
      label: a.label,
      onSelect: (row: T) => onAction(a.id, { id: String(row.id ?? ""), record: row }),
    }))
}

export function RecordTable<T extends TableRowData>({
  columns,
  rows,
  config,
  order,
  actions = [],
  onRowClick,
  className,
}: {
  columns: TableColumn[]
  rows: T[]
  /** the collection's own chrome — the tuned recipe's config, so the search box,
   * the facets, the empty line and the count are the recipe's decisions, not
   * this component's */
  config: CollectionConfig
  /** WHO OWNS THE ORDER. Absent = this does, in the browser, over the whole
   * bounded collection. Present = somebody else does (the door, through
   * `<PagedFind>`), and the rows arrive already ordered. */
  order?: CollectionOrder
  actions?: TableAction<T>[]
  onRowClick?: (row: T) => void
  className?: string
}) {
  const [own, setOwn] = React.useState<{ by: string; dir: "asc" | "desc" } | null>(null)
  const live: CollectionOrder = order ?? {
    by: own?.by ?? "",
    dir: own?.dir ?? "asc",
    set: (by, dir) => setOwn(by ? { by, dir } : null),
  }
  // When somebody else owns the order, the rows they hand over ARE the order.
  const shown = order ? rows : ordered(rows, live.by, live.dir)

  /** A column cycles through its TWO directions and then back to the order the
   * collection arrived in. Three presses, three different lists.
   *
   * Written as "away from the column's own default, then off" rather than
   * "asc, desc, off" because of the meetings list: it opens ordered by When, newest
   * first, so a fixed asc→desc→off cycle would spend its third press putting the
   * screen back into the state it was already in. A dead press on a control that
   * just worked twice is how somebody decides it is unreliable. */
  const toggle = (c: TableColumn) => {
    const name = c.sort as string
    const lands = c.defaultDir ?? "asc"
    if (live.by !== name) return live.set(name, lands)
    if (live.dir === lands) return live.set(name, lands === "asc" ? "desc" : "asc")
    return live.set(null, lands)
  }

  return (
    <CollectionFrame
      config={config}
      data={shown}
      searchKeys={columns.map((c) => c.key) as (keyof T)[]}
      className={className}
      renderItems={(page) => (
        <div className="overflow-hidden rounded-[var(--radius)] border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => {
                  const active = c.sort != null && live.by === c.sort
                  return (
                    <TableHead
                      key={c.key}
                      // The standard way a table says which column it is in
                      // order by — so a screen reader hears it without the
                      // arrow needing a sentence of its own to explain it.
                      aria-sort={
                        active ? (live.dir === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {c.sort == null ? (
                        c.label
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(c)}
                          className="hover:text-foreground motion-hover inline-flex items-center gap-1"
                        >
                          {c.label}
                          {active ? (
                            live.dir === "asc" ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      )}
                    </TableHead>
                  )
                })}
                {actions.length > 0 && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.map((row, i) => (
                <TableRow
                  key={String(row.id ?? i)}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  className={
                    (i % 2 === 1 ? "bg-muted" : "") +
                    (onRowClick
                      ? "cursor-pointer"
                      : "")
                  }
                >
                  {columns.map((c) => (
                    <TableCell key={c.key}>{row[c.key] as React.ReactNode}</TableCell>
                  ))}
                  {actions.length > 0 && (
                    // Reaching the menu must not also open the record.
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.map((a) => (
                            <DropdownMenuItem key={a.label} onSelect={() => a.onSelect(row)}>
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    />
  )
}
