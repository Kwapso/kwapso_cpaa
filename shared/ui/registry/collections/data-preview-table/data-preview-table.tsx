"use client"

// DataPreviewTable — a bounded, scrollable preview of rows about to be written
// (the import "preview before write" step). Column headers, a row count, zebra
// rows, and an optional per-row issue marker. Scrolls INSIDE its own box (never
// the page). Flat, token-driven, dark-mode.

import * as React from "react"
import { TriangleAlert } from "lucide-react"

import { cn } from "../../../lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../primitives/table/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../primitives/tooltip/tooltip"

function DataPreviewTable({
  columns,
  rows,
  totalCount,
  issues,
  className,
}: {
  columns: string[]
  rows: React.ReactNode[][]
  /** The TOTAL number of rows to be written (rows shown may be a sample). */
  totalCount: number
  /** Per-row issue message (index-aligned with `rows`); falsy = no issue. */
  issues?: (string | null | undefined)[]
  className?: string
}) {
  const issueCount = issues?.filter(Boolean).length ?? 0

  return (
    <TooltipProvider>
      <div className={cn("flex w-full flex-col gap-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Previewing {rows.length} of {totalCount.toLocaleString()} rows
          </span>
          {/* `warning-strong`, not `warning`: --warning is the FILL tone (badges
              carry near-black text ON it) and reads 1.92:1 as text on a light
              surface. --warning-strong is the same amber tuned for text/icons. */}
          {issueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-warning-strong">
              <TriangleAlert className="size-3.5" aria-hidden /> {issueCount}{" "}
              {issueCount === 1 ? "issue" : "issues"}
            </span>
          )}
        </div>

        {/* The Table primitive already provides a horizontal scroller; cap the
            height so long previews scroll vertically inside this box. */}
        <div className="max-h-80 overflow-y-auto rounded-xl border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {issues && <TableHead className="w-8" />}
                {columns.map((c, i) => (
                  <TableHead key={i} className="whitespace-nowrap">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, r) => {
                const issue = issues?.[r]
                return (
                  <TableRow
                    key={r}
                    className={cn(r % 2 === 1 && "bg-muted/40")}
                  >
                    {issues && (
                      <TableCell className="py-2">
                        {issue ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex"
                                aria-label={`Issue: ${issue}`}
                              >
                                {/* text tone, not the fill tone — see above */}
                                <TriangleAlert className="size-4 text-warning-strong" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{issue}</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    )}
                    {row.map((cell, c) => (
                      <TableCell key={c} className="py-2 whitespace-nowrap">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  )
}

export { DataPreviewTable }
